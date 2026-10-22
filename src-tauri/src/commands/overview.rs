//! Local data for the Overview dashboard.
//!
//! Study time already lands in `daily_stats`; listening and reading did not
//! record anything per day, and nothing ever moved the streak. This module
//! adds the missing pieces and derives the rest:
//!
//! * listening seconds per day + "last played" per episode — recorded from
//!   `podcast_update_progress` (`record_listen`), position deltas only;
//! * reading seconds per day — derived from `reader_sessions`;
//! * minutes logged by hand — `overview_manual`;
//! * streak, best streak and active days — computed from all of the above;
//! * the local achievement catalogue, seeded and unlocked from real counts.
//!
//! Every function takes a plain `&Connection` so it can be tested in memory.

use std::collections::{BTreeMap, HashMap};

use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::State;

use crate::dashboard::types::Achievement;
use crate::AppState;

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

fn today_local() -> NaiveDate {
    Local::now().date_naive()
}

fn ymd(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

/// A reading session longer than this is an app left open, not three hours of reading.
const MAX_READ_SESSION_SECONDS: f64 = 3.0 * 3600.0;
/// Progress is saved every 5 s; a bigger jump is a seek, not listening.
const MAX_LISTEN_STEP_MS: i64 = 20_000;
/// Under a minute of listening or reading on a day does not keep a streak alive.
const MIN_ACTIVE_SECONDS: i64 = 60;

// ── Activity per day ────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct ActivityDay {
    pub date: String,
    pub study_minutes: i64,
    pub reviews: i64,
    pub listen_seconds: i64,
    pub read_seconds: i64,
    pub manual_minutes: i64,
}

impl ActivityDay {
    fn is_active(&self) -> bool {
        self.study_minutes > 0
            || self.reviews > 0
            || self.manual_minutes > 0
            || self.listen_seconds >= MIN_ACTIVE_SECONDS
            || self.read_seconds >= MIN_ACTIVE_SECONDS
    }

    fn minutes(&self) -> i64 {
        self.study_minutes
            + self.manual_minutes
            + (self.listen_seconds + self.read_seconds) / 60
    }
}

fn collect_days(conn: &Connection) -> Result<BTreeMap<String, ActivityDay>, String> {
    let mut map: BTreeMap<String, ActivityDay> = BTreeMap::new();
    let mut entry = |map: &mut BTreeMap<String, ActivityDay>, date: String| {
        map.entry(date.clone())
            .or_insert_with(|| ActivityDay { date, ..Default::default() })
            .clone()
    };
    let _ = &mut entry;

    let q = |e: rusqlite::Error| format!("Query error: {e}");

    let mut stmt = conn
        .prepare("SELECT date, COALESCE(study_minutes, 0), COALESCE(reviews_completed, 0) FROM daily_stats")
        .map_err(q)?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?)))
        .map_err(q)?;
    for row in rows {
        let (date, minutes, reviews) = row.map_err(q)?;
        let d = map.entry(date.clone()).or_insert_with(|| ActivityDay { date, ..Default::default() });
        d.study_minutes += minutes;
        d.reviews += reviews;
    }

    let mut stmt = conn.prepare("SELECT date, millis FROM overview_listen_day").map_err(q)?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .map_err(q)?;
    for row in rows {
        let (date, millis) = row.map_err(q)?;
        let d = map.entry(date.clone()).or_insert_with(|| ActivityDay { date, ..Default::default() });
        d.listen_seconds += millis / 1000;
    }

    let mut stmt = conn
        .prepare(
            "SELECT date(started_at, 'localtime') AS d,
                    SUM(MIN((julianday(last_seen_at) - julianday(started_at)) * 86400.0, ?1))
             FROM reader_sessions GROUP BY d",
        )
        .map_err(q)?;
    let rows = stmt
        .query_map(params![MAX_READ_SESSION_SECONDS], |r| {
            Ok((r.get::<_, Option<String>>(0)?, r.get::<_, Option<f64>>(1)?))
        })
        .map_err(q)?;
    for row in rows {
        let (date, secs) = row.map_err(q)?;
        if let (Some(date), Some(secs)) = (date, secs) {
            let d = map.entry(date.clone()).or_insert_with(|| ActivityDay { date, ..Default::default() });
            d.read_seconds += secs.max(0.0).round() as i64;
        }
    }

    let mut stmt = conn.prepare("SELECT date, minutes FROM overview_manual").map_err(q)?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .map_err(q)?;
    for row in rows {
        let (date, minutes) = row.map_err(q)?;
        let d = map.entry(date.clone()).or_insert_with(|| ActivityDay { date, ..Default::default() });
        d.manual_minutes += minutes;
    }

    Ok(map)
}

/// Current and best streak over the days that had activity.
///
/// Today not being over yet, a streak that ran up to yesterday is still alive.
pub fn streaks_from_days(active: &[NaiveDate], today: NaiveDate) -> (i64, i64) {
    let mut days: Vec<NaiveDate> = active.to_vec();
    days.sort();
    days.dedup();

    let mut best = 0i64;
    let mut run = 0i64;
    let mut prev: Option<NaiveDate> = None;
    for d in &days {
        run = match prev {
            Some(p) if *d - p == Duration::days(1) => run + 1,
            _ => 1,
        };
        best = best.max(run);
        prev = Some(*d);
    }

    let mut current = 0i64;
    let mut cursor = if days.contains(&today) { today } else { today - Duration::days(1) };
    while days.binary_search(&cursor).is_ok() {
        current += 1;
        cursor -= Duration::days(1);
    }
    (current, best)
}

#[derive(Debug, Serialize)]
pub struct ActivitySnapshot {
    pub today: String,
    /// The last 365 days that had anything on them.
    pub days: Vec<ActivityDay>,
    pub current_streak: i64,
    pub longest_streak: i64,
    pub active_days: i64,
    pub xp_total: i64,
    pub xp_today: i64,
}

pub fn activity_snapshot(conn: &Connection, today: NaiveDate) -> Result<ActivitySnapshot, String> {
    let all = collect_days(conn)?;
    let active: Vec<NaiveDate> = all
        .values()
        .filter(|d| d.is_active())
        .filter_map(|d| NaiveDate::parse_from_str(&d.date, "%Y-%m-%d").ok())
        .collect();
    let (current_streak, longest_streak) = streaks_from_days(&active, today);

    let from = ymd(today - Duration::days(365));
    let days: Vec<ActivityDay> = all
        .into_values()
        .filter(|d| d.date >= from && (d.minutes() > 0 || d.reviews > 0 || d.listen_seconds > 0 || d.read_seconds > 0))
        .collect();

    let xp_total: i64 = conn
        .query_row("SELECT COALESCE(SUM(xp_amount), 0) FROM xp_log", [], |r| r.get(0))
        .unwrap_or(0);
    let xp_today: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(xp_amount), 0) FROM xp_log WHERE date(created_at, 'localtime') = ?1",
            params![ymd(today)],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(ActivitySnapshot {
        today: ymd(today),
        days,
        current_streak,
        longest_streak,
        active_days: active.len() as i64,
        xp_total,
        xp_today,
    })
}

#[tauri::command]
pub fn overview_get_activity(state: State<'_, AppState>) -> Result<ActivitySnapshot, String> {
    let conn = lock_db(&state)?;
    activity_snapshot(&conn, today_local())
}

/// Minutes logged by hand for one day; 0 removes the entry.
pub fn set_manual_minutes(conn: &Connection, date: &str, minutes: i64, today: NaiveDate) -> Result<(), String> {
    let day = NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| "INVALID_DATE".to_string())?;
    if day > today {
        return Err("FUTURE_DATE".into());
    }
    if !(0..=600).contains(&minutes) {
        return Err("INVALID_MINUTES".into());
    }
    if minutes == 0 {
        conn.execute("DELETE FROM overview_manual WHERE date = ?1", params![date])
    } else {
        conn.execute(
            "INSERT INTO overview_manual (date, minutes) VALUES (?1, ?2)
             ON CONFLICT(date) DO UPDATE SET minutes = ?2",
            params![date, minutes],
        )
    }
    .map_err(|e| format!("Manual minutes error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn overview_set_manual_minutes(
    state: State<'_, AppState>,
    date: String,
    minutes: i64,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    set_manual_minutes(&conn, &date, minutes, today_local())
}

// ── Listening ───────────────────────────────────────────

/// Called from `podcast_update_progress` before the new position is stored.
/// Adds the listened part (a small forward step) to today and remembers when
/// the episode was last played. Best effort: never fails the caller.
pub fn record_listen(conn: &Connection, episode_id: &str, new_ms: i64) {
    let old: i64 = conn
        .query_row("SELECT play_position FROM podcast_episodes WHERE id = ?1", params![episode_id], |r| r.get(0))
        .unwrap_or(0);
    let delta = new_ms - old;
    if delta > 0 && delta <= MAX_LISTEN_STEP_MS {
        let _ = conn.execute(
            "INSERT INTO overview_listen_day (date, millis) VALUES (?1, ?2)
             ON CONFLICT(date) DO UPDATE SET millis = millis + ?2",
            params![ymd(today_local()), delta],
        );
    }
    if new_ms > 0 {
        let _ = conn.execute(
            "INSERT INTO overview_listen_last (episode_id, last_played_at)
             VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             ON CONFLICT(episode_id) DO UPDATE SET last_played_at = excluded.last_played_at",
            params![episode_id],
        );
    }
}

#[derive(Debug, Serialize, PartialEq)]
pub struct ListeningEpisode {
    pub id: String,
    pub feed_id: String,
    pub title: String,
    pub image_url: Option<String>,
    pub position_seconds: i64,
    pub duration_seconds: i64,
    pub last_played_at: String,
}

#[derive(Debug, Serialize)]
pub struct ListeningSnapshot {
    pub minutes_30: i64,
    pub episodes_started: i64,
    pub followed: i64,
    pub in_progress: Vec<ListeningEpisode>,
    pub artwork: Vec<String>,
}

pub fn listening_snapshot(conn: &Connection, today: NaiveDate) -> Result<ListeningSnapshot, String> {
    let q = |e: rusqlite::Error| format!("Query error: {e}");
    let since = ymd(today - Duration::days(29));
    let millis: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(millis), 0) FROM overview_listen_day WHERE date >= ?1",
            params![since],
            |r| r.get(0),
        )
        .map_err(q)?;
    let episodes_started: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM podcast_episodes WHERE play_position > 0 OR is_played = 1",
            [],
            |r| r.get(0),
        )
        .map_err(q)?;
    let followed: i64 = conn
        .query_row("SELECT COUNT(*) FROM podcast_feeds WHERE is_subscribed = 1", [], |r| r.get(0))
        .map_err(q)?;

    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.feed_id, e.title, COALESCE(NULLIF(e.image_url, ''), f.artwork_url),
                    e.play_position, e.duration_seconds,
                    COALESCE(l.last_played_at, e.created_at)
             FROM podcast_episodes e
             JOIN podcast_feeds f ON f.id = e.feed_id
             LEFT JOIN overview_listen_last l ON l.episode_id = e.id
             WHERE e.is_played = 0 AND e.play_position >= 30000 AND e.audio_url <> ''
             ORDER BY COALESCE(l.last_played_at, e.created_at) DESC
             LIMIT 12",
        )
        .map_err(q)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ListeningEpisode {
                id: r.get(0)?,
                feed_id: r.get(1)?,
                title: r.get(2)?,
                image_url: r.get(3)?,
                position_seconds: r.get::<_, i64>(4)? / 1000,
                duration_seconds: r.get(5)?,
                last_played_at: r.get(6)?,
            })
        })
        .map_err(q)?;
    let in_progress = rows.collect::<Result<Vec<_>, _>>().map_err(q)?;

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT COALESCE(NULLIF(e.image_url, ''), f.artwork_url) AS art
             FROM overview_listen_last l
             JOIN podcast_episodes e ON e.id = l.episode_id
             JOIN podcast_feeds f ON f.id = e.feed_id
             WHERE art IS NOT NULL AND art <> ''
             ORDER BY l.last_played_at DESC LIMIT 4",
        )
        .map_err(q)?;
    let artwork = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(q)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(q)?;

    Ok(ListeningSnapshot { minutes_30: millis / 60_000, episodes_started, followed, in_progress, artwork })
}

#[tauri::command]
pub fn overview_get_listening(state: State<'_, AppState>) -> Result<ListeningSnapshot, String> {
    let conn = lock_db(&state)?;
    listening_snapshot(&conn, today_local())
}

// ── Words ───────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct WordsSnapshot {
    pub total: i64,
    pub new_this_week: i64,
    pub cefr: HashMap<String, i64>,
    pub notes: i64,
}

pub fn words_snapshot(conn: &Connection) -> Result<WordsSnapshot, String> {
    let q = |e: rusqlite::Error| format!("Query error: {e}");
    let total: i64 = conn.query_row("SELECT COUNT(*) FROM vocabulary", [], |r| r.get(0)).map_err(q)?;
    let new_this_week: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM vocabulary WHERE created_at >= datetime('now', '-7 days')",
            [],
            |r| r.get(0),
        )
        .map_err(q)?;
    let notes: i64 = conn.query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0)).unwrap_or(0);
    let mut cefr: HashMap<String, i64> =
        ["A1", "A2", "B1", "B2", "C1", "C2"].iter().map(|k| (k.to_string(), 0)).collect();
    let mut stmt = conn
        .prepare("SELECT UPPER(cefr_level), COUNT(*) FROM vocabulary WHERE cefr_level IS NOT NULL GROUP BY UPPER(cefr_level)")
        .map_err(q)?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .map_err(q)?;
    for row in rows {
        let (level, n) = row.map_err(q)?;
        if let Some(slot) = cefr.get_mut(&level) {
            *slot = n;
        }
    }
    Ok(WordsSnapshot { total, new_this_week, cefr, notes })
}

#[tauri::command]
pub fn overview_get_words(state: State<'_, AppState>) -> Result<WordsSnapshot, String> {
    let conn = lock_db(&state)?;
    words_snapshot(&conn)
}

// ── Achievements ────────────────────────────────────────

/// (group, category, icon, English title, thresholds). One row per tier, key
/// `<group>_<threshold>`; the app translates the text by group.
const CATALOGUE: &[(&str, &str, &str, &str, &[i64])] = &[
    ("streak_master", "streak", "flame", "Streak Master", &[3, 7, 14, 30, 100]),
    ("word_scholar", "vocabulary", "book-a", "Word Scholar", &[10, 50, 100, 500, 1000]),
    ("card_master", "review", "layers", "Card Master", &[50, 250, 1000, 5000]),
    ("time_investor", "general", "clock", "Time Investor", &[60, 300, 1200, 3000]),
    ("episode_explorer", "general", "headphones", "Episode Explorer", &[1, 5, 25, 100]),
    ("bookworm", "reading", "book-open", "Bookworm", &[1, 5, 20]),
    ("steady_learner", "general", "calendar-check", "Steady Learner", &[7, 30, 100, 365]),
];

fn seed_achievements(conn: &Connection) -> Result<(), String> {
    for (group, category, icon, title, tiers) in CATALOGUE {
        for threshold in *tiers {
            conn.execute(
                "INSERT OR IGNORE INTO achievements (achievement_key, title, description, icon, category, threshold)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![format!("{group}_{threshold}"), title, format!("{title} {threshold}"), icon, category, threshold],
            )
            .map_err(|e| format!("Seed achievements: {e}"))?;
        }
    }
    Ok(())
}

fn achievement_metrics(conn: &Connection, snap: &ActivitySnapshot, all: &BTreeMap<String, ActivityDay>) -> HashMap<&'static str, i64> {
    let count = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap_or(0);
    let minutes: i64 = all.values().map(|d| d.minutes()).sum();
    let mut m = HashMap::new();
    m.insert("streak_master", snap.longest_streak);
    m.insert("word_scholar", count("SELECT COUNT(*) FROM vocabulary"));
    m.insert("card_master", all.values().map(|d| d.reviews).sum());
    m.insert("time_investor", minutes);
    m.insert("episode_explorer", count("SELECT COUNT(*) FROM podcast_episodes WHERE play_position > 0 OR is_played = 1"));
    m.insert("bookworm", count("SELECT COUNT(*) FROM reader_documents WHERE last_read_at IS NOT NULL"));
    m.insert("steady_learner", snap.active_days);
    m
}

/// Seeds the catalogue, brings every tier's progress up to date, unlocks what
/// is reached and returns them all (unlocked first).
pub fn refresh_achievements(conn: &Connection, today: NaiveDate) -> Result<Vec<Achievement>, String> {
    seed_achievements(conn)?;
    let all = collect_days(conn)?;
    let snap = activity_snapshot(conn, today)?;
    let metrics = achievement_metrics(conn, &snap, &all);

    for (group, _, _, _, tiers) in CATALOGUE {
        let value = metrics.get(group).copied().unwrap_or(0);
        for threshold in *tiers {
            conn.execute(
                "UPDATE achievements SET current_value = ?2 WHERE achievement_key = ?1",
                params![format!("{group}_{threshold}"), value],
            )
            .map_err(|e| format!("Achievement progress: {e}"))?;
        }
    }
    conn.execute(
        "UPDATE achievements SET is_unlocked = 1, unlocked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE is_unlocked = 0 AND current_value >= threshold",
        [],
    )
    .map_err(|e| format!("Unlock achievements: {e}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, achievement_key, title, description, icon, category, threshold,
                    current_value, is_unlocked, unlocked_at, created_at
             FROM achievements ORDER BY is_unlocked DESC, unlocked_at DESC, threshold ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Achievement {
                id: r.get(0)?,
                achievement_key: r.get(1)?,
                title: r.get(2)?,
                description: r.get(3)?,
                icon: r.get(4)?,
                category: r.get(5)?,
                threshold: r.get(6)?,
                current_value: r.get(7)?,
                is_unlocked: r.get::<_, i64>(8)? != 0,
                unlocked_at: r.get(9)?,
                created_at: r.get(10)?,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Row error: {e}"))
}

#[tauri::command]
pub fn overview_refresh_achievements(state: State<'_, AppState>) -> Result<Vec<Achievement>, String> {
    let conn = lock_db(&state)?;
    refresh_achievements(&conn, today_local())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::schema::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn streak_runs_through_today_and_best_is_kept() {
        let days = [d("2026-10-01"), d("2026-10-02"), d("2026-10-03"), d("2026-10-10"), d("2026-10-11")];
        assert_eq!(streaks_from_days(&days, d("2026-10-11")), (2, 3));
    }

    #[test]
    fn streak_still_alive_when_today_has_no_activity_yet() {
        let days = [d("2026-10-09"), d("2026-10-10")];
        assert_eq!(streaks_from_days(&days, d("2026-10-11")), (2, 2));
        // a gap of a whole day ends it
        assert_eq!(streaks_from_days(&days, d("2026-10-12")), (0, 2));
        assert_eq!(streaks_from_days(&[], d("2026-10-12")), (0, 0));
    }

    #[test]
    fn manual_minutes_validate_save_and_clear() {
        let conn = db();
        let today = d("2026-10-11");
        assert_eq!(set_manual_minutes(&conn, "2026-10-12", 10, today), Err("FUTURE_DATE".into()));
        assert_eq!(set_manual_minutes(&conn, "2026-10-10", 601, today), Err("INVALID_MINUTES".into()));
        assert_eq!(set_manual_minutes(&conn, "nope", 5, today), Err("INVALID_DATE".into()));
        set_manual_minutes(&conn, "2026-10-10", 25, today).unwrap();
        set_manual_minutes(&conn, "2026-10-10", 40, today).unwrap();
        let snap = activity_snapshot(&conn, today).unwrap();
        assert_eq!(snap.days.len(), 1);
        assert_eq!(snap.days[0].manual_minutes, 40);
        set_manual_minutes(&conn, "2026-10-10", 0, today).unwrap();
        assert!(activity_snapshot(&conn, today).unwrap().days.is_empty());
    }

    #[test]
    fn week_data_merges_study_listening_reading_and_manual() {
        let conn = db();
        let today = d("2026-10-11");
        conn.execute("INSERT INTO daily_stats (date, study_minutes, reviews_completed) VALUES ('2026-10-11', 12, 30)", []).unwrap();
        conn.execute("INSERT INTO overview_listen_day (date, millis) VALUES ('2026-10-11', 600000)", []).unwrap();
        conn.execute(
            "INSERT INTO reader_documents (id, title, original_filename, file_path) VALUES ('d1', 'T', 't.pdf', 'p')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO reader_sessions (id, document_id, started_at, last_seen_at)
             VALUES ('s1', 'd1', '2026-10-11T12:00:00.000Z', '2026-10-11T12:05:00.000Z')",
            [],
        ).unwrap();
        set_manual_minutes(&conn, "2026-10-11", 5, today).unwrap();
        let snap = activity_snapshot(&conn, today).unwrap();
        let day = &snap.days[0];
        assert_eq!((day.study_minutes, day.reviews, day.listen_seconds, day.read_seconds, day.manual_minutes), (12, 30, 600, 300, 5));
        assert_eq!(snap.current_streak, 1);
    }

    #[test]
    fn listening_counts_small_forward_steps_only_and_orders_by_last_played() {
        let conn = db();
        conn.execute("INSERT INTO podcast_feeds (id, title, feed_url, artwork_url) VALUES ('f1', 'Feed', 'u', 'art.png')", []).unwrap();
        for (id, last) in [("e1", 40_000), ("e2", 90_000)] {
            conn.execute(
                "INSERT INTO podcast_episodes (id, feed_id, title, audio_url, duration_seconds, play_position) VALUES (?1, 'f1', ?1, 'a.mp3', 600, ?2)",
                params![id, last],
            ).unwrap();
        }
        record_listen(&conn, "e1", 45_000); // +5 s
        record_listen(&conn, "e1", 400_000); // a seek: not listening
        std::thread::sleep(std::time::Duration::from_millis(5));
        record_listen(&conn, "e2", 95_000); // +5 s, newer
        conn.execute("UPDATE podcast_episodes SET play_position = 95000 WHERE id = 'e2'", []).unwrap();
        let snap = listening_snapshot(&conn, today_local()).unwrap();
        assert_eq!(snap.in_progress.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(), vec!["e2", "e1"]);
        assert_eq!(snap.episodes_started, 2);
        assert_eq!(snap.followed, 1);
        assert_eq!(snap.artwork, vec!["art.png".to_string()]);
        let day = activity_snapshot(&conn, today_local()).unwrap();
        assert_eq!(day.days[0].listen_seconds, 10);
    }

    #[test]
    fn achievements_seed_progress_and_unlock_from_real_counts() {
        let conn = db();
        let today = d("2026-10-11");
        for i in 0..12 {
            conn.execute("INSERT INTO vocabulary (word, language) VALUES (?1, 'en')", params![format!("w{i}")]).unwrap();
        }
        set_manual_minutes(&conn, "2026-10-10", 30, today).unwrap();
        set_manual_minutes(&conn, "2026-10-11", 30, today).unwrap();
        let list = refresh_achievements(&conn, today).unwrap();
        let get = |k: &str| list.iter().find(|a| a.achievement_key == k).unwrap();
        assert!(get("word_scholar_10").is_unlocked);
        assert_eq!(get("word_scholar_50").current_value, 12);
        assert!(!get("word_scholar_50").is_unlocked);
        assert_eq!(get("time_investor_60").current_value, 60);
        assert!(get("time_investor_60").is_unlocked);
        assert_eq!(get("streak_master_3").current_value, 2);
        // idempotent: a second pass keeps the same rows and the same unlock time
        let at = get("word_scholar_10").unlocked_at.clone();
        let again = refresh_achievements(&conn, today).unwrap();
        assert_eq!(again.len(), list.len());
        assert_eq!(again.iter().find(|a| a.achievement_key == "word_scholar_10").unwrap().unlocked_at, at);
    }

    #[test]
    fn words_snapshot_counts_levels_and_new_this_week() {
        let conn = db();
        conn.execute("INSERT INTO vocabulary (word, language, cefr_level) VALUES ('a', 'en', 'b1'), ('b', 'en', 'A1'), ('c', 'en', NULL)", []).unwrap();
        let w = words_snapshot(&conn).unwrap();
        assert_eq!(w.total, 3);
        assert_eq!(w.new_this_week, 3);
        assert_eq!(w.cefr["B1"], 1);
        assert_eq!(w.cefr["A1"], 1);
    }
}
