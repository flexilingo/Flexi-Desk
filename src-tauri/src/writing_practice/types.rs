//! Static rubric shapes. The data itself is generated from the server's `rubrics.ts`.

pub struct Criterion {
    pub name: &'static str,
    pub max_score: f64,
    pub description: &'static str,
}

pub struct Rubric {
    pub exam_type: &'static str,
    pub display_name: &'static str,
    pub score_min: f64,
    pub score_max: f64,
    pub score_step: f64,
    pub word_min: u32,
    pub word_max: u32,
    pub time_limit_seconds: i64,
    pub criteria: &'static [Criterion],
    pub band_descriptors: &'static [(&'static str, &'static str)],
}
