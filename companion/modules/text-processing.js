// JARVIS Companion — TTS Text Processing
// Pure functions for markdown stripping and sentence extraction.

function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`[^`]+`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSentences(buffer) {
  const sentences = [];
  const pattern = /[.!?]\s+|\n\n/;
  let buf = buffer;
  let idx;
  while ((idx = buf.search(pattern)) !== -1) {
    sentences.push(buf.slice(0, idx + 1).trim());
    buf = buf.slice(idx + 1);
  }
  return { sentences, remainder: buf };
}

module.exports = { stripMarkdown, extractSentences };
