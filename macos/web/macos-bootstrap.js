/**
 * macOS Bootstrap — monkeypatches window globals so src/ modules
 * run identically to Obsidian Desktop.
 *
 * Sequence:
 *   1. Fetch OS info (homedir, tmpdir) from Rust
 *   2. Read vault path from persistent store (or prompt user)
 *   3. Batch-preload all src/ files + session data into cache
 *   4. Install require() shim, window.app, window.dv, window.Notice, Buffer
 *   5. Call loadDashboard() from shared/loader.js
 *   6. Start background cache refresh for live data
 */
window.__macosBootstrap = async function () {
  const { invoke } = window.__TAURI__.core;
  const adapter = window.__tauriAdapter;

  // ── Caches for sync shim operations ──
  const _fileCache = adapter._fileCache;          // path → string content
  const _dirCache = new Map();                     // path → string[] entries
  const _statCache = new Map();                    // path → {mtimeMs, size, isDirectory}
  const _existsCache = new Map();                  // path → boolean
  let _pgrepCache = "";                            // cached pgrep output

  // ── 1. OS info ──
  adapter._homedir = await invoke("home_dir");
  adapter._tmpdir = await invoke("tmp_dir");
  const homedir = adapter._homedir;

  // ── 2. Vault path ──
  let vaultBasePath = localStorage.getItem("jarvis_vault_path") || "";

  if (!vaultBasePath) {
    // No vault configured — prompt user to select one on first launch
    try {
      const { open } = window.__TAURI__.dialog;
      const selected = await open({
        directory: true,
        defaultPath: homedir,
        title: "Select your Obsidian Vault folder",
      });
      if (selected) {
        vaultBasePath = selected;
        localStorage.setItem("jarvis_vault_path", vaultBasePath);
      }
    } catch (e) {
      // Fallback to prompt if dialog plugin not available
      const selected = prompt("Enter your Obsidian vault path:");
      if (selected) {
        vaultBasePath = selected;
        localStorage.setItem("jarvis_vault_path", vaultBasePath);
      }
    }
    if (!vaultBasePath) {
      // User cancelled — use a safe empty default
      vaultBasePath = homedir;
    }
  }

  adapter._vaultBasePath = vaultBasePath;

  // Dashboard directory detection
  let dashboardDir = localStorage.getItem("jarvis_dashboard_dir") || "";
  if (!dashboardDir) {
    const candidates = [
      vaultBasePath + "/MOCs/jarvis_dashboard",
    ];
    for (const dir of candidates) {
      if (await invoke("exists", { path: dir + "/src/config/config.example.json" })) {
        dashboardDir = dir;
        localStorage.setItem("jarvis_dashboard_dir", dashboardDir);
        break;
      }
    }
    if (!dashboardDir) {
      dashboardDir = candidates[0];
      localStorage.setItem("jarvis_dashboard_dir", dashboardDir);
    }
  }

  const srcDir = dashboardDir + "/src/";

  // ── 3. Pre-cache: source files ──
  const moduleFiles = [
    "config/config.example.json",
    "config/config.json",
    "config/config.local.json",
    "core/theme.js", "core/styles.js", "core/helpers.js", "core/markdown-renderer.js",
    "services/session-parser.js", "services/session-worker.js", "services/stats-engine.js",
    "services/timer-service.js", "services/voice-service.js", "services/tts-service.js",
    "services/session-manager-core.js", "services/session-manager.js", "services/network-client.js",
    "widgets/header/index.js", "widgets/live-sessions/index.js", "widgets/system-diagnostics/index.js",
    "widgets/agent-cards/index.js", "widgets/activity-analytics/index.js", "widgets/communication-link/index.js",
    "widgets/focus-timer/index.js", "widgets/quick-capture/index.js", "widgets/quick-launch/index.js",
    "widgets/mission-control/index.js", "widgets/recent-activity/index.js", "widgets/voice-command/index.js",
    "widgets/voice-command/mobile.js", "widgets/footer/index.js",
    // Widget sub-modules (pre-cached for on-demand loadSub)
    "widgets/agent-cards/ui/robot-avatar.js", "widgets/agent-cards/ui/agent-card.js",
    "widgets/live-sessions/core/session-differ.js", "widgets/live-sessions/ui/session-row.js",
    "widgets/live-sessions/ui/status-panel.js",
    "widgets/focus-timer/core/timer-state.js", "widgets/focus-timer/ui/circular-display.js",
    "widgets/focus-timer/ui/preset-row.js", "widgets/focus-timer/ui/control-buttons.js",
    "widgets/activity-analytics/ui/heatmap-panel.js", "widgets/activity-analytics/ui/peak-hours-panel.js",
    "widgets/activity-analytics/ui/model-breakdown-panel.js",
    "widgets/quick-capture/ui/mic-button.js", "widgets/quick-capture/ui/capture-input.js",
    "widgets/header/ui/status-line.js", "widgets/header/ui/title-display.js", "widgets/header/ui/clock.js",
    "widgets/communication-link/ui/terminal-display.js",
    "widgets/system-diagnostics/ui/stat-card.js",
    "widgets/quick-launch/ui/bookmark-card.js",
    "widgets/recent-activity/ui/activity-row.js",
    "widgets/mission-control/ui/nav-button.js",
    // Voice command sub-modules
    "widgets/voice-command/core/utilities.js",
    "widgets/voice-command/core/state-machine.js",
    "widgets/voice-command/core/arc-reactor.js",
    "widgets/voice-command/core/text-input.js",
    "widgets/voice-command/core/connection-bar.js",
    "widgets/voice-command/core/terminal-panel.js",
    "widgets/voice-command/core/interaction-cards.js",
    "widgets/voice-command/core/reconnect-manager.js",
    "widgets/voice-command/core/stream-handler.js",
    "widgets/voice-command/core/session-tabs.js",
    "widgets/voice-command/core/project-selector.js",
    "widgets/voice-command/adapters/storage-adapter.js",
    "widgets/voice-command/adapters/recorder-adapter.js",
    "widgets/voice-command/adapters/tts-adapter.js",
    "widgets/voice-command/desktop/process-manager.js",
  ];

  const fullPaths = moduleFiles.map(f => srcDir + f);
  await adapter.preloadFiles(fullPaths);

  // ── 3b. Pre-cache: session data from ~/.claude/ ──
  const claudeRoot = homedir + "/.claude";
  const projectsRoot = claudeRoot + "/projects";

  async function cacheDir(dirPath) {
    try {
      const entries = await invoke("readdir", { path: dirPath });
      _dirCache.set(dirPath, entries);
      return entries;
    } catch {
      _dirCache.set(dirPath, []);
      return [];
    }
  }

  async function cacheFileStat(filePath) {
    try {
      const stat = await invoke("stat_file", { path: filePath });
      _statCache.set(filePath, stat);
      _existsCache.set(filePath, true);
      return stat;
    } catch {
      _existsCache.set(filePath, false);
      return null;
    }
  }

  async function cacheFile(filePath) {
    try {
      const content = await invoke("read_file", { path: filePath });
      _fileCache.set(filePath, content);
      return content;
    } catch {
      return null;
    }
  }

  // Cache the ~/.claude directory tree used by session-parser
  // Track JSONL file mtimes to avoid re-reading unchanged files
  const _jsonlMtimes = new Map(); // path → mtime_ms

  async function refreshSessionCache(isInitial = false) {
    // Project directories
    const projects = await cacheDir(projectsRoot);

    // ~/.claude root + sessions file
    await cacheDir(claudeRoot);
    const sessionsFile = claudeRoot + "/jarvis-sessions.json";
    const sessStat = await cacheFileStat(sessionsFile);
    if (sessStat && _existsCache.get(sessionsFile)) {
      const prevMtime = _jsonlMtimes.get(sessionsFile);
      if (isInitial || !prevMtime || sessStat.mtime_ms !== prevMtime) {
        await cacheFile(sessionsFile);
        _jsonlMtimes.set(sessionsFile, sessStat.mtime_ms);
      }
    }

    // For each tracked project, cache its session directory
    for (const proj of projects) {
      const projDir = projectsRoot + "/" + proj;
      const projStat = await cacheFileStat(projDir);
      if (!projStat || !projStat.is_directory) continue;

      const entries = await cacheDir(projDir);

      // Cache JSONL stats; only re-read content if mtime changed
      for (const entry of entries) {
        if (entry.endsWith(".jsonl")) {
          const filePath = projDir + "/" + entry;
          const stat = await cacheFileStat(filePath);
          if (!stat) continue;
          const prevMtime = _jsonlMtimes.get(filePath);
          if (isInitial || !prevMtime || stat.mtime_ms !== prevMtime) {
            await cacheFile(filePath);
            _jsonlMtimes.set(filePath, stat.mtime_ms);
          }
        }
      }

      // Cache timer state file for focus-timer persistence
      const timerStatePath = projDir + "/jarvis-timer-state.json";
      const timerStat = await cacheFileStat(timerStatePath);
      if (timerStat && !timerStat.is_directory) {
        const prevMtime = _jsonlMtimes.get(timerStatePath);
        if (isInitial || !prevMtime || timerStat.mtime_ms !== prevMtime) {
          await cacheFile(timerStatePath);
          _jsonlMtimes.set(timerStatePath, timerStat.mtime_ms);
        }
      }
    }

    // Cache pgrep output for process detection
    try {
      _pgrepCache = await invoke("exec_sync", { command: "pgrep -fa 'claude' 2>/dev/null || true" });
    } catch {
      _pgrepCache = "";
    }
  }

  // Pre-cache vault paths used by widgets
  // Read target folder from config (Quick Capture widget uses this)
  function getConfigValue(path) {
    try {
      const cfgText = _fileCache.get(srcDir + "config/config.json")
        || _fileCache.get(srcDir + "config/config.example.json");
      if (!cfgText) return undefined;
      let obj = JSON.parse(cfgText);
      for (const key of path.split(".")) { obj = obj?.[key]; }
      return obj;
    } catch { return undefined; }
  }

  async function cacheVaultRecentFiles() {
    const captureFolder = getConfigValue("widgets.quickCapture.targetFolder") || "Inbox";
    const vaultPaths = [
      vaultBasePath + "/" + captureFolder,
      vaultBasePath,
    ];
    for (const p of vaultPaths) {
      await cacheDir(p);
      await cacheFileStat(p);
    }
  }

  // Pre-cache binary paths used by voice-service, tts-service, and voice-command
  async function cacheBinaryPaths() {
    const binaries = [
      homedir + "/.local/bin/claude",
      "/usr/local/bin/claude",
      "/opt/homebrew/bin/claude",
      "/opt/homebrew/bin/whisper-cli",
      "/usr/local/bin/whisper-cli",
      "/opt/homebrew/bin/ffmpeg",
      "/opt/homebrew/share/whisper-cpp/ggml-small.bin",
      "/opt/homebrew/share/whisper-cpp/ggml-base.bin",
      homedir + "/Library/Python/3.9/bin/piper",
      homedir + "/.config/piper/en_US-joe-medium.onnx",
    ];
    // Batch check existence via stat
    for (const p of binaries) {
      const stat = await cacheFileStat(p);
      _existsCache.set(p, stat !== null);
    }
  }

  // Run initial cache population
  await cacheBinaryPaths();
  await refreshSessionCache(true);
  await cacheVaultRecentFiles();

  // Timer state
  const timerLogPath = getConfigValue("widgets.focusTimer.logPath") || "Productivity";
  const timerStatePath = vaultBasePath + "/" + timerLogPath;
  await cacheDir(timerStatePath);

  // ── 4. Install require() shim ──
  const pathPolyfill = window.__pathPolyfill;

  const tauriFs = {
    readFileSync(path, encoding) {
      if (_fileCache.has(path)) return _fileCache.get(path);
      // Try expanding ~ to homedir
      if (path.startsWith("~/")) {
        const expanded = homedir + path.slice(1);
        if (_fileCache.has(expanded)) return _fileCache.get(expanded);
      }
      console.warn("[tauriFs] readFileSync cache miss:", path);
      return "";
    },

    writeFileSync(path, content) {
      if (content instanceof Uint8Array || content instanceof ArrayBuffer) {
        // Binary data — use write_binary_file and track the pending write
        const bytes = content instanceof ArrayBuffer
          ? Array.from(new Uint8Array(content))
          : Array.from(content);
        window.__pendingBinaryWrite = invoke("write_binary_file", { path, data: bytes })
          .catch(e => console.warn("[tauriFs] writeBinary failed:", path, e));
      } else {
        _fileCache.set(path, content);
        invoke("write_file", { path, content: String(content) }).catch(e =>
          console.warn("[tauriFs] writeFile failed:", path, e));
      }
    },

    existsSync(path) {
      if (_existsCache.has(path)) return _existsCache.get(path);
      if (_fileCache.has(path)) return true;
      if (_dirCache.has(path)) return true;
      if (path.startsWith("~/")) {
        const expanded = homedir + path.slice(1);
        if (_existsCache.has(expanded)) return _existsCache.get(expanded);
        if (_fileCache.has(expanded)) return true;
      }
      return false;
    },

    statSync(path) {
      const expandedPath = path.startsWith("~/") ? homedir + path.slice(1) : path;
      const cached = _statCache.get(path) || _statCache.get(expandedPath);
      if (cached) {
        return {
          mtimeMs: cached.mtime_ms,
          size: cached.size,
          isDirectory() { return cached.is_directory; },
          isFile() { return !cached.is_directory; },
        };
      }
      // Return a reasonable default so callers don't crash
      return {
        mtimeMs: 0,
        size: 0,
        isDirectory() { return _dirCache.has(path) || _dirCache.has(expandedPath); },
        isFile() { return _fileCache.has(path) || _fileCache.has(expandedPath); },
      };
    },

    readdirSync(path) {
      if (_dirCache.has(path)) return _dirCache.get(path);
      const expanded = path.startsWith("~/") ? homedir + path.slice(1) : path;
      if (_dirCache.has(expanded)) return _dirCache.get(expanded);
      console.warn("[tauriFs] readdirSync cache miss:", path);
      // Trigger async cache fill for next time
      cacheDir(expanded);
      return [];
    },

    openSync(path, flags) {
      // Used by session-parser for incremental JSONL reading
      // Return a fake fd — readSync will use the path from cache
      return { __path: path, __offset: 0 };
    },

    readSync(fd, buffer, offset, length, position) {
      // session-parser reads JSONL files incrementally
      if (fd && fd.__path) {
        const content = _fileCache.get(fd.__path) || "";
        const bytes = new TextEncoder().encode(content);
        const start = position != null ? position : fd.__offset;
        const chunk = bytes.slice(start, start + length);
        if (buffer instanceof Uint8Array) {
          buffer.set(chunk, offset);
        }
        fd.__offset = start + chunk.length;
        return chunk.length;
      }
      return 0;
    },

    closeSync(fd) {
      // no-op
    },

    mkdirSync(path, opts) {
      invoke("mkdir", { path, recursive: opts?.recursive || false }).catch(() => {});
    },

    promises: {
      readFile: (p) => adapter.readFileAsync(p),
      writeFile: (p, c) => adapter.writeFile(p, c),
      stat: (p) => adapter.stat(p),
      readdir: (p) => adapter.readdir(p),
    },
  };

  const tauriOs = {
    homedir() { return homedir; },
    tmpdir() { return adapter._tmpdir; },
    platform() { return "darwin"; },
    type() { return "Darwin"; },
  };

  const tauriChildProcess = {
    execSync(cmd) {
      // Return cached pgrep result for process detection
      if (cmd.includes("pgrep")) return _pgrepCache;
      console.warn("[tauri] execSync called (uncached):", cmd);
      return "";
    },

    exec(cmd, opts, cb) {
      // Handle (cmd, cb) and (cmd, opts, cb) signatures
      if (typeof opts === "function") { cb = opts; opts = {}; }
      invoke("exec_sync", { command: cmd })
        .then(out => {
          // Update pgrep cache if applicable
          if (cmd.includes("pgrep")) _pgrepCache = out;
          cb && cb(null, out, "");
        })
        .catch(err => cb && cb(err, "", ""));
    },

    execFile(cmd, args, optsOrCb, maybeCb) {
      // Handle (cmd, args, cb) and (cmd, args, opts, cb) signatures
      let cb = maybeCb || (typeof optsOrCb === "function" ? optsOrCb : null);
      if (cmd === "open" && args[0] === "-a") {
        invoke("open_app", { name: args[1] })
          .then(() => cb && cb(null, "", ""))
          .catch(e => cb && cb(e, "", ""));
      } else if (cmd === "open") {
        invoke("open_url", { url: args[0] })
          .then(() => cb && cb(null, "", ""))
          .catch(e => cb && cb(e, "", ""));
      } else if (cmd === "osascript") {
        // Reconstruct osascript command: osascript -e '...' -e '...'
        const shellCmd = "osascript " + args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
        invoke("exec_sync", { command: shellCmd })
          .then(out => cb && cb(null, out, ""))
          .catch(e => cb && cb(e, "", ""));
      } else {
        const shellCmd = [cmd, ...args].map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
        invoke("exec_sync", { command: shellCmd })
          .then(out => cb && cb(null, out, ""))
          .catch(e => cb && cb(e, "", ""));
      }
    },

    spawn(program, args, opts) {
      // Translate Node.js spawn opts to Tauri SpawnOpts.
      // Node passes { cwd, env (full replacement), stdio }, but Tauri
      // inherits the parent env and only needs additions + removals.
      const tauriOpts = {};
      if (opts?.cwd) tauriOpts.cwd = opts.cwd;
      // Extract env additions (skip process.env inherited keys — they don't exist here)
      if (opts?.env) {
        const additions = {};
        for (const [k, v] of Object.entries(opts.env)) {
          if (v != null && typeof v === "string") additions[k] = v;
        }
        if (Object.keys(additions).length > 0) tauriOpts.env = additions;
      }
      // env_remove is handled by Rust (CLAUDECODE etc.) — no action needed here
      return adapter.spawn(program, args || [], tauriOpts);
    },
  };

  const tauriUtil = {
    promisify(fn) {
      return (...args) => new Promise((resolve, reject) => {
        fn(...args, (err, result) => err ? reject(err) : resolve(result));
      });
    },
  };

  window.require = function (mod) {
    switch (mod) {
      case "fs": return tauriFs;
      case "path": return pathPolyfill;
      case "child_process": return tauriChildProcess;
      case "os": return tauriOs;
      case "util": return tauriUtil;
      case "worker_threads": throw new Error("worker_threads not available in Tauri");
      default: throw new Error("Unknown module: " + mod);
    }
  };

  // ── process global (used by voice-command widget for env/kill) ──
  if (typeof process === "undefined" || !process.env) {
    window.process = {
      env: {
        HOME: homedir,
        PATH: "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:" + homedir + "/.local/bin",
        SHELL: "/bin/zsh",
        USER: homedir.split("/").pop(),
        TMPDIR: adapter._tmpdir,
      },
      kill(pid, signal) {
        invoke("kill_process", { id: String(pid) }).catch(() => {});
      },
      platform: "darwin",
    };
  }

  // ── Obsidian API polyfills ──
  window.app = {
    vault: {
      adapter: {
        basePath: vaultBasePath,
        async read(path) {
          // Try cache first, then async fetch
          const fullPath = vaultBasePath + "/" + path;
          if (_fileCache.has(fullPath)) return _fileCache.get(fullPath);
          return await adapter.readFileAsync(fullPath);
        },
        async write(path, content) {
          await adapter.writeFile(vaultBasePath + "/" + path, content);
        },
      },
    },
    workspace: {
      openLinkText(path, sourcePath, newLeaf) {
        // Try to open in Obsidian, fall back to default app
        const fullPath = vaultBasePath + "/" + path;
        const vaultName = vaultBasePath.split("/").pop() || "vault";
        invoke("open_url", { url: "obsidian://open?vault=" + encodeURIComponent(vaultName) + "&file=" + encodeURIComponent(path) })
          .catch(() => invoke("exec_sync", { command: "open '" + fullPath.replace(/'/g, "'\\''") + "'" }));
      },
    },
  };

  window.Notice = class Notice {
    constructor(msg) { adapter.showNotice(msg); }
  };

  // ── dv polyfill ──
  // Preload registry via Rust YAML parser (handles complex nested YAML)
  let cachedRegistry = null;
  const registryPath = dashboardDir + "/src/config/Jarvis-Registry.md";
  try {
    cachedRegistry = await invoke("parse_yaml_frontmatter", { path: registryPath });
  } catch (err) {
    console.warn("[bootstrap] Registry preload failed:", err);
  }

  // Override adapter.parseYamlFrontmatter to handle relative paths from loader.js
  adapter.parseYamlFrontmatter = async function(path) {
    if (path.includes("Jarvis-Registry")) return cachedRegistry;
    // Resolve relative paths against dashboard dir
    const fullPath = path.startsWith("/") ? path : (dashboardDir + "/" + path + ".md");
    return await invoke("parse_yaml_frontmatter", { path: fullPath });
  };

  // Pre-cache vault note counts (total + per-folder for Quick Capture)
  let _vaultNoteCount = 0;
  const _folderNoteCounts = {};
  try {
    _vaultNoteCount = await invoke("count_files", { folder: vaultBasePath });
  } catch { /* ignore */ }

  // Pre-cache folder-specific count from config (for Quick Capture badge)
  try {
    const cfgText = _fileCache.get(srcDir + "config/config.json")
      || _fileCache.get(srcDir + "config/config.example.json");
    if (cfgText) {
      const cfg = JSON.parse(cfgText);
      const targetFolder = cfg.widgets?.quickCapture?.targetFolder;
      if (targetFolder) {
        _folderNoteCounts[targetFolder] = await invoke("count_files", {
          folder: vaultBasePath + "/" + targetFolder,
        });
      }
    }
  } catch { /* ignore */ }

  window.dv = {
    current() {
      const rel = dashboardDir.replace(vaultBasePath + "/", "") + "/Jarvis Dashboard.md";
      return { file: { path: rel } };
    },

    page(path) {
      if (path.includes("Jarvis-Registry")) return cachedRegistry;
      // Try reading and parsing frontmatter from cache
      const fullPath = vaultBasePath + "/" + path + ".md";
      const content = _fileCache.get(fullPath);
      if (!content) return null;
      if (!content.startsWith("---")) return {};
      const end = content.indexOf("---", 3);
      if (end === -1) return {};
      return {};
    },

    pages(query) {
      // Parse Dataview query to extract folder name (e.g. '"Inbox"')
      let count = _vaultNoteCount;
      if (query) {
        const folderMatch = query.match(/^"([^"]+)"$/);
        if (folderMatch && _folderNoteCounts[folderMatch[1]] !== undefined) {
          count = _folderNoteCounts[folderMatch[1]];
        }
      }
      return {
        length: count,
        where: () => window.dv.pages(query),
        sort: () => ({ slice: () => [], length: 0 }),
        filter: () => [],
        map: () => [],
      };
    },
  };

  // ── 5. Load dashboard ──
  const container = document.getElementById("dashboard");
  document.getElementById("loading").classList.add("hidden");

  const { ctx: dashCtx } = await window.loadDashboard(adapter, {
    mode: "full",
    container,
    srcBase: srcDir,
    widgetFilter: (type) => type !== "recent-activity",
  });

  // ── 5b. Patch voiceService: native ffmpeg+whisper transcription ──
  // WKWebView's AudioContext.decodeAudioData can't decode MediaRecorder mp4/aac output.
  // Fix: capture raw audio via patched MediaRecorder, send to Rust (ffmpeg→wav→whisper).
  if (dashCtx.voiceService && dashCtx.voiceService.isAvailable) {
    const vs = dashCtx.voiceService;

    // Resolve whisper config (mirrors voice-service.js logic)
    const voiceCfg = dashCtx.config.widgets?.quickCapture?.voice || {};
    const langCfg = dashCtx.config.language || {};
    const sttMode = langCfg.stt || voiceCfg.lang || "en";
    let wPath = voiceCfg.whisperPath || null;
    if (!wPath) {
      for (const p of ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli"]) {
        if (tauriFs.existsSync(p)) { wPath = p; break; }
      }
    }
    const wModel = voiceCfg.whisperModel || dashCtx.config.companion?.whisperModel
      || "/opt/homebrew/share/whisper-cpp/ggml-base.bin";
    const wLang = sttMode === "auto" ? "auto" : sttMode;

    // Intercept MediaRecorder to capture raw audio chunks + keep a reference
    let capturedChunks = [];
    let currentRecorder = null;
    const OrigMediaRecorder = window.MediaRecorder;
    window.MediaRecorder = class extends OrigMediaRecorder {
      constructor(stream, options) {
        super(stream, options);
        capturedChunks = [];
        currentRecorder = this;
        this.addEventListener("dataavailable", (e) => {
          if (e.data.size > 0) capturedChunks.push(e.data);
        });
      }
    };
    // Preserve static methods
    window.MediaRecorder.isTypeSupported = OrigMediaRecorder.isTypeSupported;

    // Replace stopAndTranscribe: manually stop the recorder, wait for data,
    // then cancel the original (resets internal state) and use Rust pipeline.
    vs.stopAndTranscribe = async function () {
      if (vs.getState() !== "recording") {
        return { text: "", detectedLang: null };
      }

      // Manually stop the recorder and wait for dataavailable to fire
      if (currentRecorder && currentRecorder.state !== "inactive") {
        await new Promise(resolve => {
          currentRecorder.addEventListener("stop", resolve, { once: true });
          currentRecorder.stop();
        });
      }

      // Now capturedChunks has the recorded data
      const chunks = capturedChunks.slice();
      capturedChunks = [];
      currentRecorder = null;

      // cancelRecording cleans up stream and resets voice service state to idle
      vs.cancelRecording();

      if (chunks.length === 0) {
        return { text: "", detectedLang: null };
      }

      // Send raw audio to Rust for ffmpeg conversion + whisper transcription
      const blob = new Blob(chunks);
      const arrayBuf = await blob.arrayBuffer();
      const audioData = Array.from(new Uint8Array(arrayBuf));

      const resultJson = await invoke("transcribe_audio", {
        audioData,
        whisperPath: wPath,
        whisperModel: wModel,
        language: wLang,
      });

      const parsed = JSON.parse(resultJson);
      return { text: parsed.text || "", detectedLang: parsed.detectedLang || null };
    };

    console.log("[bootstrap] Voice transcription patched: ffmpeg+whisper native pipeline");
  }

  // ── 6. Background cache refresh ──
  // Refresh session stats every 5 seconds (mtime-based — only re-reads changed files)
  let _refreshRunning = false;
  setInterval(async () => {
    if (_refreshRunning) return; // skip if previous refresh still running
    _refreshRunning = true;
    try {
      await refreshSessionCache(false);
    } catch (e) {
      console.warn("[bg-refresh] session cache error:", e);
    }
    _refreshRunning = false;
  }, 5000);

  // Listen for vault path change from menu — use Tauri folder picker dialog
  if (window.__TAURI__.event) {
    window.__TAURI__.event.listen("menu-change-vault", async () => {
      try {
        const { open } = window.__TAURI__.dialog;
        const selected = await open({
          directory: true,
          defaultPath: vaultBasePath,
          title: "Select Obsidian Vault",
        });
        if (selected) {
          localStorage.setItem("jarvis_vault_path", selected);
          localStorage.removeItem("jarvis_dashboard_dir");
          location.reload();
        }
      } catch (e) {
        // Fallback to prompt if dialog plugin not available
        const selected = prompt("Enter vault path:", vaultBasePath);
        if (selected) {
          localStorage.setItem("jarvis_vault_path", selected);
          localStorage.removeItem("jarvis_dashboard_dir");
          location.reload();
        }
      }
    });
  }
};
