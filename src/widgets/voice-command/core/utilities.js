// Voice Command — Shared utilities
// Pure functions, no dependencies.

function stripAnsi(str) {
  return str.replace(
    /[\x1B\x9B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g,
    ""
  );
}

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
  const sentenceEnd = /^([\s\S]*?[.!?])(\s+|\n\n)/;
  const sentences = [];
  let remaining = buffer;
  let match;
  while ((match = sentenceEnd.exec(remaining)) !== null) {
    const sentence = match[1].trim();
    if (sentence) sentences.push(sentence);
    remaining = remaining.slice(match[0].length);
  }
  return { sentences, remaining };
}

function generateId() {
  return "js-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

return { stripAnsi, stripMarkdown, extractSentences, generateId };
