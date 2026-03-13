use tauri::command;

#[command]
pub fn home_dir() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/Users/unknown".to_string())
}

#[command]
pub fn tmp_dir() -> String {
    std::env::temp_dir().to_string_lossy().to_string()
}
