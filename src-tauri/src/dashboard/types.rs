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
