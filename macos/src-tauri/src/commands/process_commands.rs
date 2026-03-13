use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Mutex;

use tauri::{command, AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};

/// Global registry of spawned processes (for wait/kill).
static PROCESSES: std::sync::LazyLock<Mutex<HashMap<String, Child>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// Separate map for stdin handles — survives after child is taken for wait.
static STDIN_HANDLES: std::sync::LazyLock<Mutex<HashMap<String, ChildStdin>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(serde::Deserialize, Default)]
pub struct SpawnOpts {
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
    pub env_remove: Option<Vec<String>>,
}

#[command]
pub async fn spawn_process(
    app: AppHandle,
    id: String,
    program: String,
    args: Vec<String>,
    opts: SpawnOpts,
) -> Result<u32, String> {
    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(cwd) = &opts.cwd {
        cmd.current_dir(cwd);
    }
    if let Some(env) = &opts.env {
        for (k, v) in env {
            cmd.env(k, v);
        }
    }
    // Remove specified env vars (prevents inheriting from parent process)
    if let Some(env_remove) = &opts.env_remove {
        for k in env_remove {
            cmd.env_remove(k);
        }
    }
    // Always remove Claude session markers to prevent "nested session" errors
    cmd.env_remove("CLAUDECODE");
    cmd.env_remove("CLAUDE_CODE_ENTRYPOINT");
    cmd.env_remove("CLAUDE_CODE_MAX_OUTPUT_TOKENS");

    let mut child = cmd.spawn().map_err(|e| format!("spawn({}): {}", program, e))?;
    let pid = child.id().unwrap_or(0);

    // Take stdout/stderr/stdin before storing child
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdin = child.stdin.take();

    // Store stdin separately so it survives the wait task taking the child
    if let Some(stdin) = stdin {
        let mut handles = STDIN_HANDLES.lock().unwrap();
        handles.insert(id.clone(), stdin);
    }

    // Store child (without stdin) for kill
    {
        let mut procs = PROCESSES.lock().unwrap();
        procs.insert(id.clone(), child);
    }

    // Use a shared counter to detect when both stdout+stderr are done
    let done_count = std::sync::Arc::new(std::sync::atomic::AtomicU8::new(0));
    let total_streams = (stdout.is_some() as u8) + (stderr.is_some() as u8);

    // Stream stdout
    if let Some(out) = stdout {
        let app_clone = app.clone();
        let id_clone = id.clone();
        let done = done_count.clone();
        let id_for_wait = id.clone();
        let app_for_wait = app.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(out);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                // Append \n so JS NDJSON parser can split lines
                let _ = app_clone.emit(
                    &format!("process-stdout-{}", id_clone),
                    format!("{}\n", line),
                );
            }
            // Check if both streams done → emit close
            let prev = done.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            if prev + 1 >= total_streams {
                emit_close(&app_for_wait, &id_for_wait).await;
            }
        });
    }

    // Stream stderr
    if let Some(err) = stderr {
        let app_clone = app.clone();
        let id_clone = id.clone();
        let done = done_count.clone();
        let id_for_wait = id.clone();
        let app_for_wait = app.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(err);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone.emit(
                    &format!("process-stderr-{}", id_clone),
                    format!("{}\n", line),
                );
            }
            let prev = done.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            if prev + 1 >= total_streams {
                emit_close(&app_for_wait, &id_for_wait).await;
            }
        });
    }

    // If no streams at all, emit close immediately
    if total_streams == 0 {
        let app_clone = app.clone();
        let id_clone = id.clone();
        tokio::spawn(async move {
            emit_close(&app_clone, &id_clone).await;
        });
    }

    Ok(pid)
}

/// Wait for the process to exit and emit the close event.
async fn emit_close(app: &AppHandle, id: &str) {
    // Clean up stdin handle
    {
        let mut handles = STDIN_HANDLES.lock().unwrap();
        handles.remove(id);
    }

    // Take child from PROCESSES and wait for exit code
    let maybe_child = {
        let mut procs = PROCESSES.lock().unwrap();
        procs.remove(id)
    };
    let code = if let Some(mut child) = maybe_child {
        child.wait().await.ok().and_then(|s| s.code()).unwrap_or(-1)
    } else {
        0
    };
    let _ = app.emit(&format!("process-close-{}", id), code);
}

#[command]
pub async fn kill_process(id: String) -> Result<(), String> {
    // Drop stdin first
    {
        let mut handles = STDIN_HANDLES.lock().unwrap();
        handles.remove(&id);
    }
    let maybe_child = {
        let mut procs = PROCESSES.lock().unwrap();
        procs.remove(&id)
    };
    if let Some(mut child) = maybe_child {
        child.kill().await.map_err(|e| format!("kill: {}", e))?;
    }
    Ok(())
}

#[command]
pub async fn stdin_write(id: String, data: String) -> Result<(), String> {
    // Take stdin out temporarily to avoid holding Mutex across await
    let maybe_stdin = {
        let mut handles = STDIN_HANDLES.lock().unwrap();
        handles.remove(&id)
    };
    if let Some(mut stdin) = maybe_stdin {
        let bytes = data.into_bytes();
        let result = stdin.write_all(&bytes).await;
        // Put stdin back
        let mut handles = STDIN_HANDLES.lock().unwrap();
        handles.insert(id, stdin);
        result.map_err(|e| format!("stdin_write: {}", e))?;
    } else {
        return Err(format!("stdin_write: no stdin handle for process {}", id));
    }
    Ok(())
}

#[command]
pub async fn stdin_close(id: String) -> Result<(), String> {
    let mut handles = STDIN_HANDLES.lock().unwrap();
    handles.remove(&id); // Drop stdin to close it
    Ok(())
}

/// Transcribe audio: writes raw audio blob to temp file, converts to 16kHz WAV via ffmpeg,
/// then runs whisper-cli and returns the transcription text.
#[command]
pub async fn transcribe_audio(
    audio_data: Vec<u8>,
    whisper_path: String,
    whisper_model: String,
    language: String,
) -> Result<String, String> {
    use tokio::process::Command as TokioCommand;

    let tmp_dir = std::env::temp_dir();
    let raw_path = tmp_dir.join("jarvis-voice-raw.mp4");
    let wav_path = tmp_dir.join("jarvis-voice-capture.wav");

    // 1. Write raw audio blob to disk
    std::fs::write(&raw_path, &audio_data)
        .map_err(|e| format!("write raw audio: {}", e))?;

    // 2. Convert to 16kHz mono WAV using ffmpeg
    let ffmpeg = if std::path::Path::new("/opt/homebrew/bin/ffmpeg").exists() {
        "/opt/homebrew/bin/ffmpeg"
    } else if std::path::Path::new("/usr/local/bin/ffmpeg").exists() {
        "/usr/local/bin/ffmpeg"
    } else {
        "ffmpeg"
    };

    let ffmpeg_out = TokioCommand::new(ffmpeg)
        .args([
            "-y", "-i", raw_path.to_str().unwrap(),
            "-ar", "16000", "-ac", "1", "-sample_fmt", "s16",
            wav_path.to_str().unwrap(),
        ])
        .output()
        .await
        .map_err(|e| format!("ffmpeg: {}", e))?;

    if !ffmpeg_out.status.success() {
        let stderr = String::from_utf8_lossy(&ffmpeg_out.stderr);
        let _ = std::fs::remove_file(&raw_path);
        return Err(format!("ffmpeg failed: {}", stderr));
    }
    let _ = std::fs::remove_file(&raw_path);

    // 3. Run whisper-cli
    let whisper_out = TokioCommand::new(&whisper_path)
        .args([
            "-m", &whisper_model,
            "-f", wav_path.to_str().unwrap(),
            "--no-timestamps",
            "-l", &language,
        ])
        .output()
        .await
        .map_err(|e| format!("whisper: {}", e))?;

    let _ = std::fs::remove_file(&wav_path);

    let stdout = String::from_utf8_lossy(&whisper_out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&whisper_out.stderr).to_string();

    // Parse text — remove timestamp prefixes like [00:00:00.000 --> 00:00:05.000]
    let text = stdout
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .map(|l| {
            // Strip [timestamp] prefix
            if l.starts_with('[') {
                if let Some(idx) = l.find(']') {
                    l[idx + 1..].trim()
                } else {
                    l
                }
            } else {
                l
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();

    // Parse detected language from stderr
    let detected_lang = if language == "auto" {
        stderr
            .lines()
            .find_map(|l| {
                if let Some(idx) = l.find("auto-detected language:") {
                    Some(l[idx + 23..].trim().to_string())
                } else {
                    None
                }
            })
    } else {
        None
    };

    // Return as JSON object
    let result = serde_json::json!({
        "text": text,
        "detectedLang": detected_lang,
    });

    Ok(result.to_string())
}

#[command]
pub fn exec_sync(command: String) -> Result<String, String> {
    let output = std::process::Command::new("sh")
        .args(["-c", &command])
        .output()
        .map_err(|e| format!("exec: {}", e))?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[command]
pub async fn open_url(url: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("open_url: {}", e))?;
    Ok(())
}

#[command]
pub async fn open_app(name: String) -> Result<(), String> {
    std::process::Command::new("open")
        .args(["-a", &name])
        .spawn()
        .map_err(|e| format!("open_app: {}", e))?;
    Ok(())
}
