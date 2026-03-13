/**
 * Platform Adapter — Abstract interface definition.
 *
 * Each platform (Obsidian, Tauri, iOS/WKWebView) provides a concrete
 * implementation of this interface.  The shared loader.js uses only
 * these methods so that src/ modules run identically everywhere.
 *
 * Methods marked "(desktop only)" may throw on mobile — the mobile
 * loader never calls them.
 *
 * @typedef {Object} PlatformAdapter
 *
 * ── File System (desktop only) ──────────────────────────────
 * @property {(path: string) => string}                  readFile
 * @property {(path: string, content: string) => void}   writeFile
 * @property {(path: string) => {mtimeMs:number,size:number,isDirectory:boolean}} stat
 * @property {(path: string) => string[]}                readdir
 * @property {(path: string) => boolean}                 exists
 * @property {(path: string, recursive?: boolean) => void} mkdir
 *
 * ── Process (desktop only) ──────────────────────────────────
 * @property {(prog:string, args:string[], opts?:object) => ChildProcessLike} spawn
 * @property {(command: string) => string}               exec
 * @property {(pid: number) => void}                     kill
 *
 * ── OS ──────────────────────────────────────────────────────
 * @property {() => string}  homedir
 * @property {() => string}  tmpdir
 *
 * ── Vault ───────────────────────────────────────────────────
 * @property {() => string}  vaultBasePath
 * @property {(path: string) => void}  openNote
 * @property {(folder:string, count:number) => Array}  queryRecentFiles
 * @property {(folder: string) => number}              countFiles
 * @property {(path: string) => object}                parseYamlFrontmatter
 *
 * ── UI ──────────────────────────────────────────────────────
 * @property {(message:string, duration?:number) => void}  showNotice
 *
 * ── Platform info ───────────────────────────────────────────
 * @property {"obsidian"|"tauri"|"ios"}  platform
 */

// Intentionally no class — each adapter is a plain object.
// This file exists only for documentation and type-checking reference.
