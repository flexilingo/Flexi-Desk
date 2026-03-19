use chrono::Datelike;
use rusqlite::Connection;

use super::types::StreakInfo;

/// Called when checking streak status. Determines if streak should be
/// maintained, frozen, or broken based on last activity and freeze days.
pub fn check_streak(conn: &Connection) -> Result<StreakInfo, String> {
    let mut streak = get_current_streak(conn)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    if streak.last_activity_date.as_deref() == Some(&today) {
        return Ok(streak);
    }

    let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    if streak.last_activity_date.as_deref() == Some(&yesterday) {
        return Ok(streak);
    }

    // Missed at least one day — check freeze availability
    let days_missed = days_between(
        streak.last_activity_date.as_deref().unwrap_or(&today),
        &today,
    );

    if days_missed <= 1 && streak.freeze_days_remaining > 0 {
        conn.execute(
            "UPDATE streaks SET freeze_days_remaining = freeze_days_remaining - 1 WHERE rowid = (SELECT MIN(rowid) FROM streaks)",
            [],
        )
        .map_err(|e| format!("Freeze update: {e}"))?;
    } else if days_missed > 1 || streak.freeze_days_remaining == 0 {
        conn.execute(
            "UPDATE streaks SET current_streak = 0 WHERE rowid = (SELECT MIN(rowid) FROM streaks)",
            [],
        )
        .map_err(|e| format!("Streak reset: {e}"))?;
        streak.current_streak = 0;
    }

    maybe_reset_weekly_freezes(conn)?;
    get_current_streak(conn)
}

/// Use a streak freeze day manually.
pub fn use_freeze(conn: &Connection) -> Result<StreakInfo, String> {
    let streak = get_current_streak(conn)?;
    if streak.freeze_days_remaining <= 0 {
        return Err("No freeze days remaining".to_string());
    }
    conn.execute(
        "UPDATE streaks SET freeze_days_remaining = freeze_days_remaining - 1 WHERE rowid = (SELECT MIN(rowid) FROM streaks)",
        [],
    )
    .map_err(|e| format!("Use freeze: {e}"))?;
    get_current_streak(conn)
}

/// Set how many freeze days per week the user gets.
pub fn set_freeze_config(conn: &Connection, freezes_per_week: i64) -> Result<(), String> {
    let clamped = freezes_per_week.clamp(0, 3);
    conn.execute(
        "UPDATE streaks SET freeze_days_per_week = ?1 WHERE rowid = (SELECT MIN(rowid) FROM streaks)",
        rusqlite::params![clamped],
    )
    .map_err(|e| format!("Set freeze config: {e}"))?;
    Ok(())
}

/// Set the daily XP target.
pub fn set_xp_target(conn: &Connection, target: i64) -> Result<(), String> {
    let clamped = target.clamp(10, 500);
    conn.execute(
        "UPDATE streaks SET daily_xp_target = ?1 WHERE rowid = (SELECT MIN(rowid) FROM streaks)",
        rusqlite::params![clamped],
    )
    .map_err(|e| format!("Set XP target: {e}"))?;
    Ok(())
}

/// Get today's XP progress toward the daily goal.
pub fn get_xp_progress(conn: &Connection) -> Result<super::types::XPProgress, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let xp_today: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(xp_amount), 0) FROM xp_log WHERE date(created_at) = ?1",
            rusqlite::params![today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let streak = get_current_streak(conn)?;
    let xp_target = streak.daily_xp_target.max(1);
    let percentage = (xp_today as f64 / xp_target as f64 * 100.0).min(100.0);

    Ok(super::types::XPProgress {
        xp_today,
        xp_target,
        percentage,
        streak_count: streak.current_streak,
        freeze_days_remaining: streak.freeze_days_remaining,
    })
}

/// Set notification preferences for a goal.
pub fn set_goal_notification(
    conn: &Connection,
    goal_id: &str,
    notify_at: Option<&str>,
    enabled: bool,
) -> Result<(), String> {
    conn.execute(
        "UPDATE goals SET notify_at = ?1, notify_enabled = ?2 WHERE id = ?3",
        rusqlite::params![notify_at, enabled as i32, goal_id],
    )
    .map_err(|e| format!("Set notification: {e}"))?;
    Ok(())
}

// ── Internal Helpers ─────────────────────────────────────

fn get_current_streak(conn: &Connection) -> Result<StreakInfo, String> {
    conn.query_row(
        "SELECT current_streak, longest_streak, last_activity_date,
                COALESCE(freeze_days_remaining, 1), COALESCE(freeze_days_per_week, 1),
                freeze_last_reset, COALESCE(daily_xp_target, 50)
         FROM streaks ORDER BY rowid LIMIT 1",
        [],
        |row| {
            Ok(StreakInfo {
                current_streak: row.get(0)?,
                longest_streak: row.get(1)?,
                last_activity_date: row.get(2)?,
                freeze_days_remaining: row.get(3)?,
                freeze_days_per_week: row.get(4)?,
                freeze_last_reset: row.get(5)?,
                daily_xp_target: row.get(6)?,
            })
        },
    )
    .map_err(|_| {
        // No streak record exists yet — return defaults
        "No streak record".to_string()
    })
    .or_else(|_| {
        Ok(StreakInfo {
            current_streak: 0,
            longest_streak: 0,
            last_activity_date: None,
            freeze_days_remaining: 1,
            freeze_days_per_week: 1,
            freeze_last_reset: None,
            daily_xp_target: 50,
        })
    })
}

fn days_between(from: &str, to: &str) -> i64 {
    let parse = |s: &str| {
        chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
            .unwrap_or_else(|_| chrono::Local::now().date_naive())
    };
    let d1 = parse(from);
    let d2 = parse(to);
    (d2 - d1).num_days().abs()
}

/// Reset freeze days at the start of each week (Monday).
fn maybe_reset_weekly_freezes(conn: &Connection) -> Result<(), String> {
    let today = chrono::Local::now();
    if today.weekday() != chrono::Weekday::Mon {
        return Ok(());
    }

    let today_str = today.format("%Y-%m-%d").to_string();
    // Only reset once per Monday
    let last_reset: Option<String> = conn
        .query_row(
            "SELECT freeze_last_reset FROM streaks ORDER BY rowid LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(None);

    if last_reset.as_deref() != Some(&today_str) {
        conn.execute(
            "UPDATE streaks SET freeze_days_remaining = freeze_days_per_week, freeze_last_reset = ?1 WHERE rowid = (SELECT MIN(rowid) FROM streaks)",
            rusqlite::params![today_str],
        )
        .map_err(|e| format!("Freeze reset: {e}"))?;
    }
    Ok(())
}
