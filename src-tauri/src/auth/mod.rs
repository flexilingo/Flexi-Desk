use tauri::State;
use crate::AppState;

const SUPABASE_URL: &str = "https://uagjgbpeeauablccvkgs.supabase.co";
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
