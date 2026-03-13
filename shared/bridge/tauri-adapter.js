/**
 * Tauri Adapter — maps PlatformAdapter to Tauri invoke() commands.
 *
 * Used by macos.  All file/process/OS operations delegate to
 * Rust commands registered in src-tauri/src/main.rs.
 *
 * Sync shims (readFileSync etc.) use a pre-loaded cache populated at
 * startup by macos-bootstrap.js.  Cache misses fall through to async
 * invoke() wrapped in a synchronous-looking helper (only safe during
 * init when the event loop is available).
 */
(function () {
  const { invoke } = window.__TAURI__.core;

  // ── File cache (populated by bootstrap before modules load) ──
  const _fileCache = new Map();

  const adapter = {
    platform: "tauri",

    // ── Pre-load cache ──
    _fileCache,

    async preloadFiles(paths) {
      const results = await invoke("batch_read_files", { paths });
      for (const [path, content] of Object.entries(results)) {
        _fileCache.set(path, content);
      }
    },

    // ── File System ──
    readFile(path) {
      // Sync path: return from cache
      if (_fileCache.has(path)) return _fileCache.get(path);
      // Async fallback — should not normally be hit after preload
      console.warn("[tauri-adapter] Cache miss for:", path);
      return null;
    },

    async readFileAsync(path) {
      if (_fileCache.has(path)) return _fileCache.get(path);
      const content = await invoke("read_file", { path });
      _fileCache.set(path, content);
      return content;
    },

    async writeFile(path, content) {
      await invoke("write_file", { path, content });
      _fileCache.set(path, content);
    },

    async stat(path) {
      return await invoke("stat_file", { path });
    },

    async readdir(path) {
      return await invoke("readdir", { path });
    },

    async exists(path) {
      return await invoke("exists", { path });
    },

    async mkdir(path, recursive = false) {
      await invoke("mkdir", { path, recursive });
    },

    // ── Process ──
    spawn(program, args, opts) {
      // Returns a Node.js ChildProcess-like object.
      // Tauri streams stdout/stderr via events.
      const id = crypto.randomUUID();
      const listeners = { stdout: [], stderr: [], close: [], error: [] };

      // Track when spawn completes so stdin.write waits for the process to be ready
      let _spawnResolve;
      const _spawnReady = new Promise(r => { _spawnResolve = r; });

      const child = {
        pid: null,
        _id: id,
        // Process-level events: close, error
        on(event, cb) { (listeners[event] || []).push(cb); return child; },
        kill() { invoke("kill_process", { id }).catch(() => {}); },
        // Node.js ChildProcess has stdout/stderr as stream-like objects
        stdout: {
          on(event, cb) {
            if (event === "data") listeners.stdout.push(cb);
            return child.stdout;
          },
        },
        stderr: {
          on(event, cb) {
            if (event === "data") listeners.stderr.push(cb);
            return child.stderr;
          },
        },
        stdin: {
          writable: true,
          write(data) {
            // Wait for spawn to complete before writing to stdin
            _spawnReady.then(() => {
              invoke("stdin_write", { id, data }).catch(e => {
                console.error("[tauri-adapter] stdin_write error:", e);
              });
            });
          },
          end() {
            child.stdin.writable = false;
            _spawnReady.then(() => {
              invoke("stdin_close", { id }).catch(e => {
                console.error("[tauri-adapter] stdin_close error:", e);
              });
            });
          },
        },
      };

      // Start process — wait for any pending binary file write first (e.g. WAV before whisper)
      const doSpawn = () => invoke("spawn_process", { id, program, args, opts: opts || {} })
        .then(pid => {
          child.pid = pid;
          _spawnResolve(); // Signal spawn complete — stdin writes can proceed
        })
        .catch(err => {
          console.error("[tauri-adapter] spawn failed:", program, err);
          _spawnResolve(); // Unblock pending writes even on error
          listeners.error.forEach(cb => cb(err));
        });

      if (window.__pendingBinaryWrite) {
        const pending = window.__pendingBinaryWrite;
        window.__pendingBinaryWrite = null;
        pending.then(doSpawn, doSpawn); // spawn even if write failed
      } else {
        doSpawn();
      }

      // Listen for Tauri events from the Rust side
      const unlisten = [];
      if (window.__TAURI__.event) {
        const { listen } = window.__TAURI__.event;
        listen(`process-stdout-${id}`, e => listeners.stdout.forEach(cb => cb(e.payload)))
          .then(u => unlisten.push(u));
        listen(`process-stderr-${id}`, e => listeners.stderr.forEach(cb => cb(e.payload)))
          .then(u => unlisten.push(u));
        listen(`process-close-${id}`, e => {
          child.stdin.writable = false;
          listeners.close.forEach(cb => cb(e.payload));
          unlisten.forEach(u => u());
        }).then(u => unlisten.push(u));
      }

      return child;
    },

    async exec(command) {
      return await invoke("exec_sync", { command });
    },

    async kill(pid) {
      await invoke("kill_process", { id: String(pid) });
    },

    // ── OS ──
    homedir() {
      return adapter._homedir || "/Users/unknown";
    },

    tmpdir() {
      return adapter._tmpdir || "/tmp";
    },

    // ── Vault ──
    vaultBasePath() {
      return adapter._vaultBasePath || "";
    },

    openNote(path) {
      const vaultName = (adapter._vaultBasePath || "").split("/").pop() || "vault";
      invoke("open_url", { url: `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path)}` })
        .catch(() => {});
    },

    async queryRecentFiles(folder, count) {
      return await invoke("get_recent_files", { root: folder, count });
    },

    async countFiles(folder) {
      return await invoke("count_files", { folder });
    },

    async parseYamlFrontmatter(path) {
      return await invoke("parse_yaml_frontmatter", { path });
    },

    // ── UI ──
    showNotice(message, duration = 3000) {
      // Use a toast notification
      const toast = document.createElement("div");
      toast.textContent = message;
      Object.assign(toast.style, {
        position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
        background: "#1a1a2e", color: "#e0e6ed", padding: "10px 20px",
        borderRadius: "8px", border: "1px solid rgba(0,212,255,0.3)",
        fontSize: "13px", zIndex: "10000", opacity: "0",
        transition: "opacity 0.3s",
      });
      document.body.appendChild(toast);
      requestAnimationFrame(() => { toast.style.opacity = "1"; });
      setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },
  };

  window.__tauriAdapter = adapter;
})();
