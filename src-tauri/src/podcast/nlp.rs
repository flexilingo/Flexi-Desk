use std::collections::HashMap;

/// Lightweight CEFR word-level analysis for podcast transcripts.
/// Uses Zipf word frequency scores to estimate CEFR levels.
/// ≥6.0 → A1, ≥5.0 → A2, ≥4.0 → B1, ≥3.0 → B2, ≥2.0 → C1, <2.0 → C2

#[derive(Debug, Clone)]
pub struct AnalysisResult {
    pub total_words: i64,
    pub unique_words: i64,
    pub cefr_level: String,
    pub cefr_distribution: HashMap<String, i64>,
    pub avg_sentence_length: f64,
    pub vocabulary_richness: f64,
    pub top_words: Vec<WordFreq>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct WordFreq {
    pub word: String,
    pub count: i64,
    pub cefr: String,
}

/// Analyze concatenated transcript text and produce CEFR statistics.
pub fn analyze_text(text: &str) -> AnalysisResult {
    let words = tokenize(text);
    let total_words = words.len() as i64;

    // Count word frequencies
    let mut freq: HashMap<String, i64> = HashMap::new();
    for w in &words {
        *freq.entry(w.clone()).or_insert(0) += 1;
    }
    let unique_words = freq.len() as i64;

    // CEFR distribution
    let mut cefr_dist: HashMap<String, i64> = HashMap::new();
    for level in &["A1", "A2", "B1", "B2", "C1", "C2"] {
        cefr_dist.insert(level.to_string(), 0);
    }

    for w in &words {
        let level = word_to_cefr(w);
        *cefr_dist.entry(level).or_insert(0) += 1;
    }

    // Overall CEFR: use weighted approach — level where 80% of words are at or below
    let cefr_level = compute_overall_cefr(&cefr_dist, total_words);

    // Average sentence length
    let sentences = text.split(|c: char| c == '.' || c == '!' || c == '?')
        .filter(|s| !s.trim().is_empty())
        .count();
    let avg_sentence_length = if sentences > 0 {
        total_words as f64 / sentences as f64
    } else {
        0.0
    };

    // Vocabulary richness
    let vocabulary_richness = if total_words > 0 {
        unique_words as f64 / total_words as f64
    } else {
        0.0
    };

    // Top words (non-stopword, top 30)
    let mut word_list: Vec<_> = freq.iter()
        .filter(|(w, _)| !is_stopword(w))
        .map(|(w, c)| (w.clone(), *c))
        .collect();
    word_list.sort_by(|a, b| b.1.cmp(&a.1));
    word_list.truncate(30);

    let top_words: Vec<WordFreq> = word_list.into_iter()
        .map(|(word, count)| {
            let cefr = word_to_cefr(&word);
            WordFreq { word, count, cefr }
        })
        .collect();

    AnalysisResult {
        total_words,
        unique_words,
        cefr_level,
        cefr_distribution: cefr_dist,
        avg_sentence_length,
        vocabulary_richness,
        top_words,
    }
}

fn tokenize(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric() && c != '\'')
        .map(|w| w.trim_matches('\'').to_lowercase())
        .filter(|w| w.len() > 1)
        .collect()
}

pub fn word_to_cefr(word: &str) -> String {
    let zipf = get_zipf_score(word);
    if zipf >= 6.0 { "A1".into() }
    else if zipf >= 5.0 { "A2".into() }
    else if zipf >= 4.0 { "B1".into() }
    else if zipf >= 3.0 { "B2".into() }
    else if zipf >= 2.0 { "C1".into() }
    else { "C2".into() }
}

fn compute_overall_cefr(dist: &HashMap<String, i64>, total: i64) -> String {
    if total == 0 { return "A1".into(); }

    let levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    let mut cumulative = 0i64;

    // Find the level where 70% of words are at or below this level
    for level in &levels {
        cumulative += dist.get(*level).copied().unwrap_or(0);
        if cumulative as f64 / total as f64 >= 0.7 {
            return level.to_string();
        }
    }
    "C2".into()
}

fn is_stopword(word: &str) -> bool {
    matches!(word,
        "the" | "a" | "an" | "is" | "are" | "was" | "were" | "be" | "been" |
        "being" | "have" | "has" | "had" | "do" | "does" | "did" | "will" |
        "would" | "could" | "should" | "may" | "might" | "shall" | "can" |
        "to" | "of" | "in" | "for" | "on" | "with" | "at" | "by" | "from" |
        "as" | "into" | "through" | "during" | "before" | "after" | "above" |
        "below" | "between" | "out" | "off" | "over" | "under" | "again" |
        "further" | "then" | "once" | "and" | "but" | "or" | "nor" | "not" |
        "so" | "yet" | "both" | "either" | "neither" | "each" | "every" |
        "all" | "any" | "few" | "more" | "most" | "other" | "some" | "such" |
        "no" | "only" | "own" | "same" | "than" | "too" | "very" | "just" |
        "because" | "if" | "when" | "where" | "how" | "what" | "which" |
        "who" | "whom" | "this" | "that" | "these" | "those" | "it" | "its" |
        "he" | "she" | "we" | "they" | "me" | "him" | "her" | "us" | "them" |
        "my" | "your" | "his" | "our" | "their" | "i'm" | "you're" | "we're" |
        "they're" | "i've" | "you've" | "we've" | "they've" | "don't" |
        "doesn't" | "didn't" | "won't" | "wouldn't" | "couldn't" | "shouldn't" |
        "about" | "up" | "also" | "well" | "now" | "here" | "there" | "really" |
        "like" | "right" | "going" | "know" | "think" | "get" | "got" | "go" |
        "yeah" | "yes" | "oh" | "okay" | "ok" | "um" | "uh" | "ah"
    )
}

/// Simple Zipf frequency scoring based on a built-in word list.
/// The top ~3000 English words with approximate Zipf scores.
/// Words not in the list get a score of 1.5 (assumed rare → C2).
fn get_zipf_score(word: &str) -> f64 {
    // Top English words with approximate Zipf frequency scores
    // Based on word frequency corpora — higher = more common
    match word {
        // A1 level (≥6.0) — most common words
        "the" => 7.7, "be" | "is" | "are" | "was" | "were" | "am" => 7.2,
        "to" => 7.1, "of" => 7.0, "and" => 7.0, "a" | "an" => 6.9,
        "in" => 6.8, "that" => 6.7, "have" | "has" | "had" => 6.6,
        "i" => 6.5, "it" => 6.5, "for" => 6.4, "not" => 6.4,
        "on" => 6.3, "with" => 6.3, "he" | "she" => 6.2, "as" => 6.2,
        "you" => 6.2, "do" | "does" | "did" => 6.1, "at" => 6.1,
        "this" => 6.1, "but" => 6.0, "his" | "her" => 6.0,
        "by" => 6.0, "from" => 6.0, "they" => 6.0, "we" => 6.0,
        "say" | "said" => 6.0, "or" => 6.0, "will" => 6.0,
        "my" => 6.0, "one" => 6.0, "all" => 6.0,

        // A2 level (≥5.0)
        "would" => 5.9, "there" => 5.9, "their" => 5.8,
        "what" => 5.8, "so" => 5.8, "up" => 5.7, "out" => 5.7,
        "if" => 5.7, "about" => 5.6, "who" => 5.6, "get" | "got" => 5.6,
        "which" => 5.5, "go" | "went" | "gone" => 5.5, "when" => 5.5,
        "make" | "made" => 5.5, "can" => 5.5, "like" => 5.5,
        "time" => 5.4, "no" => 5.4, "just" => 5.4, "him" => 5.4,
        "know" | "knew" => 5.4, "take" | "took" => 5.3, "people" => 5.3,
        "into" => 5.3, "year" => 5.3, "your" => 5.3, "good" => 5.3,
        "some" => 5.3, "could" => 5.3, "them" => 5.3,
        "see" | "saw" | "seen" => 5.2, "other" => 5.2, "than" => 5.2,
        "then" => 5.2, "now" => 5.2, "look" | "looked" => 5.2,
        "only" => 5.1, "come" | "came" => 5.1, "its" => 5.1,
        "over" => 5.1, "think" | "thought" => 5.1, "also" => 5.1,
        "back" => 5.1, "after" => 5.1, "use" | "used" => 5.0,
        "two" => 5.0, "how" => 5.0, "our" => 5.0, "work" | "worked" => 5.0,
        "first" => 5.0, "well" => 5.0, "way" => 5.0,
        "even" => 5.0, "new" => 5.0, "want" | "wanted" => 5.0,
        "because" => 5.0, "any" => 5.0, "these" => 5.0,
        "give" | "gave" | "given" => 5.0, "day" => 5.0, "most" => 5.0,

        // B1 level (≥4.0)
        "find" | "found" => 4.9, "here" => 4.9, "thing" | "things" => 4.9,
        "many" => 4.8, "very" => 4.8, "still" => 4.8,
        "tell" | "told" => 4.8, "need" | "needed" => 4.8,
        "through" => 4.7, "life" => 4.7, "much" => 4.7,
        "before" => 4.7, "should" => 4.7, "world" => 4.7,
        "great" => 4.6, "help" | "helped" => 4.6, "where" => 4.6,
        "between" => 4.6, "long" => 4.6, "each" => 4.5,
        "those" => 4.5, "own" => 4.5, "same" => 4.5,
        "hand" => 4.5, "high" => 4.5, "keep" | "kept" => 4.5,
        "last" => 4.5, "never" => 4.5, "point" => 4.5,
        "part" => 4.5, "turn" | "turned" => 4.5, "few" => 4.4,
        "end" => 4.4, "place" => 4.4, "start" | "started" => 4.4,
        "might" => 4.4, "show" | "showed" | "shown" => 4.4,
        "every" => 4.4, "home" => 4.4, "small" => 4.4,
        "off" => 4.3, "old" => 4.3, "number" => 4.3,
        "right" => 4.3, "move" | "moved" => 4.3, "try" | "tried" => 4.3,
        "change" | "changed" => 4.3, "big" => 4.3,
        "ask" | "asked" => 4.2, "again" => 4.2, "play" | "played" => 4.2,
        "run" | "ran" => 4.2, "put" => 4.2, "different" => 4.2,
        "read" => 4.2, "why" => 4.2, "must" => 4.2,
        "head" => 4.1, "under" => 4.1, "set" => 4.1,
        "story" => 4.1, "kind" => 4.1, "always" => 4.1,
        "follow" | "followed" => 4.1, "important" => 4.1,
        "white" => 4.0, "seem" | "seemed" => 4.0, "began" | "begin" => 4.0,
        "left" => 4.0, "call" | "called" => 4.0, "open" | "opened" => 4.0,
        "country" => 4.0, "talk" | "talked" => 4.0,
        "children" | "child" => 4.0, "city" => 4.0,

        // B2 level (≥3.0)
        "learn" | "learned" => 3.9, "study" | "studied" => 3.9,
        "language" => 3.8, "experience" => 3.7,
        "consider" | "considered" => 3.6, "develop" | "developed" => 3.6,
        "particular" => 3.5, "community" => 3.5,
        "evidence" => 3.4, "however" => 3.4,
        "significant" => 3.3, "establish" | "established" => 3.3,
        "technology" => 3.3, "suggest" | "suggested" => 3.3,
        "environment" => 3.2, "political" => 3.2,
        "research" => 3.2, "require" | "required" => 3.2,
        "strategy" => 3.1, "opportunity" => 3.1,
        "analysis" => 3.1, "approach" => 3.1,
        "structure" => 3.0, "identify" | "identified" => 3.0,
        "contribute" | "contributed" => 3.0, "context" => 3.0,

        // C1 level (≥2.0)
        "phenomenon" => 2.8, "paradigm" => 2.5,
        "constitute" | "constituted" => 2.6,
        "elaborate" | "elaborated" => 2.4,
        "inherent" => 2.3, "subsequent" => 2.3,
        "comprehensive" => 2.2, "predominantly" => 2.1,
        "implications" => 2.5, "facilitate" | "facilitated" => 2.3,
        "ambiguous" => 2.1, "coherent" => 2.0,

        // Default: unknown words get a moderate-low score (B2-ish)
        _ => 3.5,
    }
}
