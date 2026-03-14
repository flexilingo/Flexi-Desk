use tauri::State;
use crate::AppState;
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const SUPABASE_URL: &str = "https://uagjgbpeeauablccvkgs.supabase.co";
const SUPABASE_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZ2pnYnBlZWF1YWJsY2N2a2dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTE4NDIsImV4cCI6MjA4MTE2Nzg0Mn0.bim07d-SPrjViZ5qcugIGggfBd3iv0WF4RrdV3wgiTQ";

const GOOGLE_CLIENT_ID: &str = "909984126560-hikcb8j0ljasnsem2v8fjm7ainb9to40.apps.googleusercontent.com";

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

// ── OAuth callback HTML pages ──────────────────────────

/// Returns the HTML for the Google OAuth callback page.
/// This page reads the access_token from the URL fragment and POSTs it to the server.
/// Note: The page only processes known URL fragment parameters (access_token)
/// and sends them to a local-only server endpoint. No user-controlled HTML is rendered.
fn google_callback_html() -> &'static str {
    include_str!("oauth_callback_google.html")
}

/// Returns the HTML for the Apple/Supabase OAuth callback page.
fn apple_callback_html() -> &'static str {
    include_str!("oauth_callback_apple.html")
}

// ── OAuth: Google ──────────────────────────────────────

#[tauri::command]
pub async fn auth_start_google_oauth(
    state: State<'_, AppState>,
) -> Result<AuthSession, String> {
    // 1. Bind to a random available port
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to start OAuth server: {e}"))?;
    let port = listener.local_addr()
        .map_err(|e| format!("Failed to get port: {e}"))?
        .port();

    // 2. Build Google OAuth URL (implicit flow)
    let redirect_uri = format!("http://localhost:{port}/auth/callback");
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=token&scope=openid%20email%20profile&prompt=select_account",
        GOOGLE_CLIENT_ID,
        urlencoding::encode(&redirect_uri),
    );

    // 3. Open system browser
    open::that_detached(&auth_url)
        .map_err(|e| format!("Failed to open browser: {e}"))?;

    // 4. Wait for the token via localhost callback
    let access_token = wait_for_google_callback(&listener).await?;

    // 5. Fetch Google user info
    let client = reqwest::Client::new();
    let user_info: serde_json::Value = client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| format!("Failed to get user info: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse user info: {e}"))?;

    // 6. Call FlexiLingo backend
    let resp = client
        .post(format!("{SUPABASE_URL}/functions/v1/auth?action=google-token"))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "access_token": access_token,
            "user_info": user_info,
            "signup_source": "tauri"
        }))
        .send()
        .await
        .map_err(|e| format!("Backend auth failed: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Authentication failed: {body}"));
    }

    let body: serde_json::Value = resp.json().await
        .map_err(|e| format!("Failed to parse auth response: {e}"))?;

    let session = parse_backend_auth_response(&body)?;

    // 7. Store session
    let conn = lock_db(&state)?;
    let session_json = serde_json::to_string(&session)
        .map_err(|e| format!("Serialize error: {e}"))?;
    store_token(&conn, "session", &session_json)?;

    Ok(session)
}

/// Wait for Google OAuth implicit flow callback.
async fn wait_for_google_callback(listener: &TcpListener) -> Result<String, String> {
    let timeout = tokio::time::Duration::from_secs(120);
    let mut access_token: Option<String> = None;
    let html = google_callback_html();

    let result = tokio::time::timeout(timeout, async {
        loop {
            let (mut stream, _) = listener.accept().await
                .map_err(|e| format!("Accept error: {e}"))?;

            let mut buf = vec![0u8; 8192];
            let n = stream.read(&mut buf).await
                .map_err(|e| format!("Read error: {e}"))?;
            let request = String::from_utf8_lossy(&buf[..n]);

            if request.starts_with("GET /auth/callback") {
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    html.len(),
                    html
                );
                let _ = stream.write_all(response.as_bytes()).await;
                let _ = stream.flush().await;
            } else if request.starts_with("POST /auth/token") {
                if let Some(body_start) = request.find("\r\n\r\n") {
                    let body = &request[body_start + 4..];
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(body) {
                        if let Some(token) = json.get("access_token").and_then(|v| v.as_str()) {
                            access_token = Some(token.to_string());
                        }
                    }
                }
                let ok_response = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok";
                let _ = stream.write_all(ok_response.as_bytes()).await;
                let _ = stream.flush().await;

                if access_token.is_some() {
                    return Ok::<(), String>(());
                }
            } else {
                let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                let _ = stream.write_all(not_found.as_bytes()).await;
            }
        }
    }).await;

    match result {
        Ok(Ok(())) => access_token.ok_or_else(|| "No access token received".to_string()),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("OAuth timed out after 120 seconds".to_string()),
    }
}

// ── OAuth: Apple (via Supabase authorize) ──────────────

#[tauri::command]
pub async fn auth_start_apple_oauth(
    state: State<'_, AppState>,
) -> Result<AuthSession, String> {
    // Apple Sign-In requires HTTPS redirect, so we use Supabase's built-in
    // authorize endpoint which handles the Apple flow and redirects back
    // to our localhost with tokens in the fragment.

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to start OAuth server: {e}"))?;
    let port = listener.local_addr()
        .map_err(|e| format!("Failed to get port: {e}"))?
        .port();

    let redirect_uri = format!("http://localhost:{port}/auth/apple-callback");
    let auth_url = format!(
        "{SUPABASE_URL}/auth/v1/authorize?provider=apple&redirect_to={}",
        urlencoding::encode(&redirect_uri),
    );

    open::that_detached(&auth_url)
        .map_err(|e| format!("Failed to open browser: {e}"))?;

    let (access_token, refresh_token) = wait_for_supabase_callback(&listener).await?;

    // Get user info from the Supabase session
    let client = reqwest::Client::new();
    let user_resp = client
        .get(format!("{SUPABASE_URL}/auth/v1/user"))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| format!("Failed to get user: {e}"))?;

    if !user_resp.status().is_success() {
        return Err("Failed to get user info from session".to_string());
    }

    let user: serde_json::Value = user_resp.json().await
        .map_err(|e| format!("Failed to parse user: {e}"))?;

    let user_id = user.get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let email = user.get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let session = AuthSession {
        access_token,
        refresh_token,
        user_id,
        email,
        expires_at: 0,
    };

    let conn = lock_db(&state)?;
    let session_json = serde_json::to_string(&session)
        .map_err(|e| format!("Serialize error: {e}"))?;
    store_token(&conn, "session", &session_json)?;

    Ok(session)
}

/// Wait for Supabase authorize redirect callback.
async fn wait_for_supabase_callback(listener: &TcpListener) -> Result<(String, String), String> {
    let timeout = tokio::time::Duration::from_secs(120);
    let mut tokens: Option<(String, String)> = None;
    let html = apple_callback_html();

    let result = tokio::time::timeout(timeout, async {
        loop {
            let (mut stream, _) = listener.accept().await
                .map_err(|e| format!("Accept error: {e}"))?;

            let mut buf = vec![0u8; 8192];
            let n = stream.read(&mut buf).await
                .map_err(|e| format!("Read error: {e}"))?;
            let request = String::from_utf8_lossy(&buf[..n]);

            if request.starts_with("GET /auth/apple-callback") {
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    html.len(),
                    html
                );
                let _ = stream.write_all(response.as_bytes()).await;
                let _ = stream.flush().await;
            } else if request.starts_with("POST /auth/supabase-session") {
                if let Some(body_start) = request.find("\r\n\r\n") {
                    let body = &request[body_start + 4..];
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(body) {
                        let at = json.get("access_token").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let rt = json.get("refresh_token").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        if !at.is_empty() {
                            tokens = Some((at, rt));
                        }
                    }
                }
                let ok_response = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok";
                let _ = stream.write_all(ok_response.as_bytes()).await;
                let _ = stream.flush().await;

                if tokens.is_some() {
                    return Ok::<(), String>(());
                }
            } else {
                let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                let _ = stream.write_all(not_found.as_bytes()).await;
            }
        }
    }).await;

    match result {
        Ok(Ok(())) => tokens.ok_or_else(|| "No tokens received".to_string()),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("OAuth timed out after 120 seconds".to_string()),
    }
}

// ── Session management ─────────────────────────────────

#[tauri::command]
pub async fn auth_refresh(
    state: State<'_, AppState>,
) -> Result<AuthSession, String> {
    let refresh_token = {
        let conn = lock_db(&state)?;
        let session_json = get_token(&conn, "session")
            .ok_or("No session found")?;
        let session: AuthSession = serde_json::from_str(&session_json)
            .map_err(|e| format!("Parse error: {e}"))?;
        session.refresh_token
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token"))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "refresh_token": refresh_token }))
        .send()
        .await
        .map_err(|e| format!("Refresh request failed: {e}"))?;

    if !resp.status().is_success() {
        let conn = lock_db(&state)?;
        let _ = conn.execute("DELETE FROM auth_tokens WHERE key = 'session'", []);
        return Err("Session expired. Please log in again.".to_string());
    }

    let body: serde_json::Value = resp.json().await
        .map_err(|e| format!("Failed to parse refresh response: {e}"))?;

    let session = parse_supabase_auth_response(&body)?;

    let conn = lock_db(&state)?;
    let session_json = serde_json::to_string(&session)
        .map_err(|e| format!("Serialize error: {e}"))?;
    store_token(&conn, "session", &session_json)?;

    Ok(session)
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

#[tauri::command]
pub async fn supabase_call(
    state: State<'_, AppState>,
    method: String,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let access_token = {
        let conn = lock_db(&state)?;
        get_token(&conn, "session")
            .and_then(|json| serde_json::from_str::<AuthSession>(&json).ok())
            .map(|s| s.access_token)
    };

    let url = format!("{SUPABASE_URL}/functions/v1{path}");
    let client = reqwest::Client::new();

    let mut req = match method.to_uppercase().as_str() {
        "POST" => client.post(&url),
        "GET" => client.get(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => return Err(format!("Unsupported method: {method}")),
    };

    req = req.header("apikey", SUPABASE_ANON_KEY);
    req = req.header("Content-Type", "application/json");

    if let Some(token) = &access_token {
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

    if status >= 400 {
        let error_msg = json.get("error")
            .or(json.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("API call failed");
        let code = json.get("code")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        return Err(serde_json::json!({
            "status": status,
            "error": error_msg,
            "code": code,
            "data": json,
        }).to_string());
    }

    Ok(json)
}

// ── Response parsers ───────────────────────────────────

/// Parse response from FlexiLingo custom auth endpoint (/auth?action=google-token).
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
