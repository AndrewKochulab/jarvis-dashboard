/**
 * Minimal POSIX path module — pure JS, no dependencies.
 * Covers every method used by src/ modules.
 */
const path = {
  sep: "/",

  join(...parts) {
    return parts
      .filter(Boolean)
      .join("/")
      .replace(/\/+/g, "/");
  },

  resolve(...parts) {
    let resolved = "";
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (!p) continue;
      resolved = resolved ? p + "/" + resolved : p;
      if (p.charAt(0) === "/") break;
    }
    // Normalize: collapse /../ and /./
    const segments = resolved.split("/");
    const out = [];
    for (const seg of segments) {
      if (seg === "..") { out.pop(); }
      else if (seg !== "." && seg !== "") { out.push(seg); }
    }
    return (resolved.charAt(0) === "/" ? "/" : "") + out.join("/");
  },

  dirname(p) {
    if (!p) return ".";
    const i = p.lastIndexOf("/");
    if (i <= 0) return i === 0 ? "/" : ".";
    return p.slice(0, i);
  },

  basename(p, ext) {
    let base = p.slice(p.lastIndexOf("/") + 1);
    if (ext && base.endsWith(ext)) base = base.slice(0, -ext.length);
    return base;
  },

  extname(p) {
    const base = path.basename(p);
    const dot = base.lastIndexOf(".");
    return dot <= 0 ? "" : base.slice(dot);
  },
};

if (typeof module !== "undefined") module.exports = path;
else if (typeof window !== "undefined") window.__pathPolyfill = path;
