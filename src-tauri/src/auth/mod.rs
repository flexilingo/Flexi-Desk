use tauri::State;
use crate::AppState;

pub mod google;

const SUPABASE_URL: &str = "https://api.flexilingo.com";
const SUPABASE_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZ2pnYnBlZWF1YWJsY2N2a2dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTE4NDIsImV4cCI6MjA4MTE2Nzg0Mn0.bim07d-SPrjViZ5qcugIGggfBd3iv0WF4RrdV3wgiTQ";

// ── DB helpers ─────────────────────────────────────────

fn lock_db<'a>(state: &'a State<'a, AppState>) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

fn store_token(conn: &rusqlite::Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO auth_tokens (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')",
        rusqlite::params![key, value],
    ).map_err(|e| format!("Token store error: {e}"))?;
    Ok(())
}

fn get_token(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM auth_tokens WHERE key = ?1",
        rusqlite::params![key],
        |row| row.get(0),
    ).ok()
}

// ── Types ──────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct AuthSession {
    pub access_token: String,
    pub refresh_token: String,
    pub user_id: String,
    pub email: String,
    pub expires_at: i64,
}

// ── OTP authentication ─────────────────────────────────

#[tauri::command]
pub async fn auth_send_otp(email: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{SUPABASE_URL}/functions/v1/auth?action=send-otp"))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "email": email }))
        .send()
        .await
        .map_err(|e| format!("Failed to send OTP: {e}"))?;

    if !resp.status().is_success() {
        let body: serde_json::Value = resp.json().await.unwrap_or_default();
        let code = body.get("code")
            .and_then(|v| v.as_str())
            .unwrap_or("SEND_OTP_FAILED");
        return Err(code.to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn auth_verify_otp(
    state: State<'_, AppState>,
    email: String,
    otp: String,
) -> Result<AuthSession, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{SUPABASE_URL}/functions/v1/auth?action=verify-otp"))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "email": email,
            "otp": otp,
            "signup_source": "tauri"
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to verify OTP: {e}"))?;

    if !resp.status().is_success() {
        let body: serde_json::Value = resp.json().await.unwrap_or_default();
        let code = body.get("code")
            .and_then(|v| v.as_str())
            .unwrap_or("VERIFY_OTP_FAILED");
        return Err(code.to_string());
    }

    let body: serde_json::Value = resp.json().await
        .map_err(|e| format!("Failed to parse verify response: {e}"))?;

    let session = parse_backend_auth_response(&body)?;

    let conn = lock_db(&state)?;
    let session_json = serde_json::to_string(&session)
        .map_err(|e| format!("Serialize error: {e}"))?;
    store_token(&conn, "session", &session_json)?;

    Ok(session)
}

// ── Session management ─────────────────────────────────

#[tauri::command]
pub async fn auth_refresh(
    state: State<'_, AppState>,
) -> Result<AuthSession, String> {
    refresh_session(&state.db, SUPABASE_URL, None).await
}

/// Serialises session refreshes so a burst of 401s triggers ONE refresh request.
/// Refresh tokens rotate: a second concurrent refresh with the old token would fail
/// and sign the user out.
static REFRESH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn read_session(db: &std::sync::Mutex<rusqlite::Connection>) -> Result<Option<AuthSession>, String> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {e}"))?;
    Ok(get_token(&conn, "session").and_then(|j| serde_json::from_str::<AuthSession>(&j).ok()))
}

/// Refreshes the stored session and persists it.
///
/// `stale_access_token` is the token that just got a 401. If, once we hold the lock,
/// the stored token differs, another call already refreshed and we reuse its result
/// instead of spending the (rotating) refresh token a second time.
async fn refresh_session(
    db: &std::sync::Mutex<rusqlite::Connection>,
    base_url: &str,
    stale_access_token: Option<&str>,
) -> Result<AuthSession, String> {
    let _guard = REFRESH_LOCK.lock().await;

    let current = read_session(db)?.ok_or("No session found")?;
    if let Some(stale) = stale_access_token {
        if current.access_token != stale {
            return Ok(current);
        }
    }

    if let Some(wait) = backoff_remaining(base_url) {
        return Err(format!("REFRESH_RETRY_LATER: retry in {}s", wait.as_secs().max(1)));
    }

    let resp = match reqwest::Client::new()
        .post(format!("{base_url}/auth/v1/token?grant_type=refresh_token"))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "refresh_token": current.refresh_token }))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            // Offline / DNS / timeout: the session is fine, try again later.
            note_refresh_failure(base_url, None);
            return Err(format!("Refresh request failed: {e}"));
        }
    };

    let status = resp.status();
    if !status.is_success() {
        let retry_after = resp
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.trim().parse::<u64>().ok());
        let text = resp.text().await.unwrap_or_default();
        // Only a definitive "this refresh token is not valid" ends the session. A 429
        // (shared IP, burst), 408, 5xx or any other failure keeps it and retries later.
        if refresh_token_rejected(status.as_u16(), &text) {
            reset_backoff(base_url);
            if let Ok(conn) = db.lock() {
                let _ = conn.execute("DELETE FROM auth_tokens WHERE key = 'session'", []);
            }
            return Err("Session expired. Please log in again.".to_string());
        }
        note_refresh_failure(base_url, retry_after);
        return Err(format!("Refresh failed ({})", status.as_u16()));
    }
    reset_backoff(base_url);

    let body: serde_json::Value = resp.json().await
        .map_err(|e| format!("Failed to parse refresh response: {e}"))?;
    let session = parse_supabase_auth_response(&body)?;

    let conn = db.lock().map_err(|e| format!("DB lock error: {e}"))?;
    // Compare-and-swap: only store if the session is still the one whose refresh token was
    // spent. If the user signed out (or signed in as someone else) while the request was in
    // flight, the response must not bring the old session back.
    match get_token(&conn, "session").and_then(|j| serde_json::from_str::<AuthSession>(&j).ok()) {
        None => return Err("Session expired. Please log in again.".to_string()),
        Some(stored) if stored.refresh_token != current.refresh_token => return Ok(stored),
        Some(_) => {}
    }
    let session_json = serde_json::to_string(&session)
        .map_err(|e| format!("Serialize error: {e}"))?;
    store_token(&conn, "session", &session_json)?;
    Ok(session)
}

// ── Refresh failure handling ───────────────────────────

/// Does this refresh response mean the refresh token itself is dead (400/401 with an
/// `invalid_grant`-like code), as opposed to "try again later"?
fn refresh_token_rejected(status: u16, body: &str) -> bool {
    if status != 400 && status != 401 {
        return false;
    }
    let body = body.to_lowercase();
    [
        "invalid_grant",
        "refresh_token_not_found",
        "refresh_token_already_used",
        "session_not_found",
        "session_expired",
        "invalid refresh token",
        "refresh token not found",
        "refresh token is not valid",
        "already used",
    ]
    .iter()
    .any(|code| body.contains(code))
}

/// Wait before the n-th consecutive retry (n starts at 1): 5 s, 10 s, 20 s ... capped at 5 min.
fn backoff_delay(failures: u32) -> std::time::Duration {
    let secs = 5u64.saturating_mul(1u64 << failures.saturating_sub(1).min(6));
    std::time::Duration::from_secs(secs.min(300))
}

/// Per auth server: (consecutive failures, no new request before this instant).
static REFRESH_BACKOFF: std::sync::LazyLock<
    std::sync::Mutex<std::collections::HashMap<String, (u32, std::time::Instant)>>,
> = std::sync::LazyLock::new(Default::default);

fn backoff_remaining(key: &str) -> Option<std::time::Duration> {
    let g = REFRESH_BACKOFF.lock().ok()?;
    g.get(key)?.1.checked_duration_since(std::time::Instant::now())
}

fn note_refresh_failure(key: &str, retry_after_secs: Option<u64>) {
    if let Ok(mut g) = REFRESH_BACKOFF.lock() {
        let failures = g.get(key).map_or(0, |e| e.0).saturating_add(1);
        let own = backoff_delay(failures);
        let wait = retry_after_secs
            .map(|s| std::time::Duration::from_secs(s.min(300)).max(own))
            .unwrap_or(own);
        g.insert(key.to_string(), (failures, std::time::Instant::now() + wait));
    }
}

fn reset_backoff(key: &str) {
    if let Ok(mut g) = REFRESH_BACKOFF.lock() {
        g.remove(key);
    }
}

#[tauri::command]
pub fn auth_get_session(
    state: State<'_, AppState>,
) -> Result<Option<AuthSession>, String> {
    let conn = lock_db(&state)?;
    match get_token(&conn, "session") {
        Some(json) => {
            let session: AuthSession = serde_json::from_str(&json)
                .map_err(|e| format!("Parse error: {e}"))?;
            Ok(Some(session))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn auth_logout(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute("DELETE FROM auth_tokens WHERE key = 'session'", [])
        .map_err(|e| format!("Logout error: {e}"))?;
    Ok(())
}

// ── Supabase Edge Function proxy ───────────────────────

/// Reads the stored session's access token, if the user is signed in.
///
/// Kept separate from `supabase_call` so other modules can build their own edge
/// requests without holding the DB lock across an `.await`.
pub fn stored_access_token(state: &State<'_, AppState>) -> Option<String> {
    stored_session(state).map(|s| s.access_token)
}

/// The signed-in session, if any. Callers need `user_id` to build storage paths.
pub fn stored_session(state: &State<'_, AppState>) -> Option<AuthSession> {
    let conn = state.db.lock().ok()?;
    get_token(&conn, "session").and_then(|json| serde_json::from_str::<AuthSession>(&json).ok())
}

/// Uploads bytes to a Supabase Storage bucket and returns the public URL.
///
/// Storage RLS lets a user write only under their own `{user_id}/` prefix, so
/// `object_path` must start with the signed-in user's id.
pub async fn storage_upload(
    access_token: &str,
    bucket: &str,
    object_path: &str,
    content_type: &str,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let url = format!("{SUPABASE_URL}/storage/v1/object/{bucket}/{object_path}");
    let resp = reqwest::Client::new()
        .post(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Content-Type", content_type)
        // The exam never overwrites a task's recording: each carries a timestamp.
        .header("x-upsert", "false")
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("Storage upload failed: {e}"))?;

    let status = resp.status().as_u16();
    if status >= 400 {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Storage upload failed ({status}): {body}"));
    }

    Ok(format!(
        "{SUPABASE_URL}/storage/v1/object/public/{bucket}/{object_path}"
    ))
}

/// Downloads an object from a PRIVATE Storage bucket with the user's own session,
/// so the bucket's owner-only policy is what grants access.
pub async fn storage_download(
    access_token: &str,
    bucket: &str,
    object_path: &str,
) -> Result<Vec<u8>, String> {
    let url = format!("{SUPABASE_URL}/storage/v1/object/authenticated/{bucket}/{object_path}");
    let resp = reqwest::Client::new()
        .get(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| format!("Storage download failed: {e}"))?;
    let status = resp.status().as_u16();
    if status >= 400 {
        return Err(format!("Storage download failed ({status})"));
    }
    resp.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("Storage download failed: {e}"))
}

#[tauri::command]
pub async fn supabase_call(
    state: State<'_, AppState>,
    method: String,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    call_edge_function_authed(&state.db, &method, &path, body).await
}

/// Edge-function call with the stored session. On HTTP 401 and a stored refresh
/// token it refreshes the session once, persists it and retries the request once.
/// Signed-out calls go out without a bearer token and are never retried.
pub async fn call_edge_function_authed(
    db: &std::sync::Mutex<rusqlite::Connection>,
    method: &str,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    call_with_refresh(db, SUPABASE_URL, method, path, body).await
}

async fn call_with_refresh(
    db: &std::sync::Mutex<rusqlite::Connection>,
    base_url: &str,
    method: &str,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let token = read_session(db)?.map(|s| s.access_token);
    let first = send_edge(base_url, token.as_deref(), method, path, body.clone()).await?;
    if first.status == 401 {
        if let Some(stale) = token.as_deref() {
            if let Ok(fresh) = refresh_session(db, base_url, Some(stale)).await {
                let retry = send_edge(base_url, Some(&fresh.access_token), method, path, body).await?;
                return retry.into_result();
            }
        }
    }
    first.into_result()
}

/// Raw call to a FlexiLingo edge function. `path` starts with `/` and may carry a
/// query string, e.g. `/get-content-status?video_id=...`. Does not refresh.
pub async fn call_edge_function(
    access_token: Option<String>,
    method: &str,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    send_edge(SUPABASE_URL, access_token.as_deref(), method, path, body)
        .await?
        .into_result()
}

/// Raw bytes from an edge function (audio, mostly), with the same 401 refresh + one
/// retry as `call_edge_function_authed`. Errors carry the HTTP status as `HTTP_<n>`.
#[tauri::command]
pub async fn supabase_fetch_bytes(
    state: State<'_, AppState>,
    path: String,
) -> Result<tauri::ipc::Response, String> {
    let bytes = fetch_bytes_with_refresh(&state.db, SUPABASE_URL, &path).await?;
    Ok(tauri::ipc::Response::new(bytes))
}

async fn fetch_bytes_with_refresh(
    db: &std::sync::Mutex<rusqlite::Connection>,
    base_url: &str,
    path: &str,
) -> Result<Vec<u8>, String> {
    let token = read_session(db)?.map(|s| s.access_token);
    let (mut status, mut bytes) = send_edge_bytes(base_url, token.as_deref(), path).await?;
    if status == 401 {
        if let Some(stale) = token.as_deref() {
            if let Ok(fresh) = refresh_session(db, base_url, Some(stale)).await {
                (status, bytes) = send_edge_bytes(base_url, Some(&fresh.access_token), path).await?;
            }
        }
    }
    if status >= 400 {
        return Err(format!("HTTP_{status}"));
    }
    Ok(bytes)
}

async fn send_edge_bytes(
    base_url: &str,
    access_token: Option<&str>,
    path: &str,
) -> Result<(u16, Vec<u8>), String> {
    let mut req = reqwest::Client::new()
        .get(format!("{base_url}/functions/v1{path}"))
        .header("apikey", SUPABASE_ANON_KEY);
    if let Some(token) = access_token {
        req = req.header("Authorization", format!("Bearer {token}"));
    }
    let resp = req.send().await.map_err(|e| format!("API request failed: {e}"))?;
    let status = resp.status().as_u16();
    let bytes = resp.bytes().await.map_err(|e| format!("Failed to read response: {e}"))?;
    Ok((status, bytes.to_vec()))
}

struct EdgeResponse {
    status: u16,
    json: serde_json::Value,
}

impl EdgeResponse {
    fn into_result(self) -> Result<serde_json::Value, String> {
        if self.status >= 400 {
            let error_msg = self.json.get("error")
                .or(self.json.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("API call failed");
            let code = self.json.get("code")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            return Err(serde_json::json!({
                "status": self.status,
                "error": error_msg,
                "code": code,
                "data": self.json,
            }).to_string());
        }
        Ok(self.json)
    }
}

async fn send_edge(
    base_url: &str,
    access_token: Option<&str>,
    method: &str,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<EdgeResponse, String> {
    let url = format!("{base_url}/functions/v1{path}");
    let client = reqwest::Client::new();

    let mut req = match method.to_uppercase().as_str() {
        "POST" => client.post(&url),
        "GET" => client.get(&url),
        "PUT" => client.put(&url),
        "PATCH" => client.patch(&url),
        "DELETE" => client.delete(&url),
        _ => return Err(format!("Unsupported method: {method}")),
    };

    req = req.header("apikey", SUPABASE_ANON_KEY);
    req = req.header("Content-Type", "application/json");

    if let Some(token) = access_token {
        req = req.header("Authorization", format!("Bearer {token}"));
    }

    if let Some(b) = body {
        req = req.json(&b);
    }

    let resp = req.send().await
        .map_err(|e| format!("API request failed: {e}"))?;

    let status = resp.status().as_u16();
    let text = resp.text().await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    let json: serde_json::Value = serde_json::from_str(&text)
        .unwrap_or(serde_json::json!({ "raw": text }));

    Ok(EdgeResponse { status, json })
}

// ── Response parsers ───────────────────────────────────

/// Parse response from FlexiLingo auth endpoints (verify-otp, google-token, etc.)
fn parse_backend_auth_response(body: &serde_json::Value) -> Result<AuthSession, String> {
    let session_obj = body.get("session")
        .ok_or("Missing session in auth response")?;
    let user_obj = body.get("user")
        .ok_or("Missing user in auth response")?;

    let access_token = session_obj.get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing access_token")?
        .to_string();
    let refresh_token = session_obj.get("refresh_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing refresh_token")?
        .to_string();
    let expires_at = session_obj.get("expires_at")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let user_id = user_obj.get("id")
        .and_then(|v| v.as_str())
        .ok_or("Missing user id")?
        .to_string();
    let email = user_obj.get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(AuthSession {
        access_token,
        refresh_token,
        user_id,
        email,
        expires_at,
    })
}

/// Parse response from Supabase native auth (refresh token, etc.)
fn parse_supabase_auth_response(body: &serde_json::Value) -> Result<AuthSession, String> {
    let access_token = body.get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing access_token")?
        .to_string();
    let refresh_token = body.get("refresh_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing refresh_token")?
        .to_string();
    let expires_at = body.get("expires_at")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let user = body.get("user").ok_or("Missing user object")?;
    let user_id = user.get("id")
        .and_then(|v| v.as_str())
        .ok_or("Missing user id")?
        .to_string();
    let email = user.get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(AuthSession {
        access_token,
        refresh_token,
        user_id,
        email,
        expires_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    /// Minimal scripted HTTP server: records "METHOD path|authorization" per request and
    /// answers with `handler(request_line, authorization)` -> (status, body).
    async fn serve(
        handler: impl Fn(&str, &str) -> (u16, String) + Send + Sync + 'static,
    ) -> (String, Arc<Mutex<Vec<String>>>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let log = Arc::new(Mutex::new(Vec::new()));
        let log2 = log.clone();
        let handler = Arc::new(handler);
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = listener.accept().await else { break };
                let log = log2.clone();
                let handler = handler.clone();
                tokio::spawn(async move {
                    let mut buf = vec![0u8; 16384];
                    let n = sock.read(&mut buf).await.unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]).to_string();
                    let line = req.lines().next().unwrap_or("").to_string();
                    let auth = req.lines()
                        .find(|l| l.to_lowercase().starts_with("authorization:"))
                        .map(|l| l.split_once(':').unwrap().1.trim().to_string())
                        .unwrap_or_default();
                    log.lock().unwrap().push(format!("{line}|{auth}"));
                    let (status, body) = handler(&line, &auth);
                    let resp = format!(
                        "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    let _ = sock.write_all(resp.as_bytes()).await;
                });
            }
        });
        (base, log)
    }

    fn db_with(session: Option<(&str, &str)>) -> Arc<Mutex<rusqlite::Connection>> {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE auth_tokens (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT)",
            [],
        ).unwrap();
        if let Some((access, refresh)) = session {
            let s = AuthSession {
                access_token: access.into(),
                refresh_token: refresh.into(),
                user_id: "u1".into(),
                email: "a@b.c".into(),
                expires_at: 0,
            };
            store_token(&conn, "session", &serde_json::to_string(&s).unwrap()).unwrap();
        }
        Arc::new(Mutex::new(conn))
    }

    const REFRESH_OK: &str = r#"{"access_token":"new-access","refresh_token":"new-refresh","expires_at":9,"user":{"id":"u1","email":"a@b.c"}}"#;

    fn router(line: &str, auth: &str) -> (u16, String) {
        if line.contains("/auth/v1/token") {
            (200, REFRESH_OK.into())
        } else if auth == "Bearer new-access" {
            (200, r#"{"ok":true}"#.into())
        } else {
            (401, r#"{"error":"expired","code":"JWT_EXPIRED"}"#.into())
        }
    }

    #[tokio::test]
    async fn refreshes_on_401_persists_and_retries_once() {
        let (base, log) = serve(router).await;
        let db = db_with(Some(("old-access", "old-refresh")));
        let out = call_with_refresh(&db, &base, "GET", "/x", None).await.unwrap();
        assert_eq!(out["ok"], true);
        let stored = read_session(&db).unwrap().unwrap();
        assert_eq!(stored.access_token, "new-access");
        assert_eq!(stored.refresh_token, "new-refresh");
        let log = log.lock().unwrap();
        assert_eq!(log.len(), 3, "call, refresh, retry: {log:?}");
    }

    #[tokio::test]
    async fn signed_out_401_is_not_retried() {
        let (base, log) = serve(router).await;
        let db = db_with(None);
        let err = call_with_refresh(&db, &base, "GET", "/x", None).await.unwrap_err();
        assert!(err.contains("\"status\":401"));
        assert_eq!(log.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn retry_happens_only_once() {
        let (base, log) = serve(|line, _| {
            if line.contains("/auth/v1/token") { (200, REFRESH_OK.into()) }
            else { (401, r#"{"error":"nope"}"#.into()) }
        }).await;
        let db = db_with(Some(("old-access", "old-refresh")));
        let err = call_with_refresh(&db, &base, "GET", "/x", None).await.unwrap_err();
        assert!(err.contains("401"));
        assert_eq!(log.lock().unwrap().len(), 3);
    }

    #[tokio::test]
    async fn rejected_refresh_signs_out_and_returns_original_error() {
        let (base, _log) = serve(|line, _| {
            if line.contains("/auth/v1/token") { (400, r#"{"error":"invalid_grant"}"#.into()) }
            else { (401, r#"{"error":"expired"}"#.into()) }
        }).await;
        let db = db_with(Some(("old-access", "old-refresh")));
        let err = call_with_refresh(&db, &base, "GET", "/x", None).await.unwrap_err();
        assert!(err.contains("401"));
        assert!(read_session(&db).unwrap().is_none());
    }

    #[tokio::test]
    async fn server_error_on_refresh_keeps_the_session() {
        let (base, _log) = serve(|line, _| {
            if line.contains("/auth/v1/token") { (503, "{}".into()) }
            else { (401, r#"{"error":"expired"}"#.into()) }
        }).await;
        let db = db_with(Some(("old-access", "old-refresh")));
        let _ = call_with_refresh(&db, &base, "GET", "/x", None).await;
        assert!(read_session(&db).unwrap().is_some());
    }

    #[tokio::test]
    async fn concurrent_401s_share_one_refresh() {
        let (base, log) = serve(router).await;
        let db = db_with(Some(("old-access", "old-refresh")));
        let calls = (0..5).map(|_| call_with_refresh(&db, &base, "GET", "/x", None));
        let results = futures_util::future::join_all(calls).await;
        assert!(results.iter().all(|r| r.is_ok()));
        let refreshes = log.lock().unwrap().iter().filter(|l| l.contains("/auth/v1/token")).count();
        assert_eq!(refreshes, 1, "refresh token must be spent once");
    }

    #[tokio::test]
    async fn bytes_fetch_refreshes_on_401_and_retries() {
        let (base, log) = serve(router).await;
        let db = db_with(Some(("old-access", "old-refresh")));
        let bytes = fetch_bytes_with_refresh(&db, &base, "/text-to-speech-v2?text=hi").await.unwrap();
        assert_eq!(bytes, br#"{"ok":true}"#.to_vec());
        assert_eq!(log.lock().unwrap().len(), 3);
    }

    #[tokio::test]
    async fn bytes_fetch_reports_http_status() {
        let (base, _log) = serve(|_, _| (404, "{}".into())).await;
        let db = db_with(None);
        let err = fetch_bytes_with_refresh(&db, &base, "/x").await.unwrap_err();
        assert_eq!(err, "HTTP_404");
    }

    #[test]
    fn only_a_dead_refresh_token_counts_as_rejected() {
        assert!(refresh_token_rejected(400, r#"{"error":"invalid_grant","error_description":"Invalid Refresh Token: Already Used"}"#));
        assert!(refresh_token_rejected(400, r#"{"code":400,"error_code":"refresh_token_not_found"}"#));
        assert!(refresh_token_rejected(401, r#"{"error_code":"refresh_token_already_used"}"#));
        assert!(!refresh_token_rejected(429, r#"{"error_code":"over_request_rate_limit"}"#));
        assert!(!refresh_token_rejected(429, r#"{"error":"invalid_grant"}"#), "429 never signs out");
        assert!(!refresh_token_rejected(400, r#"{"error":"validation_failed"}"#));
        assert!(!refresh_token_rejected(500, "{}"));
        assert!(!refresh_token_rejected(408, ""));
    }

    #[test]
    fn backoff_grows_and_is_capped() {
        let secs: Vec<u64> = (1..=9).map(|n| backoff_delay(n).as_secs()).collect();
        assert_eq!(secs, vec![5, 10, 20, 40, 80, 160, 300, 300, 300]);
    }

    #[tokio::test]
    async fn rate_limited_refresh_keeps_the_session_and_backs_off() {
        let (base, log) = serve(|line, _| {
            if line.contains("/auth/v1/token") { (429, r#"{"error_code":"over_request_rate_limit"}"#.into()) }
            else { (401, r#"{"error":"expired"}"#.into()) }
        }).await;
        let db = db_with(Some(("old-access", "old-refresh")));
        let _ = call_with_refresh(&db, &base, "GET", "/x", None).await;
        assert!(read_session(&db).unwrap().is_some(), "429 must not sign the user out");
        // A second 401 right away does not hit the auth server again.
        let _ = call_with_refresh(&db, &base, "GET", "/x", None).await;
        let refreshes = log.lock().unwrap().iter().filter(|l| l.contains("/auth/v1/token")).count();
        assert_eq!(refreshes, 1, "retry waits for the backoff");
        assert!(read_session(&db).unwrap().is_some());
    }

    #[tokio::test]
    async fn network_failure_on_refresh_keeps_the_session() {
        let db = db_with(Some(("old-access", "old-refresh")));
        let err = refresh_session(&db, "http://127.0.0.1:1", None).await.err().expect("must fail");
        assert!(err.contains("Refresh request failed"));
        assert!(read_session(&db).unwrap().is_some());
    }

    #[tokio::test]
    async fn expired_token_response_signs_out_on_401_too() {
        let (base, _log) = serve(|line, _| {
            if line.contains("/auth/v1/token") { (401, r#"{"error_code":"refresh_token_not_found"}"#.into()) }
            else { (401, r#"{"error":"expired"}"#.into()) }
        }).await;
        let db = db_with(Some(("old-access", "old-refresh")));
        let _ = call_with_refresh(&db, &base, "GET", "/x", None).await;
        assert!(read_session(&db).unwrap().is_none());
    }

    #[tokio::test]
    async fn a_sign_out_during_a_refresh_is_not_undone() {
        let db = db_with(Some(("old-access", "old-refresh")));
        let db2 = db.clone();
        let (base, _log) = serve(move |_, _| {
            // The user clicks "Sign out" while the refresh request is in flight.
            db2.lock().unwrap().execute("DELETE FROM auth_tokens WHERE key = 'session'", []).unwrap();
            (200, REFRESH_OK.into())
        }).await;
        let res = refresh_session(&db, &base, None).await;
        assert!(res.is_err());
        assert!(read_session(&db).unwrap().is_none(), "the old session must not come back");
    }
}
