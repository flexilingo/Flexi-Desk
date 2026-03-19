use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub format: ExportFormat,
    pub include_fields: Vec<String>,
    pub filter_language: Option<String>,
    pub filter_cefr: Option<String>,
    pub filter_source: Option<String>,
    pub deck_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportFormat {
    Csv,
    Anki,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportOptions {
    pub format: ImportFormat,
    pub column_mapping: Option<ColumnMapping>,
    pub target_language: String,
    pub target_deck_id: Option<String>,
    pub skip_duplicates: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImportFormat {
    Csv,
    Tsv,
    Anki,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnMapping {
    pub word_column: usize,
    pub translation_column: Option<usize>,
    pub definition_column: Option<usize>,
    pub pos_column: Option<usize>,
    pub cefr_column: Option<usize>,
    pub phonetic_column: Option<usize>,
    pub examples_column: Option<usize>,
    pub context_column: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreview {
    pub headers: Vec<String>,
    pub sample_rows: Vec<Vec<String>>,
    pub total_rows: i64,
    pub suggested_mapping: ColumnMapping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub total_rows: i64,
    pub imported: i64,
    pub skipped_duplicates: i64,
    pub errors: Vec<ImportError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportError {
    pub row: i64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub file_path: String,
    pub total_items: i64,
    pub format: String,
}
