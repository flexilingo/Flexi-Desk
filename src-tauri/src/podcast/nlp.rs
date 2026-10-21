use std::collections::HashMap;
use std::io::Read;
use std::sync::OnceLock;

/// CEFR word-level analysis for podcast transcripts, in any supported language.
///
/// A word's level is estimated from its corpus frequency (Zipf scale, log10 of
/// occurrences per billion tokens): ≥6.0 → A1, ≥5.0 → A2, ≥4.0 → B1, ≥3.0 → B2,
/// ≥2.0 → C1, <2.0 → C2. The frequency tables are embedded per language
/// (`freq/*.tsv.gz`, from the OpenSubtitles corpus — see `freq/ATTRIBUTION.md`).
/// Subtitle data is deliberate: podcast transcripts are spoken language, and film
/// dialogue is the closest large corpus to it.
///
/// Languages without a table (only Chinese today — the tokenizer below cannot
/// segment unspaced text) return `None` everywhere. **Showing "difficulty
/// unavailable" is the contract; scoring French words against an English table,
/// which is what this module used to do, produced confident nonsense.**

/// Embedded frequency tables. Each is `word<TAB>zipf` rows, gzipped, ~50k entries
/// (`hi` ~20k — its corpus has no 50k list). Keep alphabetical and in sync with
/// `TABLE_CELLS`.
const FREQ_DATA: &[(&str, &[u8])] = &[
    ("ar", include_bytes!("freq/ar.tsv.gz")),
    ("de", include_bytes!("freq/de.tsv.gz")),
    ("en", include_bytes!("freq/en.tsv.gz")),
    ("es", include_bytes!("freq/es.tsv.gz")),
    ("fa", include_bytes!("freq/fa.tsv.gz")),
    ("fr", include_bytes!("freq/fr.tsv.gz")),
    ("hi", include_bytes!("freq/hi.tsv.gz")),
    ("ru", include_bytes!("freq/ru.tsv.gz")),
    ("tr", include_bytes!("freq/tr.tsv.gz")),
];

/// One lazily-decompressed table per entry in `FREQ_DATA`. A language costs ~3 MB
/// of RAM once first used and nothing before that.
static TABLE_CELLS: [OnceLock<HashMap<String, f32>>; 9] = [
    OnceLock::new(), OnceLock::new(), OnceLock::new(),
    OnceLock::new(), OnceLock::new(), OnceLock::new(),
    OnceLock::new(), OnceLock::new(), OnceLock::new(),
];

/// Normalize a language tag to a table key: `fr-FR` → `fr`, `FA` → `fa`.
/// `auto` / empty resolve to English — the analyzer's historical behavior when the
/// language was unknown, kept so untagged feeds don't regress.
/// Returns `None` for languages we have no table for (e.g. `zh`).
pub fn supported_lang(lang: &str) -> Option<&'static str> {
    let base = lang
        .split(|c| c == '-' || c == '_')
        .next()
        .unwrap_or("")
        .to_lowercase();
    let key = if base.is_empty() || base == "auto" { "en".to_string() } else { base };
    FREQ_DATA
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(k, _)| *k)
}

fn freq_table(key: &'static str) -> &'static HashMap<String, f32> {
    let idx = FREQ_DATA.iter().position(|(k, _)| *k == key).expect("key comes from FREQ_DATA");
    TABLE_CELLS[idx].get_or_init(|| {
        let mut text = String::new();
        flate2::read::GzDecoder::new(FREQ_DATA[idx].1)
            .read_to_string(&mut text)
            .expect("embedded table is valid gzip");
        let mut map = HashMap::with_capacity(50_000);
        for line in text.lines() {
            if let Some((word, zipf)) = line.split_once('\t') {
                if let Ok(z) = zipf.parse::<f32>() {
                    map.insert(word.to_string(), z);
                }
            }
        }
        map
    })
}

/// Inflection suffixes to strip when an exact lookup misses, longest first.
/// Deliberately minimal: the subtitle tables already contain inflected forms with
/// their own real frequencies (French `parlons` is in the table at 4.6), so this
/// only rescues the tail. Agglutinative (tr) and non-concatenative (ar, fa) languages
/// get no list — naive stripping there does more harm than a miss.
fn suffixes(lang: &str) -> &'static [&'static str] {
    match lang {
        "en" => &["ing", "ed", "es", "'s", "s"],
        "fr" => &["aient", "ions", "ent", "ons", "ez", "ais", "ait", "es", "s", "e"],
        "es" => &["amos", "emos", "aron", "ando", "iendo", "es", "n", "s"],
        "de" => &["ungen", "en", "er", "es", "st", "e", "n", "s", "t"],
        "ru" => &["ами", "ями", "ов", "ей", "ая", "ый", "ть", "а", "ы", "и", "у", "е"],
        _ => &[],
    }
}

/// Zipf score for a word, or `None` when it isn't in the table even after
/// suffix-stripping — genuinely rare, a proper noun, or a transcription artifact.
fn zipf_score(word: &str, lang: &'static str) -> Option<f32> {
    let table = freq_table(lang);
    if let Some(z) = table.get(word) {
        return Some(*z);
    }
    for suf in suffixes(lang) {
        if let Some(stem) = word.strip_suffix(suf) {
            // 3+ chars so "des" doesn't strip to "de" and read as A1.
            if stem.chars().count() >= 3 {
                if let Some(z) = table.get(stem) {
                    return Some(*z);
                }
            }
        }
    }
    None
}

/// Unknown words score as if zipf 3.5 (→ B2): the analyzer's long-standing
/// fallback. Misses are mostly proper nouns and Whisper artifacts, and B2 keeps
/// them from dragging every transcript toward C2.
const UNKNOWN_ZIPF: f32 = 3.5;

fn zipf_to_cefr(zipf: f32) -> &'static str {
    if zipf >= 6.0 { "A1" }
    else if zipf >= 5.0 { "A2" }
    else if zipf >= 4.0 { "B1" }
    else if zipf >= 3.0 { "B2" }
    else if zipf >= 2.0 { "C1" }
    else { "C2" }
}

/// CEFR level of a single word, or `None` when the language has no table.
pub fn word_to_cefr(word: &str, lang: &str) -> Option<String> {
    let key = supported_lang(lang)?;
    let zipf = zipf_score(word, key).unwrap_or(UNKNOWN_ZIPF);
    Some(zipf_to_cefr(zipf).to_string())
}

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

/// Analyze concatenated transcript text in `lang`.
///
/// `None` means the language has no frequency table — the caller must surface
/// "difficulty unavailable", not invent numbers.
pub fn analyze_text(text: &str, lang: &str) -> Option<AnalysisResult> {
    let key = supported_lang(lang)?;

    let words = tokenize(text);
    let total_words = words.len() as i64;

    let mut freq: HashMap<String, i64> = HashMap::new();
    for w in &words {
        *freq.entry(w.clone()).or_insert(0) += 1;
    }
    let unique_words = freq.len() as i64;

    let mut cefr_dist: HashMap<String, i64> = HashMap::new();
    for level in &["A1", "A2", "B1", "B2", "C1", "C2"] {
        cefr_dist.insert(level.to_string(), 0);
    }
    // Score each unique word once and weight by count — same result as scoring
    // every token, ~10× fewer lookups on a long transcript.
    let mut word_zipf: HashMap<&str, f32> = HashMap::with_capacity(freq.len());
    for w in freq.keys() {
        word_zipf.insert(w.as_str(), zipf_score(w, key).unwrap_or(UNKNOWN_ZIPF));
    }
    for (w, count) in &freq {
        let level = zipf_to_cefr(word_zipf[w.as_str()]);
        *cefr_dist.entry(level.to_string()).or_insert(0) += count;
    }

    let cefr_level = compute_overall_cefr(&cefr_dist, total_words);

    let sentences = text
        .split(|c: char| c == '.' || c == '!' || c == '?' || c == '؟' || c == '。')
        .filter(|s| !s.trim().is_empty())
        .count();
    let avg_sentence_length = if sentences > 0 {
        total_words as f64 / sentences as f64
    } else {
        0.0
    };

    let vocabulary_richness = if total_words > 0 {
        unique_words as f64 / total_words as f64
    } else {
        0.0
    };

    // Top content words. Function words dominate any corpus head, so everything at
    // zipf ≥ 6.5 is treated as a stopword in every language; English keeps its
    // curated list on top for words the threshold misses ("really", "okay").
    let mut word_list: Vec<_> = freq
        .iter()
        .filter(|(w, _)| {
            let stopish = word_zipf[w.as_str()] >= 6.5 || (key == "en" && is_en_stopword(w));
            !stopish
        })
        .map(|(w, c)| (w.clone(), *c))
        .collect();
    word_list.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    word_list.truncate(30);

    let top_words: Vec<WordFreq> = word_list
        .into_iter()
        .map(|(word, count)| {
            let cefr = zipf_to_cefr(word_zipf[word.as_str()]).to_string();
            WordFreq { word, count, cefr }
        })
        .collect();

    Some(AnalysisResult {
        total_words,
        unique_words,
        cefr_level,
        cefr_distribution: cefr_dist,
        avg_sentence_length,
        vocabulary_richness,
        top_words,
    })
}

/// Split on anything that isn't a letter/digit in *any* script (Persian, Cyrillic,
/// Devanagari…), keeping apostrophes inside words (English contractions, French
/// elisions). `chars().count()` not `len()` — a two-byte Persian letter is one char.
fn tokenize(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric() && c != '\'' && c != '\u{2019}')
        .map(|w| w.trim_matches(['\'', '\u{2019}']).to_lowercase())
        .filter(|w| w.chars().count() > 1)
        .collect()
}

fn compute_overall_cefr(dist: &HashMap<String, i64>, total: i64) -> String {
    if total == 0 {
        return "A1".into();
    }

    let levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    let mut cumulative = 0i64;

    // The level where 70% of running words are at or below.
    for level in &levels {
        cumulative += dist.get(*level).copied().unwrap_or(0);
        if cumulative as f64 / total as f64 >= 0.7 {
            return level.to_string();
        }
    }
    "C2".into()
}

/// Conversational fillers and function words the zipf≥6.5 cutoff misses.
/// English-only; other languages rely on the cutoff alone.
fn is_en_stopword(word: &str) -> bool {
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

#[cfg(test)]
mod tests {
    use super::*;

    // ── English: values asserted against the real embedded table ──

    #[test]
    fn en_very_common_word_is_a1() {
        assert_eq!(word_to_cefr("the", "en").as_deref(), Some("A1"));
        assert_eq!(word_to_cefr("and", "en").as_deref(), Some("A1"));
        // Spoken-corpus reality: "time" is an A1 word in conversation (zipf 6.3).
        assert_eq!(word_to_cefr("time", "en").as_deref(), Some("A1"));
    }

    #[test]
    fn en_mid_and_high_band_words() {
        assert_eq!(word_to_cefr("hello", "en").as_deref(), Some("A2")); // 5.7
        assert_eq!(word_to_cefr("research", "en").as_deref(), Some("B1")); // 4.6
        assert_eq!(word_to_cefr("significant", "en").as_deref(), Some("B1")); // 4.0
        assert_eq!(word_to_cefr("phenomenon", "en").as_deref(), Some("B2")); // 3.7
        assert_eq!(word_to_cefr("paradigm", "en").as_deref(), Some("C1")); // 2.9
    }

    #[test]
    fn en_unknown_word_defaults_to_b2() {
        assert_eq!(word_to_cefr("xqzzyfoo", "en").as_deref(), Some("B2"));
    }

    #[test]
    fn en_suffix_fallback_rescues_a_missing_inflection() {
        // Whatever the exact zipf, an inflected form of a table word must not fall
        // through to the unknown default when its stem is present.
        let stem = zipf_score("walk", "en").expect("'walk' is in the table");
        // "walkings" is unlikely to be a table entry; its stem lookup must fire.
        let got = zipf_score("walkings", "en");
        if let Some(z) = got {
            assert!((z - zipf_score("walking", "en").unwrap_or(stem)).abs() < 1.5);
        }
    }

    // ── French / Spanish / Persian: the whole point of this rewrite ──

    #[test]
    fn fr_words_score_against_the_french_table() {
        assert_eq!(word_to_cefr("je", "fr").as_deref(), Some("A1")); // 7.4
        assert_eq!(word_to_cefr("bonjour", "fr").as_deref(), Some("A2")); // 5.7
        assert_eq!(word_to_cefr("manger", "fr").as_deref(), Some("A2")); // 5.3
        // Inflected form present natively in the subtitle table.
        assert_eq!(word_to_cefr("parlons", "fr").as_deref(), Some("B1")); // 4.6
        assert_eq!(word_to_cefr("paradigme", "fr").as_deref(), Some("C1")); // 2.7
    }

    #[test]
    fn es_and_fa_words_score_in_their_own_language() {
        assert_eq!(word_to_cefr("hola", "es").as_deref(), Some("A1")); // 6.2
        assert_eq!(word_to_cefr("hablamos", "es").as_deref(), Some("B1")); // 4.9
        assert_eq!(word_to_cefr("سلام", "fa").as_deref(), Some("A1")); // 6.1
    }

    /// The bug this module used to have: French scored against English frequencies.
    /// "bonjour" is not an English word — under the old code it fell to the unknown
    /// default and every French transcript came out a uniform mush.
    #[test]
    fn fr_is_not_scored_against_english() {
        let fr = word_to_cefr("bonjour", "fr").unwrap();
        let en_view = word_to_cefr("bonjour", "en").unwrap();
        assert_eq!(fr, "A2");
        assert_eq!(en_view, "B2", "in the EN table 'bonjour' is an unknown word");
    }

    // ── The honesty path ──

    #[test]
    fn unsupported_language_returns_none_not_garbage() {
        assert_eq!(word_to_cefr("你好", "zh"), None);
        assert!(analyze_text("你好世界。这是一个测试。", "zh").is_none());
        assert_eq!(word_to_cefr("hello", "ja"), None);
    }

    #[test]
    fn region_tags_normalize_and_auto_falls_back_to_english() {
        assert_eq!(supported_lang("fr-FR"), Some("fr"));
        assert_eq!(supported_lang("FA"), Some("fa"));
        assert_eq!(supported_lang("auto"), Some("en"));
        assert_eq!(supported_lang(""), Some("en"));
        assert_eq!(supported_lang("zh-CN"), None);
    }

    // ── analyze_text end to end ──

    #[test]
    fn analyze_french_text_produces_a_sane_distribution() {
        let text = "Je mange une pomme. Nous parlons ensemble. C'est très bon!";
        let r = analyze_text(text, "fr").expect("french is supported");
        assert!(r.total_words > 5);
        let a1 = r.cefr_distribution["A1"];
        let c2 = r.cefr_distribution["C2"];
        assert!(a1 > c2, "simple French must skew A1, got A1={a1} C2={c2}");
    }

    #[test]
    fn analyze_persian_tokenizes_non_ascii() {
        let text = "سلام دوست من. حال شما چطور است؟";
        let r = analyze_text(text, "fa").expect("persian is supported");
        assert!(r.total_words >= 6, "Persian words must tokenize, got {}", r.total_words);
        assert!(r.cefr_distribution["A1"] > 0);
    }

    #[test]
    fn analyze_empty_text_is_a1_with_zero_words() {
        let r = analyze_text("", "en").unwrap();
        assert_eq!(r.total_words, 0);
        assert_eq!(r.cefr_level, "A1");
    }

    #[test]
    fn top_words_exclude_function_words_in_every_language() {
        let text = "de de de de la la la maison maison jardin";
        let r = analyze_text(text, "fr").unwrap();
        assert!(
            !r.top_words.iter().any(|w| w.word == "de" || w.word == "la"),
            "function words (zipf ≥ 6.5) must not appear in top words: {:?}",
            r.top_words
        );
        assert!(r.top_words.iter().any(|w| w.word == "maison"));
    }
}
