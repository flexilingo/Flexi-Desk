//! Google sign-in for the desktop app: the system browser + a loopback redirect.
//!
//! Why loopback (RFC 8252 section 7.3) and not a `flexidesk://` deep link: Google
//! refuses custom-scheme redirects for Desktop OAuth clients, a registered scheme
//! only works from an installed bundle (never in `tauri dev`), and Windows hands a
//! deep link to a NEW process, which needs the single-instance plugin on top. A
//! loopback listener on `127.0.0.1:<random port>` works the same on macOS and Windows.
//!
//! Flow: open `accounts.google.com` in the browser (PKCE S256) -> Google redirects to
//! `http://127.0.0.1:<port>/?code=..&state=..` -> we trade the code for an access
//! token -> `auth?action=google-token` (the server verifies the token with Google's
//! userinfo endpoint and returns a FlexiLingo session, same shape as the email code).
//!
//! The Google Cloud OAuth client (type "Desktop app") is supplied at BUILD time with
//! `FLEXI_DESK_GOOGLE_CLIENT_ID` (and `FLEXI_DESK_GOOGLE_CLIENT_SECRET`: Google issues
//! one to desktop clients and says it is not a secret). Without a client id the
//! button is hidden (`auth_google_available` is false).
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

use base64::Engine;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use super::{parse_backend_auth_response, store_token, AuthSession, SUPABASE_ANON_KEY, SUPABASE_URL};
use crate::AppState;

const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
/// How long the browser has to come back before we give up.
const WAIT_SECS: u64 = 180;

fn client_id() -> Option<String> {
    option_env!("FLEXI_DESK_GOOGLE_CLIENT_ID")
        .map(str::to_string)
        .or_else(|| std::env::var("FLEXI_DESK_GOOGLE_CLIENT_ID").ok())
        .filter(|s| !s.trim().is_empty())
}

fn client_secret() -> Option<String> {
    option_env!("FLEXI_DESK_GOOGLE_CLIENT_SECRET")
        .map(str::to_string)
        .or_else(|| std::env::var("FLEXI_DESK_GOOGLE_CLIENT_SECRET").ok())
        .filter(|s| !s.trim().is_empty())
}

/// 43-char URL-safe random string (PKCE verifier / state).
fn random_token() -> String {
    let raw = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
    let bytes = hex_to_bytes(&raw);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn hex_to_bytes(hex: &str) -> Vec<u8> {
    (0..hex.len() / 2)
        .filter_map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok())
        .collect()
}

/// PKCE S256 challenge for a verifier.
pub(crate) fn pkce_challenge(verifier: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// The page Google's consent screen lives on.
pub(crate) fn build_auth_url(client_id: &str, redirect_uri: &str, state: &str, challenge: &str) -> String {
    let q = [
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("response_type", "code"),
        ("scope", "openid email profile"),
        ("state", state),
        ("code_challenge", challenge),
        ("code_challenge_method", "S256"),
        ("prompt", "select_account"),
    ]
    .iter()
    .map(|(k, v)| format!("{k}={}", urlencoding::encode(v)))
    .collect::<Vec<_>>()
    .join("&");
    format!("{AUTH_ENDPOINT}?{q}")
}

/// What the browser sent back to the loopback address.
#[derive(Debug, PartialEq)]
pub(crate) enum Callback {
    Code { code: String, state: String },
    /// The user pressed "Cancel" (or Google refused): `error=access_denied` and the like.
    Denied { error: String, state: String },
    /// Anything else (a favicon request, a probe): keep listening.
    Other,
}

/// Parse the first line of the HTTP request the browser made: `GET /?code=..&state=.. HTTP/1.1`.
pub(crate) fn parse_callback(request: &str) -> Callback {
    let line = request.lines().next().unwrap_or("");
    let mut parts = line.split_whitespace();
    if parts.next() != Some("GET") {
        return Callback::Other;
    }
    let target = parts.next().unwrap_or("");
    let query = match target.split_once('?') {
        Some((_, q)) => q,
        None => return Callback::Other,
    };
    let (mut code, mut state, mut error) = (None, None, None);
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        let v = urlencoding::decode(&v.replace('+', " ")).map(|c| c.into_owned()).unwrap_or_default();
        match k {
            "code" => code = Some(v),
            "state" => state = Some(v),
            "error" => error = Some(v),
            _ => {}
        }
    }
    if let Some(e) = error {
        return Callback::Denied { error: e, state: state.unwrap_or_default() };
    }
    match (code, state) {
        (Some(code), Some(state)) if !code.is_empty() => Callback::Code { code, state },
        _ => Callback::Other,
    }
}

fn reply(stream: &mut TcpStream, ok: bool) {
    let (title, body) = if ok {
        ("Signed in", "You are signed in. You can close this tab and go back to FlexiLingo.")
    } else {
        ("Sign-in cancelled", "Sign-in did not finish. You can close this tab and try again in FlexiLingo.")
    };
    let html = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{title}</title></head>\
         <body style=\"font-family:system-ui,sans-serif;text-align:center;padding:4rem 1rem;color:#0E240A\">\
         <h1 style=\"font-size:1.25rem\">{title}</h1><p>{body}</p></body></html>"
    );
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}",
        html.len()
    );
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.flush();
}

/// Block until the browser comes back (or time runs out). Runs on a blocking thread.
fn wait_for_callback(listener: TcpListener, expected_state: &str) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| format!("GOOGLE_LISTEN_FAILED: {e}"))?;
    let deadline = Instant::now() + Duration::from_secs(WAIT_SECS);
    while Instant::now() < deadline {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).unwrap_or(0);
                match parse_callback(&String::from_utf8_lossy(&buf[..n])) {
                    Callback::Code { code, state } => {
                        if state != expected_state {
                            // Not our redirect (another page probing the port): ignore it and
                            // keep waiting, so it cannot cancel the user's sign-in.
                            let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
                            continue;
                        }
                        reply(&mut stream, true);
                        return Ok(code);
                    }
                    Callback::Denied { state, .. } => {
                        if state != expected_state {
                            let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
                            continue;
                        }
                        reply(&mut stream, false);
                        return Err("GOOGLE_CANCELLED".to_string());
                    }
                    Callback::Other => {
                        let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => return Err(format!("GOOGLE_LISTEN_FAILED: {e}")),
        }
    }
    Err("GOOGLE_TIMEOUT".to_string())
}

#[tauri::command]
pub fn auth_google_available() -> bool {
    client_id().is_some()
}

#[tauri::command]
pub async fn auth_google_sign_in(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<AuthSession, String> {
    let client_id = client_id().ok_or("GOOGLE_NOT_CONFIGURED")?;

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("GOOGLE_LISTEN_FAILED: {e}"))?;
    let port = listener.local_addr().map_err(|e| format!("GOOGLE_LISTEN_FAILED: {e}"))?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let verifier = random_token();
    let oauth_state = random_token();
    let url = build_auth_url(&client_id, &redirect_uri, &oauth_state, &pkce_challenge(&verifier));
    app.opener().open_url(url, None::<&str>).map_err(|e| format!("GOOGLE_OPEN_FAILED: {e}"))?;

    let expected = oauth_state.clone();
    let code = tokio::task::spawn_blocking(move || wait_for_callback(listener, &expected))
        .await
        .map_err(|e| format!("GOOGLE_LISTEN_FAILED: {e}"))??;

    let mut form = vec![
        ("client_id", client_id.as_str()),
        ("code", code.as_str()),
        ("code_verifier", verifier.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri.as_str()),
    ];
    let secret = client_secret();
    if let Some(s) = secret.as_deref() {
        form.push(("client_secret", s));
    }
    let client = reqwest::Client::new();
    let token_resp = client
        .post(TOKEN_ENDPOINT)
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("GOOGLE_TOKEN_FAILED: {e}"))?;
    if !token_resp.status().is_success() {
        return Err("GOOGLE_TOKEN_FAILED".to_string());
    }
    let token_body: serde_json::Value = token_resp.json().await.map_err(|_| "GOOGLE_TOKEN_FAILED".to_string())?;
    let access_token = token_body
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("GOOGLE_TOKEN_FAILED")?;

    let resp = client
        .post(format!("{SUPABASE_URL}/functions/v1/auth?action=google-token"))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "access_token": access_token, "signup_source": "tauri" }))
        .send()
        .await
        .map_err(|e| format!("GOOGLE_SIGN_IN_FAILED: {e}"))?;
    if !resp.status().is_success() {
        let body: serde_json::Value = resp.json().await.unwrap_or_default();
        let code = body.get("code").and_then(|v| v.as_str()).unwrap_or("GOOGLE_SIGN_IN_FAILED");
        return Err(code.to_string());
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| format!("GOOGLE_SIGN_IN_FAILED: {e}"))?;
    let session = parse_backend_auth_response(&body)?;

    let conn = state.db.lock().map_err(|e| format!("DB lock error: {e}"))?;
    let json = serde_json::to_string(&session).map_err(|e| format!("Serialize error: {e}"))?;
    store_token(&conn, "session", &json)?;
    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_matches_the_rfc_7636_example() {
        // RFC 7636 appendix B.
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn random_token_is_url_safe_and_long_enough() {
        let t = random_token();
        assert!(t.len() >= 43);
        assert!(t.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_ne!(t, random_token());
    }

    #[test]
    fn auth_url_carries_pkce_state_and_the_loopback_redirect() {
        let url = build_auth_url("abc.apps.googleusercontent.com", "http://127.0.0.1:5173", "st", "ch");
        assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
        assert!(url.contains("client_id=abc.apps.googleusercontent.com"));
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A5173"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("scope=openid%20email%20profile"));
        assert!(url.contains("state=st"));
        assert!(url.contains("code_challenge=ch"));
        assert!(url.contains("code_challenge_method=S256"));
    }

    #[test]
    fn parses_the_code_and_state_from_the_browser_request() {
        let req = "GET /?code=4%2F0AbC&state=xyz&scope=email HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        assert_eq!(
            parse_callback(req),
            Callback::Code { code: "4/0AbC".into(), state: "xyz".into() }
        );
    }

    #[test]
    fn a_denied_consent_is_reported_as_denied() {
        assert_eq!(
            parse_callback("GET /?error=access_denied&state=xyz HTTP/1.1\r\n\r\n"),
            Callback::Denied { error: "access_denied".into(), state: "xyz".into() }
        );
    }

    #[test]
    fn probes_and_other_methods_are_ignored() {
        assert_eq!(parse_callback("GET /favicon.ico HTTP/1.1\r\n\r\n"), Callback::Other);
        assert_eq!(parse_callback("POST /?code=a&state=b HTTP/1.1\r\n\r\n"), Callback::Other);
        assert_eq!(parse_callback("GET /?state=b HTTP/1.1\r\n\r\n"), Callback::Other);
        assert_eq!(parse_callback(""), Callback::Other);
    }
}
