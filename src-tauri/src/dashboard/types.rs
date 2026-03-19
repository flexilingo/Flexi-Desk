use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyStats {
    pub date: String,
    pub study_minutes: i64,
    pub words_learned: i64,
    pub reviews_completed: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreakInfo {
    pub current_streak: i64,
    pub longest_streak: i64,
    pub last_activity_date: Option<String>,
    #[serde(default = "default_one")]
    pub freeze_days_remaining: i64,
    #[serde(default = "default_one")]
    pub freeze_days_per_week: i64,
    #[serde(default)]
    pub freeze_last_reset: Option<String>,
    #[serde(default = "default_xp_target")]
    pub daily_xp_target: i64,
}

fn default_one() -> i64 { 1 }
fn default_xp_target() -> i64 { 50 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XPProgress {
    pub xp_today: i64,
    pub xp_target: i64,
    pub percentage: f64,
    pub streak_count: i64,
    pub freeze_days_remaining: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Goal {
    pub id: String,
    pub goal_type: String,
    pub target_value: i64,
    pub current_value: i64,
    pub period: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Achievement {
    pub id: String,
    pub achievement_key: String,
    pub title: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub category: String,
    pub threshold: i64,
    pub current_value: i64,
    pub is_unlocked: bool,
    pub unlocked_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEntry {
    pub id: String,
    pub activity_type: String,
    pub module: String,
    pub description: Option<String>,
    pub metadata_json: String,
    pub created_at: String,
}

// ── Analytics Types ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XPLogEntry {
    pub id: String,
    pub module: String,
    pub action: String,
    pub xp_amount: i64,
    pub metadata: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyXP {
    pub date: String,
    pub total_xp: i64,
    pub breakdown: Vec<ModuleXP>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleXP {
    pub module: String,
    pub xp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CEFRSkillScore {
    pub skill: String,
    pub score: f64,
    pub cefr_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudyHeatmapEntry {
    pub day_of_week: u8,
    pub hour: u8,
    pub minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabGrowthPoint {
    pub date: String,
    pub cumulative_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreakDay {
    pub date: String,
    pub activity_count: i64,
    pub xp_earned: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsSummary {
    pub xp_today: i64,
    pub streak_count: i64,
    pub words_learned_today: i64,
    pub study_minutes_today: i64,
    pub reviews_today: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardSummary {
    pub today: DailyStats,
    pub streak: StreakInfo,
    pub total_vocabulary: i64,
    pub total_study_minutes: i64,
    pub total_reviews: i64,
    pub active_goals: Vec<Goal>,
    pub recent_achievements: Vec<Achievement>,
}
