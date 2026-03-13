use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::command;

#[command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read_file({}): {}", path, e))
}

#[command]
pub fn batch_read_files(paths: Vec<String>) -> Result<HashMap<String, String>, String> {
    let mut results = HashMap::new();
    for path in paths {
        match fs::read_to_string(&path) {
            Ok(content) => {
                results.insert(path, content);
            }
            Err(e) => {
                eprintln!("[batch_read] skip {}: {}", path, e);
            }
        }
    }
    Ok(results)
}

#[command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir parent: {}", e))?;
    }
    fs::write(&path, &content).map_err(|e| format!("write_file({}): {}", path, e))
}

#[command]
pub fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir parent: {}", e))?;
    }
    fs::write(&path, &data).map_err(|e| format!("write_binary({}): {}", path, e))
}

#[derive(serde::Serialize)]
pub struct FileStat {
    pub mtime_ms: f64,
    pub size: u64,
    pub is_directory: bool,
}

#[command]
pub fn stat_file(path: String) -> Result<FileStat, String> {
    let meta = fs::metadata(&path).map_err(|e| format!("stat({}): {}", path, e))?;
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0);
    Ok(FileStat {
        mtime_ms,
        size: meta.len(),
        is_directory: meta.is_dir(),
    })
}

#[command]
pub fn readdir(path: String) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("readdir({}): {}", path, e))?;
    let mut names = Vec::new();
    for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
            names.push(name.to_string());
        }
    }
    Ok(names)
}

#[command]
pub fn exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[command]
pub fn mkdir(path: String, recursive: bool) -> Result<(), String> {
    if recursive {
        fs::create_dir_all(&path)
    } else {
        fs::create_dir(&path)
    }
    .map_err(|e| format!("mkdir({}): {}", path, e))
}
