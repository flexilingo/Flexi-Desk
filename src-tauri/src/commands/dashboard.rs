use tauri::State;

use crate::dashboard::types::*;
use crate::AppState;

// ── Helpers ─────────────────────────────────────────────

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

fn today_str() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

// ── Dashboard Summary ───────────────────────────────────

#[tauri::command]
pub fn dashboard_get_summary(
    state: State<'_, AppState>,
) -> Result<DashboardSummary, String> {
    let conn = lock_db(&state)?;
    let today = today_str();

    // Today's stats
    let today_stats = conn
        .query_row(
            "SELECT date, study_minutes, words_learned, reviews_completed
             FROM daily_stats WHERE date = ?1",
            rusqlite::params![today],
            map_daily_stats_row,
        )
        .unwrap_or(DailyStats {
            date: today.clone(),
            study_minutes: 0,
            words_learned: 0,
            reviews_completed: 0,
        });

    // Streak info
    let streak = conn
        .query_row(
            "SELECT current_streak, longest_streak, last_activity_date
             FROM streaks ORDER BY id DESC LIMIT 1",
            [],
            |row: &rusqlite::Row| {
                Ok(StreakInfo {
                    current_streak: row.get(0)?,
                    longest_streak: row.get(1)?,
                    last_activity_date: row.get(2)?,
                })
            },
        )
        .unwrap_or(StreakInfo {
            current_streak: 0,
            longest_streak: 0,
            last_activity_date: None,
        });

    // Total vocabulary
    let total_vocabulary: i64 = conn
        .query_row("SELECT COUNT(*) FROM vocabulary", [], |row: &rusqlite::Row| row.get(0))
        .unwrap_or(0);

    // Total study minutes
    let total_study_minutes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(study_minutes), 0) FROM daily_stats",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .unwrap_or(0);

    // Total reviews
    let total_reviews: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(reviews_completed), 0) FROM daily_stats",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .unwrap_or(0);

    // Active goals
    let active_goals = get_active_goals(&conn)?;

    // Recent achievements
    let recent_achievements = get_recent_achievements(&conn, 5)?;

    Ok(DashboardSummary {
        today: today_stats,
        streak,
        total_vocabulary,
        total_study_minutes,
        total_reviews,
        active_goals,
        recent_achievements,
    })
}

// ── Daily Stats Commands ────────────────────────────────

#[tauri::command]
pub fn dashboard_get_daily_stats(
    state: State<'_, AppState>,
    from_date: String,
    to_date: String,
) -> Result<Vec<DailyStats>, String> {
    let conn = lock_db(&state)?;

    let mut stmt = conn
        .prepare(
            "SELECT date, study_minutes, words_learned, reviews_completed
             FROM daily_stats
             WHERE date >= ?1 AND date <= ?2
             ORDER BY date ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![from_date, to_date], map_daily_stats_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut stats = Vec::new();
    for row in rows {
        stats.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(stats)
}

#[tauri::command]
pub fn dashboard_log_activity(
    state: State<'_, AppState>,
    study_minutes: Option<i64>,
    words_learned: Option<i64>,
    reviews_completed: Option<i64>,
) -> Result<DailyStats, String> {
    let conn = lock_db(&state)?;
    let today = today_str();

    // Upsert today's stats
    conn.execute(
        "INSERT INTO daily_stats (date, study_minutes, words_learned, reviews_completed)
         VALUES (?1, COALESCE(?2, 0), COALESCE(?3, 0), COALESCE(?4, 0))
         ON CONFLICT(date) DO UPDATE SET
            study_minutes = study_minutes + COALESCE(?2, 0),
            words_learned = words_learned + COALESCE(?3, 0),
            reviews_completed = reviews_completed + COALESCE(?4, 0)",
        rusqlite::params![today, study_minutes, words_learned, reviews_completed],
    )
    .map_err(|e| format!("Log activity error: {e}"))?;

    // Update streak
    update_streak(&conn, &today)?;

    conn.query_row(
        "SELECT date, study_minutes, words_learned, reviews_completed
         FROM daily_stats WHERE date = ?1",
        rusqlite::params![today],
        map_daily_stats_row,
    )
    .map_err(|e| format!("Stats not found: {e}"))
}

// ── Goal Commands ───────────────────────────────────────

#[tauri::command]
pub fn dashboard_list_goals(
    state: State<'_, AppState>,
) -> Result<Vec<Goal>, String> {
    let conn = lock_db(&state)?;
    get_active_goals(&conn)
}

#[tauri::command]
pub fn dashboard_create_goal(
    state: State<'_, AppState>,
    goal_type: String,
    target_value: i64,
    period: String,
) -> Result<Goal, String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "INSERT INTO goals (id, goal_type, target_value, period)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3)",
        rusqlite::params![goal_type, target_value, period],
    )
    .map_err(|e| format!("Goal create error: {e}"))?;

    let id: String = conn
        .query_row(
            "SELECT id FROM goals ORDER BY created_at DESC LIMIT 1",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Goal lookup error: {e}"))?;

    conn.query_row(
        "SELECT id, goal_type, target_value, current_value, period, is_active, created_at, updated_at
         FROM goals WHERE id = ?1",
        rusqlite::params![id],
        map_goal_row,
    )
    .map_err(|e| format!("Goal not found: {e}"))
}

#[tauri::command]
pub fn dashboard_update_goal_progress(
    state: State<'_, AppState>,
    id: String,
    current_value: i64,
) -> Result<Goal, String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "UPDATE goals SET current_value = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![current_value, id],
    )
    .map_err(|e| format!("Goal update error: {e}"))?;

    conn.query_row(
        "SELECT id, goal_type, target_value, current_value, period, is_active, created_at, updated_at
         FROM goals WHERE id = ?1",
        rusqlite::params![id],
        map_goal_row,
    )
    .map_err(|e| format!("Goal not found: {e}"))
}

#[tauri::command]
pub fn dashboard_delete_goal(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute("DELETE FROM goals WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Goal delete error: {e}"))?;
    Ok(())
}

// ── Achievement Commands ────────────────────────────────

#[tauri::command]
pub fn dashboard_list_achievements(
    state: State<'_, AppState>,
    category: Option<String>,
) -> Result<Vec<Achievement>, String> {
    let conn = lock_db(&state)?;

    if let Some(cat) = &category {
        let mut stmt = conn
            .prepare(
                "SELECT id, achievement_key, title, description, icon, category,
                        threshold, current_value, is_unlocked, unlocked_at, created_at
                 FROM achievements WHERE category = ?1
                 ORDER BY is_unlocked DESC, created_at DESC",
            )
            .map_err(|e| format!("Query error: {e}"))?;

        let rows = stmt
            .query_map(rusqlite::params![cat], map_achievement_row)
            .map_err(|e| format!("Query error: {e}"))?;

        let mut achievements = Vec::new();
        for row in rows {
            achievements.push(row.map_err(|e| format!("Row error: {e}"))?);
        }
        Ok(achievements)
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, achievement_key, title, description, icon, category,
                        threshold, current_value, is_unlocked, unlocked_at, created_at
                 FROM achievements
                 ORDER BY is_unlocked DESC, created_at DESC",
            )
            .map_err(|e| format!("Query error: {e}"))?;

        let rows = stmt
            .query_map([], map_achievement_row)
            .map_err(|e| format!("Query error: {e}"))?;

        let mut achievements = Vec::new();
        for row in rows {
            achievements.push(row.map_err(|e| format!("Row error: {e}"))?);
        }
        Ok(achievements)
    }
}

#[tauri::command]
pub fn dashboard_check_achievements(
    state: State<'_, AppState>,
) -> Result<Vec<Achievement>, String> {
    let conn = lock_db(&state)?;

    // Check and unlock achievements where current_value >= threshold
    conn.execute(
        "UPDATE achievements SET is_unlocked = 1, unlocked_at = datetime('now')
         WHERE is_unlocked = 0 AND current_value >= threshold",
        [],
    )
    .map_err(|e| format!("Check achievements error: {e}"))?;

    // Return newly unlocked
    let mut stmt = conn
        .prepare(
            "SELECT id, achievement_key, title, description, icon, category,
                    threshold, current_value, is_unlocked, unlocked_at, created_at
             FROM achievements WHERE is_unlocked = 1
             ORDER BY unlocked_at DESC LIMIT 10",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map([], map_achievement_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut achievements = Vec::new();
    for row in rows {
        achievements.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(achievements)
}

// ── Activity Log Commands ───────────────────────────────

#[tauri::command]
pub fn dashboard_log_event(
    state: State<'_, AppState>,
    activity_type: String,
    module: String,
    description: Option<String>,
    metadata_json: Option<String>,
) -> Result<ActivityEntry, String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "INSERT INTO activity_log (id, activity_type, module, description, metadata_json)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, COALESCE(?4, '{}'))",
        rusqlite::params![activity_type, module, description, metadata_json],
    )
    .map_err(|e| format!("Log event error: {e}"))?;

    let id: String = conn
        .query_row(
            "SELECT id FROM activity_log ORDER BY created_at DESC LIMIT 1",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Event lookup error: {e}"))?;

    conn.query_row(
        "SELECT id, activity_type, module, description, metadata_json, created_at
         FROM activity_log WHERE id = ?1",
        rusqlite::params![id],
        map_activity_row,
    )
    .map_err(|e| format!("Event not found: {e}"))
}

#[tauri::command]
pub fn dashboard_get_activity(
    state: State<'_, AppState>,
    limit: Option<i64>,
    module: Option<String>,
) -> Result<Vec<ActivityEntry>, String> {
    let conn = lock_db(&state)?;
    let max = limit.unwrap_or(50);

    if let Some(mod_name) = &module {
        let mut stmt = conn
            .prepare(
                "SELECT id, activity_type, module, description, metadata_json, created_at
                 FROM activity_log WHERE module = ?1
                 ORDER BY created_at DESC LIMIT ?2",
            )
            .map_err(|e| format!("Query error: {e}"))?;

        let rows = stmt
            .query_map(rusqlite::params![mod_name, max], map_activity_row)
            .map_err(|e| format!("Query error: {e}"))?;

        let mut activities = Vec::new();
        for row in rows {
            activities.push(row.map_err(|e| format!("Row error: {e}"))?);
        }
        Ok(activities)
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, activity_type, module, description, metadata_json, created_at
                 FROM activity_log
                 ORDER BY created_at DESC LIMIT ?1",
            )
            .map_err(|e| format!("Query error: {e}"))?;

        let rows = stmt
            .query_map(rusqlite::params![max], map_activity_row)
            .map_err(|e| format!("Query error: {e}"))?;

        let mut activities = Vec::new();
        for row in rows {
            activities.push(row.map_err(|e| format!("Row error: {e}"))?);
        }
        Ok(activities)
    }
}

// ── Row Mappers ─────────────────────────────────────────

fn map_daily_stats_row(row: &rusqlite::Row) -> rusqlite::Result<DailyStats> {
    Ok(DailyStats {
        date: row.get(0)?,
        study_minutes: row.get(1)?,
        words_learned: row.get(2)?,
        reviews_completed: row.get(3)?,
    })
}

fn map_goal_row(row: &rusqlite::Row) -> rusqlite::Result<Goal> {
    Ok(Goal {
        id: row.get(0)?,
        goal_type: row.get(1)?,
        target_value: row.get(2)?,
        current_value: row.get(3)?,
        period: row.get(4)?,
        is_active: row.get::<_, i32>(5)? != 0,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn map_achievement_row(row: &rusqlite::Row) -> rusqlite::Result<Achievement> {
    Ok(Achievement {
        id: row.get(0)?,
        achievement_key: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        icon: row.get(4)?,
        category: row.get(5)?,
        threshold: row.get(6)?,
        current_value: row.get(7)?,
        is_unlocked: row.get::<_, i32>(8)? != 0,
        unlocked_at: row.get(9)?,
        created_at: row.get(10)?,
    })
}

fn map_activity_row(row: &rusqlite::Row) -> rusqlite::Result<ActivityEntry> {
    Ok(ActivityEntry {
        id: row.get(0)?,
        activity_type: row.get(1)?,
        module: row.get(2)?,
        description: row.get(3)?,
        metadata_json: row.get(4)?,
        created_at: row.get(5)?,
    })
}

// ── Internal Helpers ────────────────────────────────────

fn get_active_goals(conn: &rusqlite::Connection) -> Result<Vec<Goal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, goal_type, target_value, current_value, period, is_active, created_at, updated_at
             FROM goals WHERE is_active = 1 ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map([], map_goal_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut goals = Vec::new();
    for row in rows {
        goals.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(goals)
}

fn get_recent_achievements(conn: &rusqlite::Connection, limit: i64) -> Result<Vec<Achievement>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, achievement_key, title, description, icon, category,
                    threshold, current_value, is_unlocked, unlocked_at, created_at
             FROM achievements WHERE is_unlocked = 1
             ORDER BY unlocked_at DESC LIMIT ?1",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![limit], map_achievement_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut achievements = Vec::new();
    for row in rows {
        achievements.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(achievements)
}

fn update_streak(conn: &rusqlite::Connection, today: &str) -> Result<(), String> {
    // Get or create streak record
    let existing = conn.query_row(
        "SELECT id, current_streak, longest_streak, last_activity_date FROM streaks LIMIT 1",
        [],
        |row: &rusqlite::Row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        },
    );

    match existing {
        Ok((_id, current, longest, last_date)) => {
            let yesterday = {
                let t = chrono::Local::now() - chrono::Duration::days(1);
                t.format("%Y-%m-%d").to_string()
            };

            let new_current = if last_date.as_deref() == Some(today) {
                current // Already counted today
            } else if last_date.as_deref() == Some(&yesterday) {
                current + 1 // Consecutive day
            } else {
                1 // Streak broken, start fresh
            };

            let new_longest = std::cmp::max(longest, new_current);

            conn.execute(
                "UPDATE streaks SET current_streak = ?1, longest_streak = ?2, last_activity_date = ?3",
                rusqlite::params![new_current, new_longest, today],
            )
            .map_err(|e| format!("Streak update error: {e}"))?;
        }
        Err(_) => {
            conn.execute(
                "INSERT INTO streaks (current_streak, longest_streak, last_activity_date)
                 VALUES (1, 1, ?1)",
                rusqlite::params![today],
            )
            .map_err(|e| format!("Streak create error: {e}"))?;
        }
    }

    Ok(())
}
