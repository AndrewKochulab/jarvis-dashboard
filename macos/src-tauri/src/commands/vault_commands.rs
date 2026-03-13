use serde_json::Value;
use std::fs;
use std::path::Path;
use tauri::command;
use walkdir::WalkDir;

#[command]
pub fn parse_yaml_frontmatter(path: String) -> Result<Value, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("read({}): {}", path, e))?;

    // Extract YAML between --- fences
    let yaml = if content.starts_with("---") {
        let end = content[3..]
            .find("---")
            .map(|i| i + 3)
            .unwrap_or(content.len());
        &content[3..end]
    } else {
        return Ok(Value::Object(serde_json::Map::new()));
    };

    let parsed: Value =
        serde_yaml::from_str(yaml).map_err(|e| format!("yaml parse: {}", e))?;
    Ok(parsed)
}

#[derive(serde::Serialize)]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    pub mtime_ms: f64,
}

#[command]
pub fn get_recent_files(root: String, count: usize) -> Result<Vec<RecentFile>, String> {
    let root_path = Path::new(&root);
    if !root_path.exists() {
        return Ok(Vec::new());
    }

    let mut files: Vec<RecentFile> = WalkDir::new(root_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "md")
                .unwrap_or(false)
        })
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            let mtime_ms = meta
                .modified()
                .ok()?
                .duration_since(std::time::UNIX_EPOCH)
                .ok()?
                .as_secs_f64()
                * 1000.0;
            Some(RecentFile {
                path: e.path().to_string_lossy().to_string(),
                name: e.file_name().to_string_lossy().to_string(),
                mtime_ms,
            })
        })
        .collect();

    files.sort_by(|a, b| b.mtime_ms.partial_cmp(&a.mtime_ms).unwrap());
    files.truncate(count);
    Ok(files)
}

#[command]
pub fn count_files(folder: String) -> Result<usize, String> {
    let path = Path::new(&folder);
    if !path.exists() {
        return Ok(0);
    }
    let count = WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "md")
                .unwrap_or(false)
        })
        .count();
    Ok(count)
}
