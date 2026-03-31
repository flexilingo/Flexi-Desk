use serde::{Deserialize, Serialize};

/// A single extracted item from AI text analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzedItem {
    pub word: String,
    pub translation: String,
    pub definition: String,
    pub pos: String,        // noun/verb/adj/adv/phrase/collocation/grammar
    pub cefr_level: String, // A1/A2/B1/B2/C1/C2
    pub ipa: String,
    pub examples: Vec<ExamplePair>,
    pub memory_hook: Option<String>,
    pub collocations: Vec<String>,
    pub card_type: String, // vocabulary/phrase/grammar/collocation
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamplePair {
    pub source: String,
    pub target: String,
}

/// Input for creating a single deck card (used in batch_create).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeckHubCardInput {
    pub word: String,
    pub translation: Option<String>,
    pub definition: Option<String>,
    pub pos: Option<String>,
    pub cefr_level: Option<String>,
    pub ipa: Option<String>,
    pub example_sentence: Option<String>,
    pub memory_hook: Option<String>,
    pub collocations: Option<Vec<String>>,
    pub card_type: Option<String>,
}

/// Result of an OCR operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrResult {
    pub text: String,
    pub confidence: f64,
}
