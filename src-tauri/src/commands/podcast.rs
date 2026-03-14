use std::process::Stdio;

use tauri::{Emitter, State};
use futures_util::StreamExt;
use tokio::io::{AsyncBufReadExt, BufReader, AsyncReadExt};

use crate::podcast::rss;
use crate::podcast::nlp;
use crate::podcast::types::*;
use crate::caption::whisper;
use crate::AppState;

// ── Helpers ─────────────────────────────────────────────

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

// ── Feed Commands ───────────────────────────────────────

#[tauri::command]
pub async fn podcast_add_feed(
    state: State<'_, AppState>,
    feed_url: String,
    language: Option<String>,
) -> Result<PodcastFeed, String> {
    // 1. Fetch the RSS XML
    let response = reqwest::get(&feed_url)
        .await
        .map_err(|e| format!("Failed to fetch feed: {e}"))?;

    let xml = response
        .text()
        .await
        .map_err(|e| format!("Failed to read feed body: {e}"))?;

    // 2. Parse the feed
    let parsed = rss::parse_rss(&xml)?;
    let lang = language.unwrap_or_else(|| parsed.language.clone().unwrap_or_else(|| "en".into()));

    // 3. Insert feed into DB
    let feed_id = {
        let conn = lock_db(&state)?;

        conn.execute(
            "INSERT INTO podcast_feeds
                (id, title, author, description, feed_url, website_url, artwork_url,
                 language, category, episode_count, last_refreshed)
             VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
             ON CONFLICT(feed_url) DO UPDATE SET
                title = ?1, author = ?2, description = ?3, website_url = ?5,
                artwork_url = ?6, category = ?8, last_refreshed = datetime('now'),
                updated_at = datetime('now')",
            rusqlite::params![
                parsed.title,
                parsed.author,
                parsed.description,
                feed_url,
                parsed.website_url,
                parsed.artwork_url,
                lang,
                parsed.category,
                parsed.episodes.len() as i64,
            ],
        )
        .map_err(|e| format!("Feed insert error: {e}"))?;

        conn.query_row(
            "SELECT id FROM podcast_feeds WHERE feed_url = ?1",
            rusqlite::params![feed_url],
            |row: &rusqlite::Row| row.get::<_, String>(0),
        )
        .map_err(|e| format!("Feed lookup error: {e}"))?
    };

    // 4. Insert episodes
    {
        let conn = lock_db(&state)?;
        for ep in &parsed.episodes {
            conn.execute(
                "INSERT OR IGNORE INTO podcast_episodes
                    (id, feed_id, guid, title, description, audio_url,
                     duration_seconds, published_at, file_size)
                 VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    feed_id,
                    ep.guid,
                    ep.title,
                    ep.description,
                    ep.audio_url,
                    ep.duration_seconds,
                    ep.published_at,
                    ep.file_size,
                ],
            )
            .ok(); // Ignore duplicate GUID errors
        }
    }

    let conn = lock_db(&state)?;
    get_feed_by_id(&conn, &feed_id)
}

#[tauri::command]
pub fn podcast_list_feeds(
    state: State<'_, AppState>,
) -> Result<Vec<PodcastFeed>, String> {
    let conn = lock_db(&state)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, title, author, description, feed_url, website_url, artwork_url,
                    language, category, episode_count, last_refreshed, is_subscribed,
                    created_at, updated_at
             FROM podcast_feeds
             WHERE is_subscribed = 1
             ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map([], map_feed_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut feeds = Vec::new();
    for row in rows {
        feeds.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(feeds)
}

#[tauri::command]
pub fn podcast_delete_feed(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "DELETE FROM podcast_feeds WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn podcast_refresh_feed(
    state: State<'_, AppState>,
    id: String,
) -> Result<PodcastFeed, String> {
    // Get feed URL
    let feed_url = {
        let conn = lock_db(&state)?;
        conn.query_row(
            "SELECT feed_url FROM podcast_feeds WHERE id = ?1",
            rusqlite::params![id],
            |row: &rusqlite::Row| row.get::<_, String>(0),
        )
        .map_err(|e| format!("Feed not found: {e}"))?
    };

    // Re-fetch and parse
    let response = reqwest::get(&feed_url)
        .await
        .map_err(|e| format!("Failed to fetch feed: {e}"))?;

    let xml = response
        .text()
        .await
        .map_err(|e| format!("Failed to read feed body: {e}"))?;

    let parsed = rss::parse_rss(&xml)?;

    // Update feed metadata
    {
        let conn = lock_db(&state)?;
        conn.execute(
            "UPDATE podcast_feeds SET
                title = ?1, author = ?2, description = ?3,
                artwork_url = ?4, category = ?5,
                episode_count = ?6, last_refreshed = datetime('now'),
                updated_at = datetime('now')
             WHERE id = ?7",
            rusqlite::params![
                parsed.title,
                parsed.author,
                parsed.description,
                parsed.artwork_url,
                parsed.category,
                parsed.episodes.len() as i64,
                id,
            ],
        )
        .map_err(|e| format!("Feed update error: {e}"))?;

        // Insert new episodes (ignore duplicates)
        for ep in &parsed.episodes {
            conn.execute(
                "INSERT OR IGNORE INTO podcast_episodes
                    (id, feed_id, guid, title, description, audio_url,
                     duration_seconds, published_at, file_size)
                 VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    id,
                    ep.guid,
                    ep.title,
                    ep.description,
                    ep.audio_url,
                    ep.duration_seconds,
                    ep.published_at,
                    ep.file_size,
                ],
            )
            .ok();
        }
    }

    let conn = lock_db(&state)?;
    get_feed_by_id(&conn, &id)
}

// ── Episode Commands ────────────────────────────────────

#[tauri::command]
pub fn podcast_list_episodes(
    state: State<'_, AppState>,
    feed_id: String,
    limit: Option<i64>,
) -> Result<Vec<PodcastEpisode>, String> {
    let conn = lock_db(&state)?;
    let max = limit.unwrap_or(100);

    let mut stmt = conn
        .prepare(
            "SELECT id, feed_id, guid, title, description, audio_url,
                    duration_seconds, published_at, file_size, is_downloaded,
                    local_path, play_position, is_played, transcript,
                    transcript_status, cefr_level, word_count, created_at
             FROM podcast_episodes
             WHERE feed_id = ?1
             ORDER BY published_at DESC
             LIMIT ?2",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![feed_id, max], map_episode_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut episodes = Vec::new();
    for row in rows {
        episodes.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(episodes)
}

#[tauri::command]
pub fn podcast_get_episode(
    state: State<'_, AppState>,
    id: String,
) -> Result<PodcastEpisode, String> {
    let conn = lock_db(&state)?;
    conn.query_row(
        "SELECT id, feed_id, guid, title, description, audio_url,
                duration_seconds, published_at, file_size, is_downloaded,
                local_path, play_position, is_played, transcript,
                transcript_status, cefr_level, word_count, created_at
         FROM podcast_episodes WHERE id = ?1",
        rusqlite::params![id],
        map_episode_row,
    )
    .map_err(|e| format!("Episode not found: {e}"))
}

#[tauri::command]
pub fn podcast_update_progress(
    state: State<'_, AppState>,
    episode_id: String,
    position: i64,
    is_played: Option<bool>,
) -> Result<(), String> {
    let conn = lock_db(&state)?;

    if let Some(played) = is_played {
        conn.execute(
            "UPDATE podcast_episodes SET play_position = ?1, is_played = ?2 WHERE id = ?3",
            rusqlite::params![position, played as i32, episode_id],
        )
        .map_err(|e| format!("Progress update error: {e}"))?;
    } else {
        conn.execute(
            "UPDATE podcast_episodes SET play_position = ?1 WHERE id = ?2",
            rusqlite::params![position, episode_id],
        )
        .map_err(|e| format!("Progress update error: {e}"))?;
    }

    Ok(())
}

// ── Bookmark Commands ───────────────────────────────────

#[tauri::command]
pub fn podcast_add_bookmark(
    state: State<'_, AppState>,
    episode_id: String,
    position_ms: i64,
    label: Option<String>,
    note: Option<String>,
) -> Result<PodcastBookmark, String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "INSERT INTO podcast_bookmarks (id, episode_id, position_ms, label, note)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4)",
        rusqlite::params![episode_id, position_ms, label, note],
    )
    .map_err(|e| format!("Bookmark create error: {e}"))?;

    let id: String = conn
        .query_row(
            "SELECT id FROM podcast_bookmarks WHERE episode_id = ?1 ORDER BY created_at DESC LIMIT 1",
            rusqlite::params![episode_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Bookmark lookup error: {e}"))?;

    conn.query_row(
        "SELECT id, episode_id, position_ms, label, note, created_at
         FROM podcast_bookmarks WHERE id = ?1",
        rusqlite::params![id],
        map_bookmark_row,
    )
    .map_err(|e| format!("Bookmark not found: {e}"))
}

#[tauri::command]
pub fn podcast_list_bookmarks(
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<Vec<PodcastBookmark>, String> {
    let conn = lock_db(&state)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, episode_id, position_ms, label, note, created_at
             FROM podcast_bookmarks
             WHERE episode_id = ?1
             ORDER BY position_ms ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![episode_id], map_bookmark_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut bookmarks = Vec::new();
    for row in rows {
        bookmarks.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(bookmarks)
}

#[tauri::command]
pub fn podcast_delete_bookmark(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "DELETE FROM podcast_bookmarks WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;
    Ok(())
}

// ── iTunes Search ───────────────────────────────────────

#[tauri::command]
pub async fn podcast_search_itunes(
    term: String,
    language: Option<String>,
) -> Result<Vec<ITunesSearchResult>, String> {
    let lang = language.unwrap_or_else(|| "en".into());
    let url = format!(
        "https://itunes.apple.com/search?term={}&media=podcast&limit=25&lang={}&explicit=no",
        urlencoded(&term),
        lang,
    );

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("iTunes search failed: {e}"))?;

    let json = response
        .text()
        .await
        .map_err(|e| format!("Failed to read iTunes response: {e}"))?;

    rss::parse_itunes_results(&json)
}

// ── Row Mappers ─────────────────────────────────────────

fn map_feed_row(row: &rusqlite::Row) -> rusqlite::Result<PodcastFeed> {
    Ok(PodcastFeed {
        id: row.get(0)?,
        title: row.get(1)?,
        author: row.get(2)?,
        description: row.get(3)?,
        feed_url: row.get(4)?,
        website_url: row.get(5)?,
        artwork_url: row.get(6)?,
        language: row.get(7)?,
        category: row.get(8)?,
        episode_count: row.get(9)?,
        last_refreshed: row.get(10)?,
        is_subscribed: row.get::<_, i32>(11)? != 0,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn map_episode_row(row: &rusqlite::Row) -> rusqlite::Result<PodcastEpisode> {
    Ok(PodcastEpisode {
        id: row.get(0)?,
        feed_id: row.get(1)?,
        guid: row.get(2)?,
        title: row.get(3)?,
        description: row.get(4)?,
        audio_url: row.get(5)?,
        duration_seconds: row.get(6)?,
        published_at: row.get(7)?,
        file_size: row.get(8)?,
        is_downloaded: row.get::<_, i32>(9)? != 0,
        local_path: row.get(10)?,
        play_position: row.get(11)?,
        is_played: row.get::<_, i32>(12)? != 0,
        transcript: row.get(13)?,
        transcript_status: row.get(14)?,
        cefr_level: row.get(15)?,
        word_count: row.get(16)?,
        created_at: row.get(17)?,
    })
}

fn map_bookmark_row(row: &rusqlite::Row) -> rusqlite::Result<PodcastBookmark> {
    Ok(PodcastBookmark {
        id: row.get(0)?,
        episode_id: row.get(1)?,
        position_ms: row.get(2)?,
        label: row.get(3)?,
        note: row.get(4)?,
        created_at: row.get(5)?,
    })
}

// ── Internal Helpers ────────────────────────────────────

fn get_feed_by_id(conn: &rusqlite::Connection, id: &str) -> Result<PodcastFeed, String> {
    conn.query_row(
        "SELECT id, title, author, description, feed_url, website_url, artwork_url,
                language, category, episode_count, last_refreshed, is_subscribed,
                created_at, updated_at
         FROM podcast_feeds WHERE id = ?1",
        rusqlite::params![id],
        map_feed_row,
    )
    .map_err(|e| format!("Feed not found: {e}"))
}

fn urlencoded(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "+".to_string(),
            _ => format!("%{:02X}", c as u8),
        })
        .collect()
}

fn episodes_dir() -> Result<std::path::PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or("Cannot determine data directory")?
        .join("com.flexilingo.desk")
        .join("podcast-episodes");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create episodes directory: {e}"))?;
    Ok(dir)
}

// ── Episode Download Commands ──────────────────────────

#[tauri::command]
pub async fn podcast_download_episode(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<String, String> {
    // Get episode audio URL
    let audio_url = {
        let conn = lock_db(&state)?;
        conn.query_row(
            "SELECT audio_url FROM podcast_episodes WHERE id = ?1",
            rusqlite::params![episode_id],
            |row: &rusqlite::Row| row.get::<_, String>(0),
        )
        .map_err(|e| format!("Episode not found: {e}"))?
    };

    let dir = episodes_dir()?;
    // Determine file extension from URL or default to .mp3
    let ext = audio_url
        .rsplit('.')
        .next()
        .and_then(|e| {
            let e = e.split('?').next().unwrap_or(e);
            if ["mp3", "m4a", "ogg", "wav", "opus"].contains(&e) {
                Some(e.to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "mp3".into());
    let dest_path = dir.join(format!("{episode_id}.{ext}"));

    // Already downloaded?
    if dest_path.exists() {
        let path_str = dest_path.to_string_lossy().to_string();
        let conn = lock_db(&state)?;
        conn.execute(
            "UPDATE podcast_episodes SET is_downloaded = 1, local_path = ?1 WHERE id = ?2",
            rusqlite::params![path_str, episode_id],
        ).ok();
        return Ok(path_str);
    }

    let response = reqwest::get(&audio_url)
        .await
        .map_err(|e| format!("Download request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let tmp_path = dest_path.with_extension(format!("{ext}.tmp"));
    let mut file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| format!("Failed to create file: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut last_emit_percent: f64 = -1.0;

    use tokio::io::AsyncWriteExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {e}"))?;

        downloaded += chunk.len() as u64;
        let percent = if total_bytes > 0 {
            (downloaded as f64 / total_bytes as f64) * 100.0
        } else {
            0.0
        };

        let rounded = (percent * 10.0).floor() / 10.0;
        if (rounded - last_emit_percent).abs() >= 1.0 {
            last_emit_percent = rounded;
            let _ = app.emit("podcast-download-progress", EpisodeDownloadProgress {
                episode_id: episode_id.clone(),
                downloaded_bytes: downloaded,
                total_bytes,
                percent: rounded,
            });
        }
    }

    file.flush().await.map_err(|e| format!("Flush error: {e}"))?;
    drop(file);

    tokio::fs::rename(&tmp_path, &dest_path)
        .await
        .map_err(|e| format!("Rename error: {e}"))?;

    let path_str = dest_path.to_string_lossy().to_string();

    // Update DB
    {
        let conn = lock_db(&state)?;
        conn.execute(
            "UPDATE podcast_episodes SET is_downloaded = 1, local_path = ?1 WHERE id = ?2",
            rusqlite::params![path_str, episode_id],
        )
        .map_err(|e| format!("DB update error: {e}"))?;
    }

    // Emit 100%
    let _ = app.emit("podcast-download-progress", EpisodeDownloadProgress {
        episode_id,
        downloaded_bytes: total_bytes,
        total_bytes,
        percent: 100.0,
    });

    Ok(path_str)
}

#[tauri::command]
pub fn podcast_delete_download(
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;

    let local_path: Option<String> = conn
        .query_row(
            "SELECT local_path FROM podcast_episodes WHERE id = ?1",
            rusqlite::params![episode_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .ok()
        .flatten();

    if let Some(path) = local_path {
        let _ = std::fs::remove_file(&path);
    }

    conn.execute(
        "UPDATE podcast_episodes SET is_downloaded = 0, local_path = NULL WHERE id = ?1",
        rusqlite::params![episode_id],
    )
    .map_err(|e| format!("DB update error: {e}"))?;

    Ok(())
}

// ── Transcription Commands ─────────────────────────────

#[tauri::command]
pub async fn podcast_transcribe_episode(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<Vec<PodcastTranscriptSegment>, String> {
    // 1. Get episode info and whisper config
    let (local_path, language, binary_path, model_path) = {
        let conn = lock_db(&state)?;

        let (local_path, feed_id): (Option<String>, String) = conn
            .query_row(
                "SELECT local_path, feed_id FROM podcast_episodes WHERE id = ?1",
                rusqlite::params![episode_id],
                |row: &rusqlite::Row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Episode not found: {e}"))?;

        let audio_path = local_path.ok_or("Episode must be downloaded before transcription")?;

        let feed_lang: String = conn
            .query_row(
                "SELECT language FROM podcast_feeds WHERE id = ?1",
                rusqlite::params![feed_id],
                |row: &rusqlite::Row| row.get(0),
            )
            .unwrap_or_else(|_| "auto".into());

        let bin = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'whisper_binary_path'",
                [],
                |row: &rusqlite::Row| row.get::<_, String>(0),
            )
            .map_err(|_| "Whisper binary not configured".to_string())?;

        let model = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'whisper_model_path'",
                [],
                |row: &rusqlite::Row| row.get::<_, String>(0),
            )
            .map_err(|_| "Whisper model not configured".to_string())?;

        // Normalize language code for whisper (e.g. "en-us" → "en", "fr-CA" → "fr")
        let lang = if feed_lang == "auto" {
            feed_lang
        } else {
            feed_lang.split(|c| c == '-' || c == '_').next().unwrap_or("auto").to_string()
        };

        (audio_path, lang, bin, model)
    };

    // 2. Mark as processing
    {
        let conn = lock_db(&state)?;
        conn.execute(
            "UPDATE podcast_episodes SET transcript_status = 'processing' WHERE id = ?1",
            rusqlite::params![episode_id],
        ).ok();
    }

    // 3. Validate paths
    whisper::validate_paths(&binary_path, &model_path, &local_path)?;

    // 4. Build whisper command — streaming mode
    //    - NO --no-prints: so segment lines appear on stdout as they're processed
    //    - WITH -oj -of: also writes JSON file for word-level timestamps after completion
    let output_prefix = std::env::temp_dir()
        .join(format!("flexi_whisper_{}", whisper::uuid_hex()));
    let output_prefix_str = output_prefix.to_string_lossy().to_string();

    let mut args: Vec<String> = vec![
        "-m".into(), model_path.clone(),
        "-f".into(), local_path.clone(),
        "-oj".into(),
        "-of".into(), output_prefix_str.clone(),
    ];
    if language != "auto" {
        args.push("-l".into());
        args.push(language.clone());
    }

    let mut child = tokio::process::Command::new(&binary_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn whisper: {e}"))?;

    let stdout = child.stdout.take()
        .ok_or("Failed to capture whisper stdout")?;
    let stderr = child.stderr.take()
        .ok_or("Failed to capture whisper stderr")?;

    // Drain stderr in background (needed to prevent deadlock + collect for error reporting)
    let stderr_handle = tokio::spawn(async move {
        let mut buf = String::new();
        let mut reader = BufReader::new(stderr);
        let _ = reader.read_to_string(&mut buf).await;
        buf
    });

    // 5. Read stdout line-by-line — emit segments as they arrive
    let re = regex::Regex::new(
        r"\[(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})\]\s*(.*)"
    ).unwrap();

    let mut streaming_index: i64 = 0;
    let mut reader = BufReader::new(stdout).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        if let Some(caps) = re.captures(&line) {
            let text = caps[3].trim().to_string();
            if text.is_empty() || text == "[BLANK_AUDIO]" {
                continue;
            }

            let start_ms = whisper::parse_timestamp(&caps[1]);
            let end_ms = whisper::parse_timestamp(&caps[2]);

            let segment = PodcastTranscriptSegment {
                id: format!("s_{streaming_index}"),
                episode_id: episode_id.clone(),
                text,
                start_ms,
                end_ms,
                confidence: 0.0,
                language: language.clone(),
                words: Vec::new(),
            };

            let _ = app.emit("podcast-transcript-segment", &segment);
            streaming_index += 1;
        }
    }

    // 6. Wait for process completion
    let status = child.wait().await
        .map_err(|e| format!("Whisper process error: {e}"))?;

    let stderr_text = stderr_handle.await.unwrap_or_default();

    if !status.success() {
        {
            let conn = lock_db(&state)?;
            conn.execute(
                "UPDATE podcast_episodes SET transcript_status = 'failed' WHERE id = ?1",
                rusqlite::params![episode_id],
            ).ok();
        }
        let _ = tokio::fs::remove_file(format!("{output_prefix_str}.json")).await;
        return Err(format!(
            "Whisper process failed (exit {}): {}",
            status.code().unwrap_or(-1),
            &stderr_text[..stderr_text.len().min(500)]
        ));
    }

    // 7. Read JSON for full data with word-level timestamps
    let json_path = format!("{output_prefix_str}.json");
    let json_content = tokio::fs::read_to_string(&json_path)
        .await
        .map_err(|e| {
            let mut msg = format!("Failed to read whisper output at {json_path}: {e}");
            if !stderr_text.is_empty() {
                msg.push_str(&format!("\nWhisper stderr: {}", &stderr_text[..stderr_text.len().min(500)]));
            }
            msg
        })?;

    let _ = tokio::fs::remove_file(&json_path).await;

    let parsed_segments = whisper::parse_whisper_json(&json_content, &language)?;

    // 8. Store segments in DB
    {
        let conn = lock_db(&state)?;

        // Delete old segments if re-transcribing
        conn.execute(
            "DELETE FROM podcast_transcript_segments WHERE episode_id = ?1",
            rusqlite::params![episode_id],
        ).ok();

        let mut result_segments = Vec::new();
        let mut full_text = String::new();
        let mut total_word_count: i64 = 0;

        for seg in &parsed_segments {
            let seg_id = format!("{:032x}", std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos());

            conn.execute(
                "INSERT INTO podcast_transcript_segments
                    (id, episode_id, text, start_ms, end_ms, confidence, language)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    seg_id, episode_id, seg.text, seg.start_ms, seg.end_ms,
                    seg.confidence, seg.language,
                ],
            ).map_err(|e| format!("Segment insert error: {e}"))?;

            // Insert word timestamps
            let mut words = Vec::new();
            for w in &seg.words {
                conn.execute(
                    "INSERT INTO podcast_word_timestamps
                        (segment_id, word, start_ms, end_ms, confidence)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![seg_id, w.word, w.start_ms, w.end_ms, w.confidence],
                ).ok();
                words.push(PodcastWordTimestamp {
                    word: w.word.clone(),
                    start_ms: w.start_ms,
                    end_ms: w.end_ms,
                    confidence: w.confidence,
                });
            }

            if !full_text.is_empty() { full_text.push(' '); }
            full_text.push_str(&seg.text);
            total_word_count += seg.text.split_whitespace().count() as i64;

            result_segments.push(PodcastTranscriptSegment {
                id: seg_id,
                episode_id: episode_id.clone(),
                text: seg.text.clone(),
                start_ms: seg.start_ms,
                end_ms: seg.end_ms,
                confidence: seg.confidence,
                language: seg.language.clone(),
                words,
            });
        }

        // Update episode
        conn.execute(
            "UPDATE podcast_episodes SET
                transcript = ?1,
                transcript_status = 'completed',
                word_count = ?2
             WHERE id = ?3",
            rusqlite::params![full_text, total_word_count, episode_id],
        ).map_err(|e| format!("Episode update error: {e}"))?;

        drop(conn);

        // Auto-run NLP analysis
        let _ = run_nlp_analysis(&state, &episode_id, &full_text);

        // Emit completion event
        let _ = app.emit("podcast-transcription-complete", &episode_id);

        Ok(result_segments)
    }
}

#[tauri::command]
pub fn podcast_get_transcript_segments(
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<Vec<PodcastTranscriptSegment>, String> {
    let conn = lock_db(&state)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, episode_id, text, start_ms, end_ms, confidence, language
             FROM podcast_transcript_segments
             WHERE episode_id = ?1
             ORDER BY start_ms ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![episode_id], |row: &rusqlite::Row| {
            Ok(PodcastTranscriptSegment {
                id: row.get(0)?,
                episode_id: row.get(1)?,
                text: row.get(2)?,
                start_ms: row.get(3)?,
                end_ms: row.get(4)?,
                confidence: row.get(5)?,
                language: row.get(6)?,
                words: Vec::new(), // Filled below
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    let mut segments: Vec<PodcastTranscriptSegment> = Vec::new();
    for row in rows {
        let mut seg = row.map_err(|e| format!("Row error: {e}"))?;

        // Fetch word timestamps for this segment
        let mut word_stmt = conn
            .prepare(
                "SELECT word, start_ms, end_ms, confidence
                 FROM podcast_word_timestamps
                 WHERE segment_id = ?1
                 ORDER BY start_ms ASC",
            )
            .map_err(|e| format!("Word query error: {e}"))?;

        let words = word_stmt
            .query_map(rusqlite::params![seg.id], |wrow: &rusqlite::Row| {
                Ok(PodcastWordTimestamp {
                    word: wrow.get(0)?,
                    start_ms: wrow.get(1)?,
                    end_ms: wrow.get(2)?,
                    confidence: wrow.get(3)?,
                })
            })
            .map_err(|e| format!("Word query error: {e}"))?;

        seg.words = words.filter_map(|w| w.ok()).collect();
        segments.push(seg);
    }

    Ok(segments)
}

// ── NLP Analysis Commands ──────────────────────────────

fn run_nlp_analysis(
    state: &State<'_, AppState>,
    episode_id: &str,
    text: &str,
) -> Result<NlpAnalysis, String> {
    let result = nlp::analyze_text(text);

    let cefr_dist_json = serde_json::to_string(&result.cefr_distribution)
        .unwrap_or_else(|_| "{}".into());
    let top_words_json = serde_json::to_string(&result.top_words)
        .unwrap_or_else(|_| "[]".into());

    let conn = lock_db(state)?;

    // Upsert analysis
    conn.execute(
        "INSERT INTO podcast_nlp_analysis
            (id, episode_id, total_words, unique_words, cefr_level,
             cefr_distribution, avg_sentence_length, vocabulary_richness, top_words)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(episode_id) DO UPDATE SET
            total_words = ?2, unique_words = ?3, cefr_level = ?4,
            cefr_distribution = ?5, avg_sentence_length = ?6,
            vocabulary_richness = ?7, top_words = ?8",
        rusqlite::params![
            episode_id,
            result.total_words,
            result.unique_words,
            result.cefr_level,
            cefr_dist_json,
            result.avg_sentence_length,
            result.vocabulary_richness,
            top_words_json,
        ],
    )
    .map_err(|e| format!("NLP insert error: {e}"))?;

    // Update episode CEFR
    conn.execute(
        "UPDATE podcast_episodes SET cefr_level = ?1 WHERE id = ?2",
        rusqlite::params![result.cefr_level, episode_id],
    ).ok();

    // Fetch the stored analysis
    conn.query_row(
        "SELECT id, episode_id, total_words, unique_words, cefr_level,
                cefr_distribution, avg_sentence_length, vocabulary_richness,
                top_words, created_at
         FROM podcast_nlp_analysis WHERE episode_id = ?1",
        rusqlite::params![episode_id],
        map_nlp_row,
    )
    .map_err(|e| format!("NLP lookup error: {e}"))
}

#[tauri::command]
pub fn podcast_analyze_episode(
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<NlpAnalysis, String> {
    let conn = lock_db(&state)?;
    let transcript: String = conn
        .query_row(
            "SELECT transcript FROM podcast_episodes WHERE id = ?1",
            rusqlite::params![episode_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Episode not found: {e}"))?;

    drop(conn);
    run_nlp_analysis(&state, &episode_id, &transcript)
}

#[tauri::command]
pub fn podcast_get_analysis(
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<NlpAnalysis, String> {
    let conn = lock_db(&state)?;
    conn.query_row(
        "SELECT id, episode_id, total_words, unique_words, cefr_level,
                cefr_distribution, avg_sentence_length, vocabulary_richness,
                top_words, created_at
         FROM podcast_nlp_analysis WHERE episode_id = ?1",
        rusqlite::params![episode_id],
        map_nlp_row,
    )
    .map_err(|e| format!("Analysis not found: {e}"))
}

// ── Translation ────────────────────────────────────────

#[tauri::command]
pub async fn podcast_translate_word(
    word: String,
    source_lang: String,
    target_lang: String,
) -> Result<TranslationResult, String> {
    let url = format!(
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl={}&tl={}&dt=t&dt=at&dt=ex&dt=bd&q={}",
        source_lang, target_lang,
        urlencoding::encode(&word)
    );

    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Translation request failed: {e}"))?;

    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read translation response: {e}"))?;

    let data: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse translation JSON: {e}"))?;

    // data[0][0][0] = main translation
    let translation = data
        .get(0)
        .and_then(|v| v.get(0))
        .and_then(|v| v.get(0))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // data[1] = alternative translations grouped by POS
    let mut alternatives = Vec::new();
    if let Some(alt_arr) = data.get(1).and_then(|v| v.as_array()) {
        for entry in alt_arr {
            let pos = entry.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let words: Vec<String> = entry
                .get(1)
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            if !words.is_empty() {
                alternatives.push(TranslationAlternative { pos, words });
            }
        }
    }

    // data[13][0] = examples (HTML strings)
    let mut examples = Vec::new();
    if let Some(ex_arr) = data.get(13).and_then(|v| v.get(0)).and_then(|v| v.as_array()) {
        for entry in ex_arr.iter().take(3) {
            if let Some(html) = entry.get(0).and_then(|v| v.as_str()) {
                // Strip HTML tags
                let clean = regex::Regex::new(r"<[^>]+>")
                    .map(|re| re.replace_all(html, "").to_string())
                    .unwrap_or_else(|_| html.to_string());
                examples.push(clean);
            }
        }
    }

    // CEFR level from our local word list
    let cefr_level = nlp::word_to_cefr(&word.to_lowercase());

    Ok(TranslationResult {
        word,
        translation,
        source_lang,
        target_lang,
        alternatives,
        examples,
        cefr_level,
    })
}

// ── Word CEFR Batch ────────────────────────────────────

#[tauri::command]
pub fn podcast_get_words_cefr(
    words: Vec<String>,
) -> Result<Vec<(String, String)>, String> {
    Ok(words
        .into_iter()
        .map(|w| {
            let cefr = nlp::word_to_cefr(&w.to_lowercase());
            (w, cefr)
        })
        .collect())
}

// ── Sync Points ───────────────────────────────────────

#[tauri::command]
pub fn podcast_get_sync_points(
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<Vec<SyncPoint>, String> {
    let conn = lock_db(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, episode_id, audio_time, subtitle_time
             FROM podcast_sync_points WHERE episode_id = ?1 ORDER BY audio_time",
        )
        .map_err(|e| format!("Failed to prepare sync query: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![episode_id], |row| {
            Ok(SyncPoint {
                id: row.get(0)?,
                episode_id: row.get(1)?,
                audio_time: row.get(2)?,
                subtitle_time: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to query sync points: {e}"))?;

    let mut points = Vec::new();
    for row in rows {
        points.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(points)
}

#[derive(serde::Deserialize)]
pub struct SyncPointInput {
    pub audio_time: f64,
    pub subtitle_time: f64,
}

#[tauri::command]
pub fn podcast_save_sync_points(
    state: State<'_, AppState>,
    episode_id: String,
    points: Vec<SyncPointInput>,
) -> Result<Vec<SyncPoint>, String> {
    let conn = lock_db(&state)?;

    // Delete existing sync points for this episode
    conn.execute(
        "DELETE FROM podcast_sync_points WHERE episode_id = ?1",
        rusqlite::params![episode_id],
    )
    .map_err(|e| format!("Failed to clear sync points: {e}"))?;

    // Insert new sync points
    let mut result = Vec::new();
    for p in &points {
        conn.execute(
            "INSERT INTO podcast_sync_points (episode_id, audio_time, subtitle_time) VALUES (?1, ?2, ?3)",
            rusqlite::params![episode_id, p.audio_time, p.subtitle_time],
        )
        .map_err(|e| format!("Failed to insert sync point: {e}"))?;

        let id = conn.last_insert_rowid();
        result.push(SyncPoint {
            id,
            episode_id: episode_id.clone(),
            audio_time: p.audio_time,
            subtitle_time: p.subtitle_time,
        });
    }

    Ok(result)
}

#[tauri::command]
pub fn podcast_clear_sync_points(
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "DELETE FROM podcast_sync_points WHERE episode_id = ?1",
        rusqlite::params![episode_id],
    )
    .map_err(|e| format!("Failed to clear sync points: {e}"))?;
    Ok(())
}

fn map_nlp_row(row: &rusqlite::Row) -> rusqlite::Result<NlpAnalysis> {
    Ok(NlpAnalysis {
        id: row.get(0)?,
        episode_id: row.get(1)?,
        total_words: row.get(2)?,
        unique_words: row.get(3)?,
        cefr_level: row.get(4)?,
        cefr_distribution: row.get(5)?,
        avg_sentence_length: row.get(6)?,
        vocabulary_richness: row.get(7)?,
        top_words: row.get(8)?,
        created_at: row.get(9)?,
    })
}
