#[tauri::command]
pub fn get_app_data_dir() -> Result<String, String> {
    let base = dirs::data_dir()
        .ok_or_else(|| "Could not determine app data directory".to_string())?;

    let app_dir = base.join("com.flexilingo.desk");

    app_dir
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "App data path contains invalid UTF-8".to_string())
}
