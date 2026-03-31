use std::process::Command;

use super::types::OcrResult;

/// Check if the `tesseract` CLI is available on the system.
pub fn check_tesseract() -> bool {
    Command::new("tesseract")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Run Tesseract OCR on an image file.
/// `image_path` is the path to the image.
/// `language` is an ISO 639-3 Tesseract language code (e.g. "eng", "fas", "ara").
/// Returns the extracted text.
pub fn run_ocr(image_path: &str, language: Option<&str>) -> Result<OcrResult, String> {
    let lang = language.unwrap_or("eng");

    let output = Command::new("tesseract")
        .arg(image_path)
        .arg("stdout")
        .arg("-l")
        .arg(lang)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "TESSERACT_NOT_FOUND".to_string()
            } else {
                format!("Failed to run tesseract: {e}")
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if stderr.contains("Error, could not initialize tesseract") || stderr.contains("Failed loading") {
            return Err(format!("TESSDATA_MISSING: Language data for '{}' not found. {}", lang, stderr));
        }
        return Err(format!("Tesseract error: {stderr}"));
    }

    let text = String::from_utf8_lossy(&output.stdout).to_string();
    let text = text.trim().to_string();

    Ok(OcrResult {
        text,
        confidence: 1.0, // CLI doesn't expose confidence per-run; treat as 100%
    })
}

/// Map a FlexiLingo language code (ISO 639-1) to Tesseract language code (ISO 639-3).
pub fn lang_to_tesseract(lang: &str) -> &str {
    match lang {
        "en" => "eng",
        "fa" => "fas",
        "ar" => "ara",
        "tr" => "tur",
        "es" => "spa",
        "fr" => "fra",
        "de" => "deu",
        "zh" => "chi_sim",
        "hi" => "hin",
        "ru" => "rus",
        "ja" => "jpn",
        "ko" => "kor",
        "pt" => "por",
        "it" => "ita",
        _ => "eng",
    }
}

/// Get install instructions for the current platform.
pub fn install_instructions() -> String {
    #[cfg(target_os = "macos")]
    {
        "brew install tesseract".to_string()
    }
    #[cfg(target_os = "windows")]
    {
        "Download from: https://github.com/UB-Mannheim/tesseract/wiki".to_string()
    }
    #[cfg(target_os = "linux")]
    {
        "sudo apt install tesseract-ocr".to_string()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "Install Tesseract OCR from: https://tesseract-ocr.github.io/".to_string()
    }
}
