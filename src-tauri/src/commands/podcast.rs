use std::process::Stdio;

use tauri::{Emitter, Manager, State};
use futures_util::StreamExt;
use tokio::io::{AsyncBufReadExt, BufReader, AsyncReadExt};
use tokio_util::sync::CancellationToken;

use crate::jobs::{JobType, JobStatus, JobEvent, JobEntry};
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

/// One feed by id, regardless of subscription state.
///
/// `podcast_list_feeds` intentionally returns only subscribed feeds, but an episode
/// imported from the cloud or played from discovery belongs to an UNSUBSCRIBED feed
/// row — and the player still needs that row (it carries the feed's language).
#[tauri::command]
pub fn podcast_get_feed(
    state: State<'_, AppState>,
    id: String,
) -> Result<PodcastFeed, String> {
    let conn = lock_db(&state)?;
    let sql = format!("SELECT {FEED_COLUMNS} FROM podcast_feeds WHERE id = ?1");
    conn.query_row(&sql, rusqlite::params![id], map_feed_row)
        .map_err(|e| format!("Feed not found: {e}"))
}

#[tauri::command]
pub fn podcast_list_feeds(
    state: State<'_, AppState>,
) -> Result<Vec<PodcastFeed>, String> {
    let conn = lock_db(&state)?;

    let sql = format!(
        "SELECT {FEED_COLUMNS} FROM podcast_feeds
         WHERE is_subscribed = 1
         ORDER BY updated_at DESC"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {e}"))?;

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

    let sql = format!(
        "SELECT {EPISODE_COLUMNS} FROM podcast_episodes
         WHERE feed_id = ?1
         ORDER BY published_at DESC
         LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {e}"))?;

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
    let sql = format!("SELECT {EPISODE_COLUMNS} FROM podcast_episodes WHERE id = ?1");
    conn.query_row(&sql, rusqlite::params![id], map_episode_row)
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

// ── Cloud → local bridge ────────────────────────────────

/// Materialize a cloud-discovered episode (from `episodes-by-level`,
/// `browse-episodes`, `curated-episodes`, …) as local `podcast_feeds` +
/// `podcast_episodes` rows, returning the local episode id.
///
/// This is the bridge that lets every existing local capability — player,
/// download, Whisper transcription, bookmarks, NLP, vocab, quiz — operate on
/// cloud episodes without a parallel "cloud episode" code path.
///
/// **Idempotent.** Re-importing the same episode updates its cloud metadata
/// (difficulty, ids) but never duplicates a row and never clobbers local
/// listening state (`play_position`, `is_played`, `is_downloaded`, `local_path`,
/// `transcript*`). The feed is inserted unsubscribed — importing an episode to
/// listen to it is not the same as subscribing to the show.
#[tauri::command]
pub fn podcast_import_cloud_episode(
    state: State<'_, AppState>,
    episode: CloudEpisodeInput,
) -> Result<String, String> {
    let conn = lock_db(&state)?;
    import_cloud_episode(&conn, &episode)
}

fn import_cloud_episode(
    conn: &rusqlite::Connection,
    episode: &CloudEpisodeInput,
) -> Result<String, String> {
    // A stable feed_url is the natural key for podcast_feeds. Cloud episodes may
    // not carry one, so synthesize a deterministic placeholder from the remote id.
    let feed_url = match (&episode.feed_url, episode.remote_feed_id) {
        (Some(u), _) if !u.trim().is_empty() => u.clone(),
        (_, Some(rid)) => format!("flexilingo://podcastindex/{rid}"),
        _ => return Err("CLOUD_EPISODE_MISSING_FEED".to_string()),
    };

    let feed_title = episode
        .podcast_title
        .clone()
        .unwrap_or_else(|| "Unknown podcast".to_string());
    let language = episode
        .podcast_language
        .clone()
        .or_else(|| episode.difficulty_lang.clone())
        .unwrap_or_else(|| "en".to_string());

    // Upsert the feed. `is_subscribed` is only set on INSERT so a later import
    // can't silently unsubscribe a show the user actually follows.
    conn.execute(
        "INSERT INTO podcast_feeds
            (id, title, author, description, feed_url, artwork_url, language,
             is_subscribed, remote_feed_id, last_refreshed)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, NULL, ?3, ?4, ?5, 0, ?6, datetime('now'))
         ON CONFLICT(feed_url) DO UPDATE SET
            title = ?1,
            author = COALESCE(?2, author),
            artwork_url = COALESCE(?4, artwork_url),
            language = ?5,
            remote_feed_id = COALESCE(?6, remote_feed_id),
            updated_at = datetime('now')",
        rusqlite::params![
            feed_title,
            episode.podcast_author,
            feed_url,
            episode.podcast_image_url,
            language,
            episode.remote_feed_id,
        ],
    )
    .map_err(|e| format!("Feed upsert error: {e}"))?;

    let feed_id: String = conn
        .query_row(
            "SELECT id FROM podcast_feeds WHERE feed_url = ?1",
            rusqlite::params![feed_url],
            |r| r.get(0),
        )
        .map_err(|e| format!("Feed lookup error: {e}"))?;

    // `guid` is the episode's natural key within a feed (UNIQUE(feed_id, guid)).
    // Cloud rows are addressed by video_id, so fall back to it, then to audio_url.
    let guid = episode
        .guid
        .clone()
        .or_else(|| episode.video_id.clone())
        .unwrap_or_else(|| episode.audio_url.clone());

    // Only cloud-owned columns are updated on conflict — local listening state
    // (play_position/is_played/is_downloaded/local_path/transcript) is preserved.
    conn.execute(
        "INSERT INTO podcast_episodes
            (id, feed_id, guid, title, description, audio_url, duration_seconds,
             published_at, video_id, curated_episode_id, difficulty_band,
             difficulty_score, difficulty_range_low, difficulty_range_high,
             difficulty_confidence, difficulty_lang, speech_rate_wpm, image_url)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
                 ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
         ON CONFLICT(feed_id, guid) DO UPDATE SET
            title = ?3,
            description = COALESCE(?4, description),
            audio_url = ?5,
            duration_seconds = CASE WHEN ?6 > 0 THEN ?6 ELSE duration_seconds END,
            published_at = COALESCE(?7, published_at),
            video_id = COALESCE(?8, video_id),
            curated_episode_id = COALESCE(?9, curated_episode_id),
            difficulty_band = COALESCE(?10, difficulty_band),
            difficulty_score = COALESCE(?11, difficulty_score),
            difficulty_range_low = COALESCE(?12, difficulty_range_low),
            difficulty_range_high = COALESCE(?13, difficulty_range_high),
            difficulty_confidence = COALESCE(?14, difficulty_confidence),
            difficulty_lang = COALESCE(?15, difficulty_lang),
            speech_rate_wpm = COALESCE(?16, speech_rate_wpm),
            image_url = COALESCE(?17, image_url)",
        rusqlite::params![
            feed_id,
            guid,
            episode.title,
            episode.description,
            episode.audio_url,
            episode.duration_seconds.unwrap_or(0),
            episode.published_at,
            episode.video_id,
            episode.curated_episode_id,
            episode.difficulty_band,
            episode.difficulty_score,
            episode.difficulty_range_low,
            episode.difficulty_range_high,
            episode.difficulty_confidence,
            episode.difficulty_lang,
            episode.speech_rate_wpm,
            episode.image_url,
        ],
    )
    .map_err(|e| format!("Episode upsert error: {e}"))?;

    conn.query_row(
        "SELECT id FROM podcast_episodes WHERE feed_id = ?1 AND guid = ?2",
        rusqlite::params![feed_id, guid],
        |r| r.get::<_, String>(0),
    )
    .map_err(|e| format!("Episode lookup error: {e}"))
}

#[cfg(test)]
mod import_tests {
    use super::*;
    use crate::db::schema::run_migrations;

    fn seed_episode(conn: &rusqlite::Connection) {
        conn.execute(
            "INSERT INTO podcast_feeds (id, feed_url, title, language)
             VALUES ('f1', 'https://example.com/rss', 'Feed', 'en')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO podcast_episodes (id, feed_id, title, audio_url, duration_seconds, video_id)
             VALUES ('e1', 'f1', 'Ep', 'https://example.com/a.mp3', 60, 'podcast_9_ep_1')",
            [],
        )
        .unwrap();
    }

    fn seed_local_segment(conn: &rusqlite::Connection) {
        conn.execute(
            "INSERT INTO podcast_transcript_segments
                (id, episode_id, text, start_ms, end_ms, confidence, language, source)
             VALUES ('loc1', 'e1', 'local words', 0, 1000, 0.9, 'en', 'local')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO podcast_word_timestamps (segment_id, word, start_ms, end_ms, confidence)
             VALUES ('loc1', 'local', 0, 500, 0.9)",
            [],
        )
        .unwrap();
    }

    fn chunk(i: i64, start: f64, end: f64, text: &str) -> CloudChunk {
        CloudChunk { chunk_index: i, start_time: start, end_time: end, text: text.into(), language: Some("en".into()) }
    }


    /// Fetching a cloud transcript stamps the episode with the transcript's
    /// language — the word dialog's source language for a French episode must be
    /// 'fr' even when the feed row says 'en'.

    /// V034 backfills episodes transcribed before the stamp existed — from LOCAL
    /// segments only. Cloud segments' 'en' was a fabricated default, not data.
    #[test]
    fn v034_backfills_from_local_segments_only() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::schema::run_migrations_through(&conn, "V033").unwrap();

        conn.execute_batch(
            "INSERT INTO podcast_feeds (id, feed_url, title, language)
             VALUES ('f1', 'u1', 'F', 'en');
             INSERT INTO podcast_episodes (id, feed_id, title, audio_url, duration_seconds, transcript_source)
             VALUES ('local_ep', 'f1', 'A', 'a1', 60, 'local'),
                    ('cloud_ep', 'f1', 'B', 'a2', 60, 'cloud');
             INSERT INTO podcast_transcript_segments (id, episode_id, text, start_ms, end_ms, language, source)
             VALUES ('s1', 'local_ep', 'bonjour', 0, 1000, 'fr', 'local'),
                    ('s2', 'local_ep', 'salut', 1000, 2000, 'fr', 'local'),
                    ('s3', 'cloud_ep', 'hello?', 0, 1000, 'en', 'cloud');",
        )
        .unwrap();

        crate::db::schema::run_migrations(&conn).unwrap();

        let local: Option<String> = conn
            .query_row("SELECT transcript_lang FROM podcast_episodes WHERE id='local_ep'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(local.as_deref(), Some("fr"), "local segments backfill the stamp");

        let cloud: Option<String> = conn
            .query_row("SELECT transcript_lang FROM podcast_episodes WHERE id='cloud_ep'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(cloud, None, "fabricated cloud 'en' must NOT be trusted");
    }

    #[test]
    fn cloud_fetch_stamps_transcript_lang() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        seed_episode(&conn); // feed language: 'en'

        let chunks = vec![CloudChunk {
            chunk_index: 0,
            start_time: 0.0,
            end_time: 2.0,
            text: "Bonjour tout le monde".into(),
            language: Some("fr".into()),
        }];
        store_cloud_transcript(&conn, "e1", chunks, None).unwrap();

        let lang: Option<String> = conn
            .query_row(
                "SELECT transcript_lang FROM podcast_episodes WHERE id = 'e1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(lang.as_deref(), Some("fr"));
        // And the analysis language follows it, not the feed's 'en'.
        assert_eq!(episode_analysis_lang(&conn, "e1"), "fr");
    }

    #[test]
    fn cloud_transcript_coexists_with_local_and_never_clobbers_it() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        seed_episode(&conn);
        seed_local_segment(&conn);

        store_cloud_transcript(
            &conn,
            "e1",
            vec![chunk(1, 1.5, 2.25, "second"), chunk(0, 0.0, 1.5, "first")],
            None,
        )
        .unwrap();

        // Local rows survive untouched, including their word timestamps.
        assert_eq!(segment_count(&conn, "e1", "local"), 1);
        let words: i64 = conn
            .query_row("SELECT COUNT(*) FROM podcast_word_timestamps WHERE segment_id = 'loc1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(words, 1, "local word timestamps must not be wiped");

        // Cloud rows land, ordered by chunk_index, with seconds converted to ms.
        assert_eq!(segment_count(&conn, "e1", "cloud"), 2);
        let (text, start, end): (String, i64, i64) = conn
            .query_row(
                "SELECT text, start_ms, end_ms FROM podcast_transcript_segments
                 WHERE episode_id='e1' AND source='cloud' ORDER BY start_ms LIMIT 1",
                [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!((text.as_str(), start, end), ("first", 0, 1500));

        // Fetching the cloud transcript activates it.
        let (active, status): (String, String) = conn
            .query_row("SELECT transcript_source, cloud_transcript_status FROM podcast_episodes WHERE id='e1'", [],
                       |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(active, "cloud");
        assert_eq!(status, "ready");
    }

    #[test]
    fn refetching_cloud_transcript_is_idempotent() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        seed_episode(&conn);

        for _ in 0..3 {
            store_cloud_transcript(&conn, "e1", vec![chunk(0, 0.0, 1.0, "hello")], None).unwrap();
        }
        assert_eq!(segment_count(&conn, "e1", "cloud"), 1, "re-import must replace, not duplicate");
    }

    #[test]
    fn cloud_cefr_analysis_collapses_to_level_counts() {
        // The UI reads a flat {level: count} map; the cloud sends word lists.
        let nlp = serde_json::json!({
            "cefr_analysis": { "vocabulary": { "words_by_level": {
                "a1": ["the", "a"], "B2": ["nuance"], "C1": ["ostensibly", "coda", "elide"]
            }}}
        });
        let dist = cloud_cefr_distribution(&nlp);
        assert_eq!(dist.get("A1"), Some(&2), "levels are upper-cased");
        assert_eq!(dist.get("B2"), Some(&1));
        assert_eq!(dist.get("C1"), Some(&3));
        assert_eq!(dist.get("C2"), None);

        // A payload without the nested vocabulary block must not panic.
        assert!(cloud_cefr_distribution(&serde_json::json!({})).is_empty());
    }

    #[test]
    fn cloud_nlp_is_stored_separately_from_local_nlp() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        seed_episode(&conn);

        conn.execute(
            "INSERT INTO podcast_nlp_analysis (episode_id, source, total_words, cefr_level)
             VALUES ('e1', 'local', 10, 'A2')",
            [],
        )
        .unwrap();

        let nlp = serde_json::json!({
            "total_words": 200, "unique_words": 120, "average_cefr_level": "B2",
            "cefr_analysis": {"B2": 40}, "vocabulary_stats": {"x": 1}
        });
        store_cloud_transcript(&conn, "e1", vec![chunk(0, 0.0, 1.0, "hi")], Some(&nlp)).unwrap();

        let local_cefr: String = conn
            .query_row("SELECT cefr_level FROM podcast_nlp_analysis WHERE episode_id='e1' AND source='local'", [], |r| r.get(0))
            .unwrap();
        let cloud_cefr: String = conn
            .query_row("SELECT cefr_level FROM podcast_nlp_analysis WHERE episode_id='e1' AND source='cloud'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(local_cefr, "A2", "local analysis is preserved");
        assert_eq!(cloud_cefr, "B2", "cloud analysis is stored alongside it");
    }

    #[test]
    fn whisper_lang_is_normalized() {
        assert_eq!(normalize_whisper_lang("en-us"), "en");
        assert_eq!(normalize_whisper_lang("fr_CA"), "fr");
        assert_eq!(normalize_whisper_lang("es"), "es");
        assert_eq!(normalize_whisper_lang("auto"), "auto");
        // A leading separator must not yield an empty language code.
        assert_eq!(normalize_whisper_lang("-us"), "auto");
    }

    #[test]
    fn episode_language_beats_feed_language() {
        // A feed tagged `en` that publishes a Spanish episode must transcribe as Spanish.
        assert_eq!(resolve_transcribe_lang(Some("es"), Some("en")), "es");
        // Fall back to the feed when the episode was never analyzed.
        assert_eq!(resolve_transcribe_lang(None, Some("fr-CA")), "fr");
        assert_eq!(resolve_transcribe_lang(Some(""), Some("de")), "de");
        // Nothing known at all → let whisper detect.
        assert_eq!(resolve_transcribe_lang(None, None), "auto");
    }

    fn cloud_episode() -> CloudEpisodeInput {
        CloudEpisodeInput {
            remote_feed_id: Some(12345),
            feed_url: None,
            podcast_title: Some("Test Show".into()),
            podcast_author: Some("Author".into()),
            podcast_image_url: Some("http://img".into()),
            podcast_language: Some("en".into()),
            video_id: Some("podcast_12345_ep_678".into()),
            curated_episode_id: Some("uuid-abc".into()),
            guid: None,
            title: "Episode One".into(),
            description: Some("Desc".into()),
            audio_url: "http://audio.mp3".into(),
            duration_seconds: Some(1800),
            published_at: Some("2026-07-01".into()),
            image_url: None,
            difficulty_band: Some("B1".into()),
            difficulty_score: Some(62),
            difficulty_range_low: Some("A2".into()),
            difficulty_range_high: Some("B2".into()),
            difficulty_confidence: Some("high".into()),
            difficulty_lang: Some("en".into()),
            speech_rate_wpm: Some(150),
        }
    }

    fn setup() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn imports_cloud_episode_with_difficulty() {
        let conn = setup();
        let id = import_cloud_episode(&conn, &cloud_episode()).unwrap();
        assert!(!id.is_empty());

        let (band, score, video_id, curated): (String, i64, String, String) = conn
            .query_row(
                "SELECT difficulty_band, difficulty_score, video_id, curated_episode_id
                 FROM podcast_episodes WHERE id = ?1",
                rusqlite::params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(band, "B1");
        assert_eq!(score, 62);
        assert_eq!(video_id, "podcast_12345_ep_678");
        assert_eq!(curated, "uuid-abc");

        // The feed is created but NOT subscribed — importing to listen != following.
        let (subscribed, remote): (i64, i64) = conn
            .query_row(
                "SELECT is_subscribed, remote_feed_id FROM podcast_feeds LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(subscribed, 0);
        assert_eq!(remote, 12345);
    }

    #[test]
    fn reimport_is_idempotent_and_preserves_local_state() {
        let conn = setup();
        let id = import_cloud_episode(&conn, &cloud_episode()).unwrap();

        // Simulate the user listening + downloading + transcribing locally.
        conn.execute(
            "UPDATE podcast_episodes
             SET play_position = 42000, is_played = 1, is_downloaded = 1,
                 local_path = '/tmp/ep.mp3', transcript_status = 'completed'
             WHERE id = ?1",
            rusqlite::params![id],
        )
        .unwrap();

        // Re-import the same episode with a refreshed difficulty score.
        let mut updated = cloud_episode();
        updated.difficulty_score = Some(70);
        updated.title = "Episode One (remastered)".into();
        let id2 = import_cloud_episode(&conn, &updated).unwrap();

        assert_eq!(id, id2, "same row, not a duplicate");
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM podcast_episodes", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        let feeds: i64 = conn
            .query_row("SELECT COUNT(*) FROM podcast_feeds", [], |r| r.get(0))
            .unwrap();
        assert_eq!(feeds, 1);

        let (pos, played, downloaded, path, tstatus, score, title): (
            i64, i64, i64, String, String, i64, String,
        ) = conn
            .query_row(
                "SELECT play_position, is_played, is_downloaded, local_path,
                        transcript_status, difficulty_score, title
                 FROM podcast_episodes WHERE id = ?1",
                rusqlite::params![id],
                |r| {
                    Ok((
                        r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?,
                    ))
                },
            )
            .unwrap();

        // Local listening state survives the re-import…
        assert_eq!(pos, 42000, "play_position must not be clobbered");
        assert_eq!(played, 1);
        assert_eq!(downloaded, 1);
        assert_eq!(path, "/tmp/ep.mp3");
        assert_eq!(tstatus, "completed");
        // …while cloud-owned fields refresh.
        assert_eq!(score, 70);
        assert_eq!(title, "Episode One (remastered)");
    }

    #[test]
    fn subscribed_feed_is_not_unsubscribed_by_import() {
        let conn = setup();
        import_cloud_episode(&conn, &cloud_episode()).unwrap();
        conn.execute("UPDATE podcast_feeds SET is_subscribed = 1", []).unwrap();

        import_cloud_episode(&conn, &cloud_episode()).unwrap();
        let subscribed: i64 = conn
            .query_row("SELECT is_subscribed FROM podcast_feeds LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(subscribed, 1, "import must never unsubscribe a followed show");
    }

    #[test]
    fn missing_feed_identity_is_rejected() {
        let conn = setup();
        let mut ep = cloud_episode();
        ep.remote_feed_id = None;
        ep.feed_url = None;
        assert_eq!(
            import_cloud_episode(&conn, &ep).unwrap_err(),
            "CLOUD_EPISODE_MISSING_FEED"
        );
    }
}

// ── Row Mappers ─────────────────────────────────────────

/// Column list for every `podcast_feeds` SELECT that feeds `map_feed_row`.
/// Keep the order in lockstep with the mapper's positional `row.get(n)`.
const FEED_COLUMNS: &str = "id, title, author, description, feed_url, website_url, artwork_url,
     language, category, episode_count, last_refreshed, is_subscribed,
     created_at, updated_at, remote_feed_id, difficulty_band_low,
     difficulty_band_high, difficulty_score_median, difficulty_episodes_scored";

/// Column list for every `podcast_episodes` SELECT that feeds `map_episode_row`.
const EPISODE_COLUMNS: &str = "id, feed_id, guid, title, description, audio_url,
     duration_seconds, published_at, file_size, is_downloaded,
     local_path, play_position, is_played, transcript,
     transcript_status, cefr_level, word_count, created_at,
     video_id, curated_episode_id, difficulty_band, difficulty_score,
     difficulty_range_low, difficulty_range_high, difficulty_confidence,
     difficulty_lang, speech_rate_wpm,
     transcript_source, cloud_transcript_status, image_url, transcript_lang";

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
        remote_feed_id: row.get(14)?,
        difficulty_band_low: row.get(15)?,
        difficulty_band_high: row.get(16)?,
        difficulty_score_median: row.get(17)?,
        difficulty_episodes_scored: row.get(18)?,
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
        video_id: row.get(18)?,
        curated_episode_id: row.get(19)?,
        difficulty_band: row.get(20)?,
        difficulty_score: row.get(21)?,
        difficulty_range_low: row.get(22)?,
        difficulty_range_high: row.get(23)?,
        difficulty_confidence: row.get(24)?,
        difficulty_lang: row.get(25)?,
        speech_rate_wpm: row.get(26)?,
        transcript_source: row.get(27)?,
        cloud_transcript_status: row.get(28)?,
        image_url: row.get(29)?,
        transcript_lang: row.get(30)?,
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
    let sql = format!("SELECT {FEED_COLUMNS} FROM podcast_feeds WHERE id = ?1");
    conn.query_row(&sql, rusqlite::params![id], map_feed_row)
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

/// Normalize a language tag for whisper: `en-us` → `en`, `fr_CA` → `fr`.
/// `auto` passes through so whisper does its own detection.
fn normalize_whisper_lang(lang: &str) -> String {
    if lang == "auto" {
        return lang.to_string();
    }
    lang.split(|c| c == '-' || c == '_')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("auto")
        .to_string()
}

/// The episode's cloud-detected language beats the feed's declared one, because
/// RSS publishers routinely tag a feed `en` while publishing other languages.
/// When Whisper runs without `-l` it prints its detection to stderr, e.g.
/// `whisper_full_with_state: auto-detected language: fr (p = 0.976211)`.
/// This is the only place the detected language surfaces in streaming mode.
fn whisper_detected_lang(stderr: &str) -> Option<String> {
    let idx = stderr.find("auto-detected language:")?;
    let rest = stderr["auto-detected language:".len() + idx..].trim_start();
    let code: String = rest
        .chars()
        .take_while(|c| c.is_ascii_alphabetic())
        .collect();
    (!code.is_empty()).then(|| code.to_lowercase())
}

fn resolve_transcribe_lang(episode_lang: Option<&str>, feed_lang: Option<&str>) -> String {
    let pick = episode_lang
        .filter(|l| !l.is_empty())
        .or(feed_lang.filter(|l| !l.is_empty()))
        .unwrap_or("auto");
    normalize_whisper_lang(pick)
}

#[tauri::command]
pub async fn podcast_transcribe_episode(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<Vec<PodcastTranscriptSegment>, String> {
    // 1. Get episode info and whisper config
    let (local_path, language, binary_path, model_path) = {
        let conn = lock_db(&state)?;

        let (local_path, feed_id, episode_lang): (Option<String>, String, Option<String>) = conn
            .query_row(
                "SELECT local_path, feed_id, difficulty_lang FROM podcast_episodes WHERE id = ?1",
                rusqlite::params![episode_id],
                |row: &rusqlite::Row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|e| format!("Episode not found: {e}"))?;

        let audio_path = local_path.ok_or("Episode must be downloaded before transcription")?;

        let feed_lang: Option<String> = conn
            .query_row(
                "SELECT language FROM podcast_feeds WHERE id = ?1",
                rusqlite::params![feed_id],
                |row: &rusqlite::Row| row.get(0),
            )
            .ok();

        let lang = resolve_transcribe_lang(episode_lang.as_deref(), feed_lang.as_deref());

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
            // Scoped to 'local': re-transcribing must not wipe a cached cloud transcript.
            "DELETE FROM podcast_transcript_segments WHERE episode_id = ?1 AND source = 'local'",
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
                    (id, episode_id, text, start_ms, end_ms, confidence, language, source)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'local')",
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

        // The transcript's language becomes the episode's authoritative language for
        // word lookups and analysis: the language we forced on Whisper, or — when it
        // ran on auto — whatever Whisper itself detected on stderr.
        let transcript_lang: Option<String> = if language != "auto" {
            Some(language.clone())
        } else {
            whisper_detected_lang(&stderr_text)
        };

        // Update episode
        conn.execute(
            "UPDATE podcast_episodes SET
                transcript = ?1,
                transcript_status = 'completed',
                 transcript_source = 'local',
                word_count = ?2,
                transcript_lang = COALESCE(?4, transcript_lang)
             WHERE id = ?3",
            rusqlite::params![full_text, total_word_count, episode_id, transcript_lang],
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
            "SELECT s.id, s.episode_id, s.text, s.start_ms, s.end_ms, s.confidence, s.language
             FROM podcast_transcript_segments s
             JOIN podcast_episodes e ON e.id = s.episode_id
             WHERE s.episode_id = ?1 AND s.source = e.transcript_source
             ORDER BY s.start_ms ASC",
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

/// The language a transcript should be analyzed in.
///
/// `transcript_lang` — the language the transcript was actually MADE in — is
/// authoritative. Then the episode's cloud-detected language, then the feed's
/// declared one (publishers mistag feeds; a missing RSS tag is stored as 'en').
/// Mirrors `episodeSourceLang` on the frontend — keep the two in step.
fn episode_analysis_lang(conn: &rusqlite::Connection, episode_id: &str) -> String {
    conn.query_row(
        "SELECT COALESCE(NULLIF(e.transcript_lang, ''), NULLIF(e.difficulty_lang, ''),
                         NULLIF(f.language, ''), 'en')
         FROM podcast_episodes e
         JOIN podcast_feeds f ON f.id = e.feed_id
         WHERE e.id = ?1",
        rusqlite::params![episode_id],
        |row| row.get(0),
    )
    .unwrap_or_else(|_| "en".to_string())
}

/// Error code for transcripts in a language the local analyzer has no frequency
/// table for. The frontend resolves it via i18n; wrong numbers are never stored.
pub const NLP_LANG_UNSUPPORTED: &str = "NLP_LANG_UNSUPPORTED";

fn run_nlp_analysis(
    state: &State<'_, AppState>,
    episode_id: &str,
    text: &str,
) -> Result<NlpAnalysis, String> {
    let lang = {
        let conn = lock_db(state)?;
        episode_analysis_lang(&conn, episode_id)
    };
    let result = nlp::analyze_text(text, &lang).ok_or(NLP_LANG_UNSUPPORTED)?;

    let cefr_dist_json = serde_json::to_string(&result.cefr_distribution)
        .unwrap_or_else(|_| "{}".into());
    let top_words_json = serde_json::to_string(&result.top_words)
        .unwrap_or_else(|_| "[]".into());

    let conn = lock_db(state)?;

    // Upsert analysis
    conn.execute(
        "INSERT INTO podcast_nlp_analysis
            (id, episode_id, source, total_words, unique_words, cefr_level,
             cefr_distribution, avg_sentence_length, vocabulary_richness, top_words)
         VALUES (lower(hex(randomblob(16))), ?1, 'local', ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(episode_id, source) DO UPDATE SET
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
        "SELECT n.id, n.episode_id, n.total_words, n.unique_words, n.cefr_level,
                n.cefr_distribution, n.avg_sentence_length, n.vocabulary_richness,
                n.top_words, n.created_at
         FROM podcast_nlp_analysis n
         JOIN podcast_episodes e ON e.id = n.episode_id
         WHERE n.episode_id = ?1 AND n.source = e.transcript_source",
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
        "SELECT n.id, n.episode_id, n.total_words, n.unique_words, n.cefr_level,
                n.cefr_distribution, n.avg_sentence_length, n.vocabulary_richness,
                n.top_words, n.created_at
         FROM podcast_nlp_analysis n
         JOIN podcast_episodes e ON e.id = n.episode_id
         WHERE n.episode_id = ?1 AND n.source = e.transcript_source",
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

    // CEFR level from the word's own language table; None when unsupported.
    let cefr_level = nlp::word_to_cefr(&word.to_lowercase(), &source_lang);

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

/// Batch CEFR lookup for the subtitle/transcript word chips.
///
/// Empty result when `lang` has no table — the chips simply don't render, which is
/// the honest state. (This command used to score every word against English no
/// matter what language the episode was in.)
#[tauri::command]
pub fn podcast_get_words_cefr(
    words: Vec<String>,
    lang: Option<String>,
) -> Result<Vec<(String, String)>, String> {
    let lang = lang.unwrap_or_else(|| "en".to_string());
    Ok(words
        .into_iter()
        .filter_map(|w| {
            nlp::word_to_cefr(&w.to_lowercase(), &lang).map(|cefr| (w, cefr))
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

/// Run NLP analysis using a raw connection (for use in spawned tasks).
///
/// An unsupported language is a clean skip, not an error: this runs as a side
/// effect of transcription, and a Chinese transcript must not fail the transcribe
/// job just because local difficulty analysis can't cover it.
fn run_nlp_analysis_with_conn(
    conn: &rusqlite::Connection,
    episode_id: &str,
    text: &str,
) -> Result<(), String> {
    let lang = episode_analysis_lang(conn, episode_id);
    let Some(result) = nlp::analyze_text(text, &lang) else {
        return Ok(());
    };

    let cefr_dist_json = serde_json::to_string(&result.cefr_distribution)
        .unwrap_or_else(|_| "{}".into());
    let top_words_json = serde_json::to_string(&result.top_words)
        .unwrap_or_else(|_| "[]".into());

    conn.execute(
        "INSERT INTO podcast_nlp_analysis
            (id, episode_id, source, total_words, unique_words, cefr_level,
             cefr_distribution, avg_sentence_length, vocabulary_richness, top_words)
         VALUES (lower(hex(randomblob(16))), ?1, 'local', ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(episode_id, source) DO UPDATE SET
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

    conn.execute(
        "UPDATE podcast_episodes SET cefr_level = ?1 WHERE id = ?2",
        rusqlite::params![result.cefr_level, episode_id],
    ).ok();

    Ok(())
}

// ── Background Job Commands ─────────────────────────────

#[tauri::command]
pub async fn podcast_start_transcribe_job(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<String, String> {
    // 1. Validate episode exists, has local_path, get whisper config + episode title + duration
    let (local_path, language, binary_path, model_path, episode_title, duration_seconds) = {
        let conn = lock_db(&state)?;

        let (local_path, feed_id, title, duration): (Option<String>, String, String, i64) = conn
            .query_row(
                "SELECT local_path, feed_id, title, duration_seconds FROM podcast_episodes WHERE id = ?1",
                rusqlite::params![episode_id],
                |row: &rusqlite::Row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
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

        let lang = if feed_lang == "auto" {
            feed_lang
        } else {
            feed_lang.split(|c| c == '-' || c == '_').next().unwrap_or("auto").to_string()
        };

        (audio_path, lang, bin, model, title, duration)
    };

    // 2. Check for duplicate active job
    {
        let registry = state.jobs.lock().await;
        if registry.has_active_job_for_episode(&episode_id, &JobType::Transcribe) {
            return Err("A transcription job is already running for this episode".into());
        }
    }

    // 3. Mark DB as processing
    {
        let conn = lock_db(&state)?;
        conn.execute(
            "UPDATE podcast_episodes SET transcript_status = 'processing' WHERE id = ?1",
            rusqlite::params![episode_id],
        ).ok();
    }

    // 4. Validate paths
    whisper::validate_paths(&binary_path, &model_path, &local_path)?;

    // 5. Generate job ID, create cancellation token
    let job_id = whisper::uuid_hex();
    let cancel_token = CancellationToken::new();
    let child_token = cancel_token.child_token();

    // 6. Emit job:started
    let started_event = JobEvent {
        id: job_id.clone(),
        job_type: JobType::Transcribe,
        status: JobStatus::Running,
        episode_id: episode_id.clone(),
        episode_title: episode_title.clone(),
        progress: 0.0,
        error: None,
    };
    let _ = app.emit("job-started", &started_event);

    // 7. Spawn the transcription task
    let app_handle = app.clone();
    let job_id_clone = job_id.clone();
    let episode_id_clone = episode_id.clone();
    let episode_title_clone = episode_title.clone();

    let handle = tokio::spawn(async move {
        let result = run_transcribe_task(
            &app_handle,
            &job_id_clone,
            &episode_id_clone,
            &episode_title_clone,
            &local_path,
            &language,
            &binary_path,
            &model_path,
            duration_seconds,
            child_token,
        ).await;

        // Remove job from registry
        {
            let state = app_handle.state::<AppState>();
            let mut registry = state.jobs.lock().await;
            registry.remove(&job_id_clone);
        }

        // Emit final event
        match result {
            Ok(()) => {
                let _ = app_handle.emit("job-completed", JobEvent {
                    id: job_id_clone,
                    job_type: JobType::Transcribe,
                    status: JobStatus::Completed,
                    episode_id: episode_id_clone,
                    episode_title: episode_title_clone,
                    progress: 100.0,
                    error: None,
                });
            }
            Err(err) => {
                let _ = app_handle.emit("job-failed", JobEvent {
                    id: job_id_clone,
                    job_type: JobType::Transcribe,
                    status: JobStatus::Failed,
                    episode_id: episode_id_clone,
                    episode_title: episode_title_clone,
                    progress: 0.0,
                    error: Some(err),
                });
            }
        }
    });

    // 8. Insert into registry
    {
        let mut registry = state.jobs.lock().await;
        registry.insert(JobEntry {
            id: job_id.clone(),
            job_type: JobType::Transcribe,
            episode_id,
            episode_title,
            cancel_token,
            handle,
        });
    }

    Ok(job_id)
}

async fn run_transcribe_task(
    app: &tauri::AppHandle,
    job_id: &str,
    episode_id: &str,
    episode_title: &str,
    local_path: &str,
    language: &str,
    binary_path: &str,
    model_path: &str,
    duration_seconds: i64,
    cancel_token: CancellationToken,
) -> Result<(), String> {
    // Build whisper command
    let output_prefix = std::env::temp_dir()
        .join(format!("flexi_whisper_{}", whisper::uuid_hex()));
    let output_prefix_str = output_prefix.to_string_lossy().to_string();

    let mut args: Vec<String> = vec![
        "-m".into(), model_path.to_string(),
        "-f".into(), local_path.to_string(),
        "-oj".into(),
        "-of".into(), output_prefix_str.clone(),
    ];
    if language != "auto" {
        args.push("-l".into());
        args.push(language.to_string());
    }

    let mut child = tokio::process::Command::new(binary_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn whisper: {e}"))?;

    let stdout = child.stdout.take()
        .ok_or("Failed to capture whisper stdout")?;
    let stderr = child.stderr.take()
        .ok_or("Failed to capture whisper stderr")?;

    // Drain stderr in background
    let stderr_handle = tokio::spawn(async move {
        let mut buf = String::new();
        let mut reader = BufReader::new(stderr);
        let _ = reader.read_to_string(&mut buf).await;
        buf
    });

    // Read stdout line-by-line with cancellation support
    let re = regex::Regex::new(
        r"\[(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})\]\s*(.*)"
    ).unwrap();

    let duration_ms = duration_seconds * 1000;
    let mut streaming_index: i64 = 0;
    let mut reader = BufReader::new(stdout).lines();

    loop {
        tokio::select! {
            _ = cancel_token.cancelled() => {
                let _ = child.kill().await;

                // Mark as pending in DB
                {
                    let state = app.state::<AppState>();
                    let conn = state.db.lock();
                    if let Ok(conn) = conn {
                        conn.execute(
                            "UPDATE podcast_episodes SET transcript_status = 'pending' WHERE id = ?1",
                            rusqlite::params![episode_id],
                        ).ok();
                    }
                }

                let _ = app.emit("job-cancelled", JobEvent {
                    id: job_id.to_string(),
                    job_type: JobType::Transcribe,
                    status: JobStatus::Cancelled,
                    episode_id: episode_id.to_string(),
                    episode_title: episode_title.to_string(),
                    progress: 0.0,
                    error: None,
                });

                let _ = tokio::fs::remove_file(format!("{output_prefix_str}.json")).await;
                return Err("Job cancelled".into());
            }
            line = reader.next_line() => {
                match line {
                    Ok(Some(text)) => {
                        if let Some(caps) = re.captures(&text) {
                            let seg_text = caps[3].trim().to_string();
                            if seg_text.is_empty() || seg_text == "[BLANK_AUDIO]" {
                                continue;
                            }

                            let start_ms = whisper::parse_timestamp(&caps[1]);
                            let end_ms = whisper::parse_timestamp(&caps[2]);

                            // Estimate progress
                            let progress = if duration_ms > 0 {
                                ((end_ms as f64) / (duration_ms as f64) * 100.0).min(99.0)
                            } else {
                                0.0
                            };

                            // Emit progress event
                            let _ = app.emit("job-progress", JobEvent {
                                id: job_id.to_string(),
                                job_type: JobType::Transcribe,
                                status: JobStatus::Running,
                                episode_id: episode_id.to_string(),
                                episode_title: episode_title.to_string(),
                                progress,
                                error: None,
                            });

                            // Backward compat: emit segment event
                            let segment = PodcastTranscriptSegment {
                                id: format!("s_{streaming_index}"),
                                episode_id: episode_id.to_string(),
                                text: seg_text,
                                start_ms,
                                end_ms,
                                confidence: 0.0,
                                language: language.to_string(),
                                words: Vec::new(),
                            };
                            let _ = app.emit("podcast-transcript-segment", &segment);
                            streaming_index += 1;
                        }
                    }
                    Ok(None) => break, // EOF
                    Err(_) => break,
                }
            }
        }
    }

    // Wait for process completion
    let status = child.wait().await
        .map_err(|e| format!("Whisper process error: {e}"))?;

    let stderr_text = stderr_handle.await.unwrap_or_default();

    if !status.success() {
        {
            let state = app.state::<AppState>();
            let conn = state.db.lock().map_err(|e| format!("DB lock: {e}"))?;
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

    // Read JSON for full data with word-level timestamps
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

    let parsed_segments = whisper::parse_whisper_json(&json_content, language)?;

    // Store segments in DB
    {
        let state = app.state::<AppState>();
        let conn = state.db.lock().map_err(|e| format!("DB lock: {e}"))?;

        // Delete old segments if re-transcribing
        conn.execute(
            // Scoped to 'local': re-transcribing must not wipe a cached cloud transcript.
            "DELETE FROM podcast_transcript_segments WHERE episode_id = ?1 AND source = 'local'",
            rusqlite::params![episode_id],
        ).ok();

        let mut full_text = String::new();
        let mut total_word_count: i64 = 0;

        for seg in &parsed_segments {
            let seg_id = format!("{:032x}", std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos());

            conn.execute(
                "INSERT INTO podcast_transcript_segments
                    (id, episode_id, text, start_ms, end_ms, confidence, language, source)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'local')",
                rusqlite::params![
                    seg_id, episode_id, seg.text, seg.start_ms, seg.end_ms,
                    seg.confidence, seg.language,
                ],
            ).map_err(|e| format!("Segment insert error: {e}"))?;

            // Insert word timestamps
            for w in &seg.words {
                conn.execute(
                    "INSERT INTO podcast_word_timestamps
                        (segment_id, word, start_ms, end_ms, confidence)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![seg_id, w.word, w.start_ms, w.end_ms, w.confidence],
                ).ok();
            }

            if !full_text.is_empty() { full_text.push(' '); }
            full_text.push_str(&seg.text);
            total_word_count += seg.text.split_whitespace().count() as i64;
        }

        // The transcript's language becomes the episode's authoritative language for
        // word lookups and analysis: the language we forced on Whisper, or — when it
        // ran on auto — whatever Whisper itself detected on stderr.
        let transcript_lang: Option<String> = if language != "auto" {
            Some(language.to_string())
        } else {
            whisper_detected_lang(&stderr_text)
        };

        // Update episode
        conn.execute(
            "UPDATE podcast_episodes SET
                transcript = ?1,
                transcript_status = 'completed',
                 transcript_source = 'local',
                word_count = ?2,
                transcript_lang = COALESCE(?4, transcript_lang)
             WHERE id = ?3",
            rusqlite::params![full_text, total_word_count, episode_id, transcript_lang],
        ).map_err(|e| format!("Episode update error: {e}"))?;

        // Auto-run NLP analysis
        let _ = run_nlp_analysis_with_conn(&conn, episode_id, &full_text);
    }

    // Emit completion event (backward compat)
    let _ = app.emit("podcast-transcription-complete", episode_id);

    Ok(())
}

#[tauri::command]
pub async fn podcast_start_download_job(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<String, String> {
    // 1. Get episode audio URL and title
    let (audio_url, episode_title) = {
        let conn = lock_db(&state)?;
        conn.query_row(
            "SELECT audio_url, title FROM podcast_episodes WHERE id = ?1",
            rusqlite::params![episode_id],
            |row: &rusqlite::Row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|e| format!("Episode not found: {e}"))?
    };

    // 2. Check for duplicate active job
    {
        let registry = state.jobs.lock().await;
        if registry.has_active_job_for_episode(&episode_id, &JobType::Download) {
            return Err("A download job is already running for this episode".into());
        }
    }

    // 3. Generate job ID, create cancellation token
    let job_id = whisper::uuid_hex();
    let cancel_token = CancellationToken::new();
    let child_token = cancel_token.child_token();

    // 4. Emit job:started
    let started_event = JobEvent {
        id: job_id.clone(),
        job_type: JobType::Download,
        status: JobStatus::Running,
        episode_id: episode_id.clone(),
        episode_title: episode_title.clone(),
        progress: 0.0,
        error: None,
    };
    let _ = app.emit("job-started", &started_event);

    // 5. Spawn the download task
    let app_handle = app.clone();
    let job_id_clone = job_id.clone();
    let episode_id_clone = episode_id.clone();
    let episode_title_clone = episode_title.clone();

    let handle = tokio::spawn(async move {
        let result = run_download_task(
            &app_handle,
            &job_id_clone,
            &episode_id_clone,
            &episode_title_clone,
            &audio_url,
            child_token,
        ).await;

        // Remove job from registry
        {
            let state = app_handle.state::<AppState>();
            let mut registry = state.jobs.lock().await;
            registry.remove(&job_id_clone);
        }

        // Emit final event
        match result {
            Ok(()) => {
                let _ = app_handle.emit("job-completed", JobEvent {
                    id: job_id_clone,
                    job_type: JobType::Download,
                    status: JobStatus::Completed,
                    episode_id: episode_id_clone,
                    episode_title: episode_title_clone,
                    progress: 100.0,
                    error: None,
                });
            }
            Err(err) => {
                let _ = app_handle.emit("job-failed", JobEvent {
                    id: job_id_clone,
                    job_type: JobType::Download,
                    status: JobStatus::Failed,
                    episode_id: episode_id_clone,
                    episode_title: episode_title_clone,
                    progress: 0.0,
                    error: Some(err),
                });
            }
        }
    });

    // 6. Insert into registry
    {
        let mut registry = state.jobs.lock().await;
        registry.insert(JobEntry {
            id: job_id.clone(),
            job_type: JobType::Download,
            episode_id,
            episode_title,
            cancel_token,
            handle,
        });
    }

    Ok(job_id)
}

async fn run_download_task(
    app: &tauri::AppHandle,
    job_id: &str,
    episode_id: &str,
    episode_title: &str,
    audio_url: &str,
    cancel_token: CancellationToken,
) -> Result<(), String> {
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
        let state = app.state::<AppState>();
        let conn = state.db.lock().map_err(|e| format!("DB lock: {e}"))?;
        conn.execute(
            "UPDATE podcast_episodes SET is_downloaded = 1, local_path = ?1 WHERE id = ?2",
            rusqlite::params![path_str, episode_id],
        ).ok();
        return Ok(());
    }

    let response = reqwest::get(audio_url)
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

    loop {
        tokio::select! {
            _ = cancel_token.cancelled() => {
                drop(file);
                let _ = tokio::fs::remove_file(&tmp_path).await;

                let _ = app.emit("job-cancelled", JobEvent {
                    id: job_id.to_string(),
                    job_type: JobType::Download,
                    status: JobStatus::Cancelled,
                    episode_id: episode_id.to_string(),
                    episode_title: episode_title.to_string(),
                    progress: 0.0,
                    error: None,
                });

                return Err("Job cancelled".into());
            }
            chunk_result = stream.next() => {
                match chunk_result {
                    Some(Ok(chunk)) => {
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

                            // Emit job:progress
                            let _ = app.emit("job-progress", JobEvent {
                                id: job_id.to_string(),
                                job_type: JobType::Download,
                                status: JobStatus::Running,
                                episode_id: episode_id.to_string(),
                                episode_title: episode_title.to_string(),
                                progress: rounded,
                                error: None,
                            });

                            // Backward compat: emit download progress
                            let _ = app.emit("podcast-download-progress", EpisodeDownloadProgress {
                                episode_id: episode_id.to_string(),
                                downloaded_bytes: downloaded,
                                total_bytes,
                                percent: rounded,
                            });
                        }
                    }
                    Some(Err(e)) => {
                        drop(file);
                        let _ = tokio::fs::remove_file(&tmp_path).await;
                        return Err(format!("Download error: {e}"));
                    }
                    None => break, // Stream finished
                }
            }
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
        let state = app.state::<AppState>();
        let conn = state.db.lock().map_err(|e| format!("DB lock: {e}"))?;
        conn.execute(
            "UPDATE podcast_episodes SET is_downloaded = 1, local_path = ?1 WHERE id = ?2",
            rusqlite::params![path_str, episode_id],
        )
        .map_err(|e| format!("DB update error: {e}"))?;
    }

    // Emit backward compat 100%
    let _ = app.emit("podcast-download-progress", EpisodeDownloadProgress {
        episode_id: episode_id.to_string(),
        downloaded_bytes: total_bytes,
        total_bytes,
        percent: 100.0,
    });

    Ok(())
}

// ── Cloud Sync ─────────────────────────────────────────

/// Push locally-transcribed podcast segments to the FlexiLingo cloud.
/// Creates an nlp_jobs entry with transcription_complete=true so the
/// worker-v2 skips Whisper and runs NLP-only (spaCy pipeline).
#[tauri::command]
pub async fn podcast_sync_to_cloud(
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<serde_json::Value, String> {
    // 1. Read episode metadata + validate transcript is completed
    let (title, transcript_status) = {
        let conn = lock_db(&state)?;
        conn.query_row(
            "SELECT title, transcript_status FROM podcast_episodes WHERE id = ?1",
            rusqlite::params![episode_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|e| format!("Episode not found: {e}"))?
    };

    if transcript_status != "completed" {
        return Err(format!(
            "Transcript not ready (status: '{transcript_status}'). Transcribe the episode first."
        ));
    }

    // 2. Language of the transcript being uploaded. The cloud stores this verbatim
    // (text_detected_language / source_language / language on its side), so it must
    // be the transcript's OWN language — transcript_lang first, then the episode's
    // cloud-detected language, then the feed's declared one, which is publisher-
    // supplied and defaulted to 'en' when the RSS omits it. A French transcript
    // synced under 'en' poisons the cloud record and the admin panel.
    let source_language = {
        let conn = lock_db(&state)?;
        episode_analysis_lang(&conn, &episode_id)
    };

    // 3. Read transcript segments (text + timing only, no word timestamps)
    let segments = {
        let conn = lock_db(&state)?;
        let mut stmt = conn
            .prepare(
                "SELECT text, start_ms, end_ms
                 FROM podcast_transcript_segments
                 WHERE episode_id = ?1
                 ORDER BY start_ms ASC",
            )
            .map_err(|e| format!("Query error: {e}"))?;

        let rows: Vec<(String, i64, i64)> = stmt
            .query_map(rusqlite::params![episode_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| format!("Query error: {e}"))?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    if segments.is_empty() {
        return Err("No transcript segments found for this episode".to_string());
    }

    // 4. Build payload
    let segments_json: Vec<serde_json::Value> = segments
        .iter()
        .map(|(text, start_ms, end_ms)| {
            serde_json::json!({
                "text": text,
                "start_ms": start_ms,
                "end_ms": end_ms,
            })
        })
        .collect();

    let video_id = format!("desk_podcast_{episode_id}");

    let payload = serde_json::json!({
        "video_id": video_id,
        "title": title,
        "source_language": source_language,
        "segments": segments_json,
    });

    // 5. Send to cloud
    let result = crate::auth::supabase_call(
        state,
        "POST".to_string(),
        "/podcast?action=sync-desk-transcript".to_string(),
        Some(payload),
    )
    .await?;

    Ok(result)
}

// ── Cloud transcript (FlexiLingo) ──────────────────────
//
// Desk is local-first: Whisper on this machine is the default and the only path
// that yields word-level timestamps. But when FlexiLingo has already transcribed
// and analyzed an episode, the user can switch to that instead of spending a
// download + several minutes of CPU. Both transcripts are cached side by side in
// `podcast_transcript_segments.source`, so switching afterwards is instant and
// works offline.

/// What the UI needs to render the transcript-source dropdown.
#[derive(serde::Serialize)]
pub struct TranscriptSourceInfo {
    /// Stamped so callers can tell whose info this is — the player switches
    /// episodes faster than these round-trips resolve.
    pub episode_id: String,
    /// `local` | `cloud` — which transcript the player is showing.
    pub active: String,
    pub has_local: bool,
    pub has_cloud: bool,
    /// False when the episode has no `video_id`, i.e. it was never curated.
    pub cloud_possible: bool,
    /// `unknown` | `ready` | `unavailable`
    pub cloud_status: String,
}

/// A segment as returned by `/get-content-status`. Times are SECONDS here, unlike
/// desk's millisecond-based local segments.
#[derive(serde::Deserialize)]
struct CloudChunk {
    chunk_index: i64,
    start_time: f64,
    end_time: f64,
    text: String,
    #[serde(default)]
    language: Option<String>,
}

fn segment_count(conn: &rusqlite::Connection, episode_id: &str, source: &str) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM podcast_transcript_segments WHERE episode_id = ?1 AND source = ?2",
        rusqlite::params![episode_id, source],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

#[tauri::command]
pub fn podcast_transcript_source_info(
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<TranscriptSourceInfo, String> {
    let conn = lock_db(&state)?;

    let (active, cloud_status, video_id): (String, String, Option<String>) = conn
        .query_row(
            "SELECT transcript_source, cloud_transcript_status, video_id
             FROM podcast_episodes WHERE id = ?1",
            rusqlite::params![episode_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Episode not found: {e}"))?;

    Ok(TranscriptSourceInfo {
        has_local: segment_count(&conn, &episode_id, "local") > 0,
        has_cloud: segment_count(&conn, &episode_id, "cloud") > 0,
        cloud_possible: video_id.filter(|v| !v.is_empty()).is_some(),
        active,
        cloud_status,
        episode_id,
    })
}

/// Switch the player between the cached `local` and `cloud` transcripts.
/// Refuses to select a source that has no segments, so the UI can never land on
/// an empty transcript.
#[tauri::command]
pub fn podcast_set_transcript_source(
    state: State<'_, AppState>,
    episode_id: String,
    source: String,
) -> Result<(), String> {
    if source != "local" && source != "cloud" {
        return Err(format!("Unknown transcript source: {source}"));
    }
    let conn = lock_db(&state)?;
    if segment_count(&conn, &episode_id, &source) == 0 {
        return Err(format!("NO_{}_TRANSCRIPT", source.to_uppercase()));
    }
    conn.execute(
        "UPDATE podcast_episodes SET transcript_source = ?2 WHERE id = ?1",
        rusqlite::params![episode_id, source],
    )
    .map_err(|e| format!("Failed to switch transcript source: {e}"))?;
    Ok(())
}

/// Downloads FlexiLingo's transcript (and its NLP analysis) for an episode and
/// makes it the active source. Idempotent: re-running replaces the cached cloud
/// rows and never touches the local ones.
#[tauri::command]
pub async fn podcast_fetch_cloud_transcript(
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<Vec<PodcastTranscriptSegment>, String> {
    // Phase 1: read what we need, then drop the guard before any `.await`.
    let (video_id, access_token) = {
        let conn = lock_db(&state)?;
        let video_id: Option<String> = conn
            .query_row(
                "SELECT video_id FROM podcast_episodes WHERE id = ?1",
                rusqlite::params![episode_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Episode not found: {e}"))?;
        let video_id = video_id
            .filter(|v| !v.is_empty())
            .ok_or("NO_CLOUD_TRANSCRIPT")?;
        drop(conn);
        (video_id, crate::auth::stored_access_token(&state))
    };

    // Phase 2: network. `get-content-status` accepts a plaintext video_id and
    // grants transcript access to any curated episode with status='ready'.
    let path = format!(
        "/get-content-status?video_id={}",
        urlencoding::encode(&video_id)
    );
    let json = crate::auth::call_edge_function(access_token, "GET", &path, None)
        .await
        .map_err(|e| format!("Cloud transcript request failed: {e}"))?;

    let data = json.get("data").unwrap_or(&json);
    let chunks: Vec<CloudChunk> = data
        .get("chunks")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|e| format!("Malformed cloud transcript: {e}"))?
        .unwrap_or_default();

    if chunks.is_empty() {
        let conn = lock_db(&state)?;
        conn.execute(
            "UPDATE podcast_episodes SET cloud_transcript_status = 'unavailable' WHERE id = ?1",
            rusqlite::params![episode_id],
        )
        .ok();
        return Err("NO_CLOUD_TRANSCRIPT".to_string());
    }

    let nlp = data.get("nlp_analysis").cloned();

    // Phase 3: write.
    let conn = lock_db(&state)?;
    store_cloud_transcript(&conn, &episode_id, chunks, nlp.as_ref())?;
    drop(conn);

    podcast_get_transcript_segments(state, episode_id)
}

/// The cloud reports CEFR as `cefr_analysis.vocabulary.words_by_level`
/// (level -> list of words). Desk's local NLP produces a flat `level -> count`
/// map, and the UI reads only that shape — so collapse the cloud's into it
/// rather than teaching the UI two formats.
fn cloud_cefr_distribution(nlp: &serde_json::Value) -> std::collections::HashMap<String, i64> {
    let mut out = std::collections::HashMap::new();
    let by_level = nlp
        .get("cefr_analysis")
        .and_then(|c| c.get("vocabulary"))
        .and_then(|v| v.get("words_by_level"))
        .and_then(|w| w.as_object());

    if let Some(map) = by_level {
        for (level, words) in map {
            let n = words.as_array().map(|a| a.len() as i64).unwrap_or(0);
            out.insert(level.to_uppercase(), n);
        }
    }
    out
}

/// Replaces the cached cloud transcript for an episode and activates it.
/// Local segments and the local NLP analysis are left untouched.
fn store_cloud_transcript(
    conn: &rusqlite::Connection,
    episode_id: &str,
    mut chunks: Vec<CloudChunk>,
    nlp: Option<&serde_json::Value>,
) -> Result<(), String> {
    chunks.sort_by_key(|c| c.chunk_index);

    // The cloud stamps each chunk with the episode's detected language; the first
    // chunk that carries one speaks for the transcript.
    let cloud_lang: Option<String> = chunks.iter().find_map(|c| {
        c.language
            .as_deref()
            .filter(|l| !l.is_empty())
            .map(|l| l.to_lowercase())
    });

    conn.execute(
        "DELETE FROM podcast_transcript_segments WHERE episode_id = ?1 AND source = 'cloud'",
        rusqlite::params![episode_id],
    )
    .map_err(|e| format!("Failed clearing cloud transcript: {e}"))?;

    let mut full_text = String::new();
    for (i, c) in chunks.iter().enumerate() {
        // Cloud times are seconds; desk stores milliseconds.
        let start_ms = (c.start_time * 1000.0).round() as i64;
        let end_ms = (c.end_time * 1000.0).round() as i64;
        let seg_id = format!("cloud_{episode_id}_{i}");

        conn.execute(
            "INSERT INTO podcast_transcript_segments
                (id, episode_id, text, start_ms, end_ms, confidence, language, source)
             VALUES (?1, ?2, ?3, ?4, ?5, 1.0, ?6, 'cloud')",
            rusqlite::params![
                seg_id,
                episode_id,
                c.text,
                start_ms,
                end_ms,
                c.language.clone(), // None stays NULL — a fabricated 'en' poisons the V034-style backfill
            ],
        )
        .map_err(|e| format!("Cloud segment insert error: {e}"))?;

        if !full_text.is_empty() {
            full_text.push(' ');
        }
        full_text.push_str(&c.text);
    }

    // The cloud exposes no word-level timestamps, so `podcast_word_timestamps`
    // stays empty for these segments — the UI falls back to splitting on spaces.

    if let Some(nlp) = nlp {
        let cefr_dist = serde_json::to_string(&cloud_cefr_distribution(nlp))
            .unwrap_or_else(|_| "{}".into());
        let top_words = nlp
            .get("vocabulary_stats")
            .map(|v| v.to_string())
            .unwrap_or_else(|| "[]".into());

        conn.execute(
            "INSERT INTO podcast_nlp_analysis
                (id, episode_id, source, total_words, unique_words, cefr_level,
                 cefr_distribution, avg_sentence_length, vocabulary_richness, top_words)
             VALUES (lower(hex(randomblob(16))), ?1, 'cloud', ?2, ?3, ?4, ?5, 0.0, 0.0, ?6)
             ON CONFLICT(episode_id, source) DO UPDATE SET
                total_words = ?2, unique_words = ?3, cefr_level = ?4,
                cefr_distribution = ?5, top_words = ?6",
            rusqlite::params![
                episode_id,
                nlp.get("total_words").and_then(|v| v.as_i64()).unwrap_or(0),
                nlp.get("unique_words").and_then(|v| v.as_i64()).unwrap_or(0),
                nlp.get("average_cefr_level").and_then(|v| v.as_str()),
                cefr_dist,
                top_words,
            ],
        )
        .map_err(|e| format!("Cloud NLP insert error: {e}"))?;
    }

    conn.execute(
        "UPDATE podcast_episodes
            SET transcript = ?2,
                transcript_status = 'completed',
                transcript_source = 'cloud',
                cloud_transcript_status = 'ready',
                transcript_lang = COALESCE(?3, transcript_lang)
          WHERE id = ?1",
        rusqlite::params![episode_id, full_text, cloud_lang],
    )
    .map_err(|e| format!("Failed activating cloud transcript: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod nlp_language_tests {
    use super::*;
    use crate::db::schema::run_migrations;
    use rusqlite::Connection;

    fn db_with_episode(difficulty_lang: Option<&str>, feed_lang: &str) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO podcast_feeds (id, feed_url, title, language)
             VALUES ('f1', 'https://example.com/rss', 'Feed', ?1)",
            rusqlite::params![feed_lang],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO podcast_episodes (id, feed_id, title, audio_url, duration_seconds, difficulty_lang)
             VALUES ('e1', 'f1', 'Ep', 'https://example.com/a.mp3', 60, ?1)",
            rusqlite::params![difficulty_lang],
        )
        .unwrap();
        conn
    }

    /// The cloud-detected episode language must beat the feed's declared one —
    /// publishers mistag feeds (an English-tagged feed carrying French audio was
    /// the original bug this chain exists for).
    #[test]
    fn episode_language_beats_feed_language() {
        let conn = db_with_episode(Some("fr"), "en");
        assert_eq!(episode_analysis_lang(&conn, "e1"), "fr");
    }

    #[test]
    fn feed_language_is_the_fallback_and_empty_strings_are_skipped() {
        let conn = db_with_episode(None, "es");
        assert_eq!(episode_analysis_lang(&conn, "e1"), "es");
        let conn = db_with_episode(Some(""), "es");
        assert_eq!(episode_analysis_lang(&conn, "e1"), "es");
    }

    /// French episode → a FRENCH analysis lands in the DB. Before this change the
    /// text was scored against English frequencies; "je suis très content" would
    /// have come out as mid-level mush instead of skewing A1.
    #[test]
    fn french_episode_gets_a_french_analysis() {
        let conn = db_with_episode(Some("fr"), "en");
        run_nlp_analysis_with_conn(
            &conn,
            "e1",
            "Je suis très content. Nous parlons ensemble et je mange une pomme.",
        )
        .unwrap();

        let (cefr, dist): (String, String) = conn
            .query_row(
                "SELECT cefr_level, cefr_distribution FROM podcast_nlp_analysis WHERE episode_id = 'e1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert!(matches!(cefr.as_str(), "A1" | "A2"), "simple French must score A1/A2, got {cefr}");
        let dist: std::collections::HashMap<String, i64> = serde_json::from_str(&dist).unwrap();
        assert!(dist["A1"] > 0, "distribution must have A1 mass: {dist:?}");
    }

    /// Unsupported language: analysis is a clean SKIP (transcription must not fail),
    /// and nothing lands in the DB — no row is better than a wrong row.
    #[test]
    fn unsupported_language_skips_without_storing_garbage() {
        let conn = db_with_episode(Some("zh"), "zh");
        run_nlp_analysis_with_conn(&conn, "e1", "你好世界 这是一个测试")
            .expect("unsupported language must not error the transcription flow");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM podcast_nlp_analysis WHERE episode_id = 'e1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "no analysis row may be stored for an unsupported language");
    }

    /// The language of the transcript on screen wins over everything: a cloud
    /// analysis may say 'en' (or be absent) while the transcript the user is
    /// actually reading was made in French.
    #[test]
    fn transcript_lang_beats_difficulty_and_feed() {
        let conn = db_with_episode(Some("en"), "en");
        conn.execute(
            "UPDATE podcast_episodes SET transcript_lang = 'fr' WHERE id = 'e1'",
            [],
        )
        .unwrap();
        assert_eq!(episode_analysis_lang(&conn, "e1"), "fr");
    }

    /// Whisper prints its detection to stderr when it runs on auto — the only
    /// place the language surfaces in streaming mode.
    #[test]
    fn whisper_stderr_detection_parses() {
        let stderr = "whisper_init_state: compute buffer (cross) = 6.46 MB\n\
                      whisper_full_with_state: auto-detected language: fr (p = 0.976211)\n\
                      output_json: saving output to '/tmp/x.json'";
        assert_eq!(whisper_detected_lang(stderr).as_deref(), Some("fr"));
        assert_eq!(whisper_detected_lang("no detection line here"), None);
        assert_eq!(
            whisper_detected_lang("auto-detected language: ES (p = 0.9)").as_deref(),
            Some("es"),
        );
    }
}

