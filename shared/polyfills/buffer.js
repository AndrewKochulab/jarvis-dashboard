/**
 * Minimal Buffer polyfill — only the two methods used by voice-service.js:
 *   Buffer.alloc(size)  → zero-filled Uint8Array
 *   Buffer.from(ab)     → Uint8Array wrapping an ArrayBuffer
 */
const BufferPolyfill = {
  alloc(size) {
    return new Uint8Array(size);
  },
  from(source) {
    if (source instanceof ArrayBuffer) return new Uint8Array(source);
    if (ArrayBuffer.isView(source)) return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    if (typeof source === "string") return new TextEncoder().encode(source);
    return new Uint8Array(source);
  },
};

if (typeof module !== "undefined") module.exports = BufferPolyfill;
else if (typeof window !== "undefined") window.Buffer = BufferPolyfill;
