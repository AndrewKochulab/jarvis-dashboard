// Markdown renderer with syntax-highlighted code blocks
// Returns: { renderMarkdown, createStreamRenderer }

const { el, T, config } = ctx;
const termCfg = config.widgets?.voiceCommand?.terminal || {};
const hlEnabled = termCfg.codeHighlighting?.enabled !== false;

// ═══════════════════════════════════════════
// ── Color palette (maps to JARVIS theme) ──
// ═══════════════════════════════════════════

const C = {
  keyword:     T.purple,       // #7c6bff
  string:      T.green,        // #44c98f
  number:      T.gold,         // #f6d365
  comment:     T.textMuted,    // #6b7b8d
  function:    T.accent,       // #00d4ff
  type:        T.orange,       // #ff6b35
  builtin:     T.accent + "cc",
  operator:    T.text + "b3",
  punctuation: T.textMuted,
  tag:         T.red,          // HTML tags
  attribute:   T.gold,         // HTML attributes
  property:    T.accent,       // CSS/JSON properties
  plain:       T.text,
};

// ═══════════════════════════════════════════
// ── Language tokenizer definitions ──
// ═══════════════════════════════════════════

// Each language: array of [regex, tokenType]. Order matters — first match wins.
// Regexes must be sticky-safe (no global flag), matched from current position.

const LANGS = {};

// ── Shared patterns ──
const NUMBER = /(?:0[xXoObB][\da-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)/;
const DOUBLE_STRING = /"(?:[^"\\]|\\.)*"/;
const SINGLE_STRING = /'(?:[^'\\]|\\.)*'/;
const TEMPLATE_STRING = /`(?:[^`\\]|\\.)*`/;
const LINE_COMMENT = /\/\/[^\n]*/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//;
const HASH_COMMENT = /#[^\n]*/;

function langDef(keywords, extras) {
  const kw = keywords.split(" ");
  const kwPattern = new RegExp("\\b(?:" + kw.join("|") + ")\\b");
  const rules = [
    [BLOCK_COMMENT, "comment"],
    [LINE_COMMENT, "comment"],
    [DOUBLE_STRING, "string"],
    [SINGLE_STRING, "string"],
    [TEMPLATE_STRING, "string"],
    [NUMBER, "number"],
    [kwPattern, "keyword"],
    [/\b[A-Z]\w*\b/, "type"],
    [/\b\w+(?=\s*\()/, "function"],
    ...(extras || []),
    [/[{}()\[\];,.]/, "punctuation"],
    [/[+\-*/%=!<>&|^~?:]+|->|=>/, "operator"],
  ];
  return rules;
}

// ── Swift ──
LANGS.swift = langDef(
  "import let var func class struct enum protocol extension return if else guard switch case default for in while repeat break continue throw throws try catch defer async await do where typealias associatedtype public private internal fileprivate open static override final mutating nonmutating lazy weak unowned convenience required init deinit subscript willSet didSet get set some any true false nil self Self super",
  [
    [/"""[\s\S]*?"""/, "string"],  // multiline strings
    [/@\w+/, "keyword"],            // attributes (@State, @Published, etc.)
    [/#\w+/, "keyword"],            // macros (#if, #available, etc.)
  ]
);

// ── JavaScript / TypeScript ──
const jsRules = langDef(
  "import export default from as const let var function return if else for while do switch case break continue throw try catch finally new delete typeof instanceof in of class extends super this void yield async await true false null undefined static get set",
  [
    [TEMPLATE_STRING, "string"],
    [/\/(?![/*])(?:[^/\\]|\\.)+\/[gimsuy]*/, "string"], // regex literals
  ]
);
LANGS.javascript = jsRules;
LANGS.js = jsRules;
LANGS.jsx = jsRules;
LANGS.typescript = jsRules;
LANGS.ts = jsRules;
LANGS.tsx = jsRules;

// ── Python ──
LANGS.python = [
  [HASH_COMMENT, "comment"],
  [/"""[\s\S]*?"""/, "string"],
  [/'''[\s\S]*?'''/, "string"],
  [/f"(?:[^"\\]|\\.)*"/, "string"],
  [/f'(?:[^'\\]|\\.)*'/, "string"],
  [DOUBLE_STRING, "string"],
  [SINGLE_STRING, "string"],
  [NUMBER, "number"],
  [/\b(?:import|from|as|def|return|if|elif|else|for|while|break|continue|pass|raise|try|except|finally|with|class|lambda|yield|async|await|and|or|not|is|in|True|False|None|del|global|nonlocal|assert)\b/, "keyword"],
  [/@\w+/, "keyword"],  // decorators
  [/\b(?:print|len|range|type|int|str|float|list|dict|set|tuple|bool|super|isinstance|hasattr|getattr|setattr|enumerate|zip|map|filter|sorted|reversed|open|input)\b/, "builtin"],
  [/\b[A-Z]\w*\b/, "type"],
  [/\b\w+(?=\s*\()/, "function"],
  [/[{}()\[\];,.:@]/, "punctuation"],
  [/[+\-*/%=!<>&|^~]+|->|=>/, "operator"],
];
LANGS.py = LANGS.python;

// ── HTML ──
LANGS.html = [
  [/<!--[\s\S]*?-->/, "comment"],
  [/<\/?[\w-]+/, "tag"],
  [/\/>|>/, "tag"],
  [/\b[\w-]+(?==)/, "attribute"],
  [DOUBLE_STRING, "string"],
  [SINGLE_STRING, "string"],
  [/&\w+;/, "keyword"],
];
LANGS.xml = LANGS.html;

// ── CSS ──
LANGS.css = [
  [BLOCK_COMMENT, "comment"],
  [DOUBLE_STRING, "string"],
  [SINGLE_STRING, "string"],
  [NUMBER, "number"],
  [/[.#][\w-]+/, "function"],     // selectors
  [/@[\w-]+/, "keyword"],         // at-rules
  [/[\w-]+(?=\s*:)/, "property"], // properties
  [/!important/, "keyword"],
  [/[{}();,:]/, "punctuation"],
];
LANGS.scss = LANGS.css;

// ── Bash / Shell ──
LANGS.bash = [
  [HASH_COMMENT, "comment"],
  [DOUBLE_STRING, "string"],
  [SINGLE_STRING, "string"],
  [/\$\{[^}]*\}/, "keyword"],    // variable expansion
  [/\$\w+/, "keyword"],          // variables
  [NUMBER, "number"],
  [/\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|local|export|source|alias|unalias|echo|printf|cd|ls|rm|mv|cp|mkdir|cat|grep|sed|awk|find|xargs|sudo|chmod|chown|curl|wget|git|npm|npx|yarn|pip|brew|apt|docker|ssh|scp|kill|ps|exit|read|shift|set|unset|eval|exec|trap|test|true|false)\b/, "keyword"],
  [/\b\w+(?=\s*\()/, "function"],
  [/[{}()\[\];|&]/, "punctuation"],
  [/[<>=!|&]+|;;/, "operator"],
];
LANGS.sh = LANGS.bash;
LANGS.shell = LANGS.bash;
LANGS.zsh = LANGS.bash;

// ── JSON ──
LANGS.json = [
  [DOUBLE_STRING, "string"],
  [NUMBER, "number"],
  [/\b(?:true|false|null)\b/, "keyword"],
  [/[{}()\[\],:]/, "punctuation"],
];

// ── YAML ──
LANGS.yaml = [
  [HASH_COMMENT, "comment"],
  [DOUBLE_STRING, "string"],
  [SINGLE_STRING, "string"],
  [NUMBER, "number"],
  [/\b(?:true|false|null|yes|no)\b/, "keyword"],
  [/[\w.-]+(?=\s*:)/, "property"],
  [/[:\[\]{},|>-]/, "punctuation"],
];
LANGS.yml = LANGS.yaml;

// ── SQL ──
LANGS.sql = [
  [/--[^\n]*/, "comment"],
  [BLOCK_COMMENT, "comment"],
  [SINGLE_STRING, "string"],
  [DOUBLE_STRING, "string"],
  [NUMBER, "number"],
  [/\b(?:SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INTO|VALUES|SET|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|IN|IS|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|COUNT|SUM|AVG|MIN|MAX|BETWEEN|LIKE|EXISTS|CASE|WHEN|THEN|ELSE|END|INDEX|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|DEFAULT|CHECK|UNIQUE|VIEW|TRIGGER|PROCEDURE|FUNCTION|BEGIN|COMMIT|ROLLBACK|GRANT|REVOKE)\b/i, "keyword"],
  [/\b\w+(?=\s*\()/, "function"],
  [/[();,.*=<>!]/, "punctuation"],
];

// ── Go ──
LANGS.go = langDef(
  "package import func return if else for range switch case default break continue go defer chan map struct interface type const var true false nil",
  [
    [TEMPLATE_STRING, "string"],
    [/\b(?:fmt|log|os|io|net|http|json|strings|strconv|errors|context|sync|time)\b/, "builtin"],
  ]
);
LANGS.golang = LANGS.go;

// ── Rust ──
LANGS.rust = langDef(
  "fn let mut const static struct enum impl trait pub use mod crate self super return if else for while loop match break continue move async await unsafe where type as in ref true false",
  [
    [/\b(?:i8|i16|i32|i64|i128|u8|u16|u32|u64|u128|f32|f64|bool|char|str|String|Vec|Box|Option|Result|Some|None|Ok|Err|Self)\b/, "type"],
    [/\b(?:println!|print!|format!|vec!|todo!|unimplemented!|panic!|assert!|assert_eq!|dbg!)\b/, "builtin"],
    [/'[a-z]\w*/, "keyword"], // lifetimes
  ]
);
LANGS.rs = LANGS.rust;

// ── Ruby ──
LANGS.ruby = [
  [HASH_COMMENT, "comment"],
  [/=begin[\s\S]*?=end/, "comment"],
  [DOUBLE_STRING, "string"],
  [SINGLE_STRING, "string"],
  [/\/(?:[^/\\]|\\.)+\/[imx]*/, "string"],
  [/:[\w?!]+/, "string"], // symbols
  [NUMBER, "number"],
  [/\b(?:def|end|class|module|if|elsif|else|unless|for|while|until|do|begin|rescue|ensure|raise|return|yield|block_given\?|require|include|extend|attr_accessor|attr_reader|attr_writer|self|super|true|false|nil|and|or|not|in|then|case|when|lambda|proc)\b/, "keyword"],
  [/@\w+/, "keyword"],  // instance variables
  [/\b[A-Z]\w*\b/, "type"],
  [/\b\w+[?!]?(?=\s*[({])/, "function"],
  [/[{}()\[\];,.|&]/, "punctuation"],
  [/[+\-*/%=!<>&|^~]+|->|=>/, "operator"],
];
LANGS.rb = LANGS.ruby;

// ── Kotlin ──
LANGS.kotlin = langDef(
  "package import class interface object fun val var return if else when for while do break continue throw try catch finally is in as by companion init open abstract override sealed data inner enum typealias constructor suspend inline crossinline noinline reified out vararg get set true false null this super",
  [
    [/"""[\s\S]*?"""/, "string"],
    [/@\w+/, "keyword"],  // annotations
  ]
);
LANGS.kt = LANGS.kotlin;

// ── Objective-C ──
LANGS.objc = langDef(
  "import include define if else endif ifdef ifndef return for while do switch case break continue default typedef struct enum union static extern const void int char float double long short unsigned signed id self super nil YES NO true false strong weak nonatomic atomic assign copy retain readonly readwrite class",
  [
    [/@"(?:[^"\\]|\\.)*"/, "string"],  // @"NSString"
    [/@\w+/, "keyword"],               // @interface, @implementation, etc.
    [/\b(?:NS|UI|CG|CA|MK|AV|CL)\w+\b/, "type"],
  ]
);
LANGS.objectivec = LANGS.objc;
LANGS["objective-c"] = LANGS.objc;
LANGS.m = LANGS.objc;

// ── C / C++ (basic) ──
LANGS.c = langDef(
  "auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while",
  [
    [/#\s*\w+[^\n]*/, "keyword"],  // preprocessor directives
    [/\b(?:NULL|EOF|stdin|stdout|stderr|size_t|ptrdiff_t|uint\d+_t|int\d+_t)\b/, "type"],
  ]
);
LANGS.cpp = langDef(
  "auto break case char class const constexpr continue default delete do double else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator override private protected public register return short signed sizeof static static_cast dynamic_cast const_cast reinterpret_cast struct switch template this throw true try typedef typeid typename union unsigned using virtual void volatile while",
  [
    [/#\s*\w+[^\n]*/, "keyword"],
    [/\b(?:std|string|vector|map|set|pair|shared_ptr|unique_ptr|make_shared|make_unique|cout|cin|endl|nullptr_t|size_t)\b/, "type"],
    [TEMPLATE_STRING, "string"],
  ]
);
LANGS["c++"] = LANGS.cpp;

// ── Markdown (basic — headers, bold, italic, links) ──
LANGS.markdown = [
  [/^#{1,6}\s+[^\n]*/, "keyword"],
  [/\*\*[^*]+\*\*/, "keyword"],
  [/__[^_]+__/, "keyword"],
  [/\*[^*]+\*/, "string"],
  [/_[^_]+_/, "string"],
  [/\[[^\]]+\]\([^)]+\)/, "function"],
  [/`[^`]+`/, "string"],
  [/^[-*+]\s/m, "punctuation"],
  [/^\d+\.\s/m, "punctuation"],
  [/^>\s/m, "comment"],
];
LANGS.md = LANGS.markdown;

// ── Diff ──
LANGS.diff = [
  [/^\+[^\n]*/m, "string"],     // added lines (green)
  [/^-[^\n]*/m, "tag"],         // removed lines (red)
  [/^@@[^\n]*/m, "keyword"],    // hunk headers
  [/^(?:diff|index|---|\+\+\+)[^\n]*/m, "comment"],
];
LANGS.patch = LANGS.diff;


// ═══════════════════════════════════════════
// ── Tokenizer ──
// ═══════════════════════════════════════════

function tokenize(code, lang) {
  const rules = LANGS[lang];
  if (!rules) return [{ text: code, type: "plain" }];

  const tokens = [];
  let pos = 0;
  const len = code.length;

  while (pos < len) {
    let best = null;
    let bestType = null;

    for (const [pattern, type] of rules) {
      pattern.lastIndex = 0;
      const src = code.slice(pos);
      const m = src.match(pattern);
      if (m && m.index === 0 && m[0].length > 0) {
        if (!best || m[0].length > best.length) {
          best = m[0];
          bestType = type;
        }
      }
    }

    if (best) {
      tokens.push({ text: best, type: bestType });
      pos += best.length;
    } else {
      // Consume one character as plain
      const nextSpecial = code.slice(pos + 1).search(/[/"'`#\-@$:.A-Z0-9\\{([\]};,+\-*%=!<>&|^~?]/i);
      const end = nextSpecial === -1 ? len : pos + 1 + nextSpecial;
      tokens.push({ text: code.slice(pos, end), type: "plain" });
      pos = end;
    }
  }

  return tokens;
}


// ═══════════════════════════════════════════
// ── DOM builders ──
// ═══════════════════════════════════════════

function buildTokenSpan(token) {
  const span = document.createElement("span");
  span.textContent = token.text;
  span.style.color = C[token.type] || C.plain;
  return span;
}

function buildHighlightedCode(code, lang) {
  const codeEl = document.createElement("code");
  codeEl.style.fontFamily = "inherit";
  codeEl.style.display = "block";

  if (!hlEnabled || !lang) {
    codeEl.textContent = code;
    codeEl.style.color = C.plain;
    return codeEl;
  }

  const tokens = tokenize(code, lang.toLowerCase());
  for (const token of tokens) {
    codeEl.appendChild(buildTokenSpan(token));
  }
  return codeEl;
}

function buildCodeBlock(code, lang) {
  const wrapper = document.createElement("div");
  wrapper.className = "jarvis-code-block";
  // Inline styles (CSS classes unreliable in Tauri WKWebView)
  wrapper.style.cssText = "margin:8px 0;border-radius:8px;border:1px solid rgba(0,212,255,0.12);overflow:hidden;background:#080c14;";

  // Header with language + copy
  const header = document.createElement("div");
  header.className = "jarvis-code-header";
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:4px 12px;background:rgba(0,212,255,0.05);border-bottom:1px solid rgba(0,212,255,0.08);font-size:10px;letter-spacing:1px;text-transform:uppercase;";

  const langLabel = document.createElement("span");
  langLabel.textContent = lang || "code";
  langLabel.style.color = T.textMuted;
  header.appendChild(langLabel);

  const copyBtn = document.createElement("span");
  copyBtn.className = "jarvis-code-copy";
  copyBtn.textContent = "copy";
  copyBtn.style.cssText = "cursor:pointer;opacity:0.4;transition:opacity 0.2s;user-select:none;color:" + T.textMuted + ";";
  copyBtn.addEventListener("mouseenter", () => { copyBtn.style.opacity = "1"; });
  copyBtn.addEventListener("mouseleave", () => { copyBtn.style.opacity = "0.4"; });
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code).then(() => {
      copyBtn.textContent = "\u2713";
      copyBtn.style.color = T.green;
      setTimeout(() => { copyBtn.textContent = "copy"; copyBtn.style.color = T.textMuted; }, 1200);
    });
  });
  header.appendChild(copyBtn);
  wrapper.appendChild(header);

  // Code area
  const pre = document.createElement("pre");
  pre.className = "jarvis-code-pre";
  pre.style.cssText = "margin:0;padding:12px 16px;overflow-x:auto;font-size:inherit;font-family:inherit;line-height:1.5;white-space:pre;word-break:normal;background:transparent;";
  pre.appendChild(buildHighlightedCode(code, lang));
  wrapper.appendChild(pre);

  return wrapper;
}

function buildInlineCode(text) {
  const code = document.createElement("code");
  code.textContent = text;
  code.style.cssText = `
    background: ${T.accent}12;
    border: 1px solid ${T.accent}22;
    border-radius: 4px;
    padding: 1px 6px;
    font-family: inherit;
    font-size: 0.92em;
    color: ${T.accent};
  `;
  return code;
}

function buildPlainTextNode(text) {
  const div = document.createElement("div");
  div.style.whiteSpace = "pre-wrap";
  div.style.display = "block";

  // Process inline code within plain text
  const parts = text.split(/(`[^`\n]+`)/g);
  for (const part of parts) {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      div.appendChild(buildInlineCode(part.slice(1, -1)));
    } else if (part) {
      div.appendChild(document.createTextNode(part));
    }
  }
  return div;
}


// ═══════════════════════════════════════════
// ── renderMarkdown (full text, history) ──
// ═══════════════════════════════════════════

function renderMarkdown(text) {
  const fragment = document.createDocumentFragment();
  if (!text) return fragment;

  // Split on fenced code blocks: ```lang\n...\n```
  const codeBlockRegex = /^```(\w*)\n([\s\S]*?)^```\s*$/gm;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Plain text before this code block
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      fragment.appendChild(buildPlainTextNode(before));
    }

    // The code block itself
    const lang = match[1] || "";
    const code = match[2].replace(/\n$/, ""); // trim trailing newline
    fragment.appendChild(buildCodeBlock(code, lang));

    lastIndex = codeBlockRegex.lastIndex;
  }

  // Remaining text after last code block
  const remaining = text.slice(lastIndex);
  if (remaining.trim()) {
    fragment.appendChild(buildPlainTextNode(remaining));
  }

  return fragment;
}


// ═══════════════════════════════════════════
// ── StreamRenderer (streaming text deltas) ──
// ═══════════════════════════════════════════

function createStreamRenderer(container) {
  // State
  let state = "NORMAL";  // "NORMAL" | "IN_CODE_BLOCK"
  let buffer = "";       // full accumulated text
  let pendingText = "";  // text not yet rendered
  let codeLang = "";
  let codeBuffer = "";
  let codeBlockEl = null;   // live code block DOM element
  let codeContentEl = null; // <code> element inside the block
  let currentTextWrap = null; // current text wrap div for plain text
  const allTextNodes = [];

  function flushPlainText(text) {
    if (!text) return;
    // Process line by line to handle inline code
    const parts = text.split(/(`[^`\n]+`)/g);
    for (const part of parts) {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        // Inline code — needs its own span, breaks text wrap
        const inlineEl = buildInlineCode(part.slice(1, -1));
        if (!currentTextWrap) {
          currentTextWrap = el("div", { display: "block", whiteSpace: "pre-wrap" });
          currentTextWrap.dataset.textWrap = "true";
          container.appendChild(currentTextWrap);
        }
        currentTextWrap.appendChild(inlineEl);
      } else if (part) {
        const node = document.createTextNode(part);
        if (!currentTextWrap) {
          currentTextWrap = el("div", { display: "block", whiteSpace: "pre-wrap" });
          currentTextWrap.dataset.textWrap = "true";
          container.appendChild(currentTextWrap);
        }
        currentTextWrap.appendChild(node);
        allTextNodes.push(node);
      }
    }
  }

  function startCodeBlock(lang) {
    currentTextWrap = null; // break text flow
    codeLang = lang;
    codeBuffer = "";

    // Create live code block DOM (inline styles for Tauri WKWebView compatibility)
    codeBlockEl = document.createElement("div");
    codeBlockEl.className = "jarvis-code-block";
    codeBlockEl.style.cssText = "margin:8px 0;border-radius:8px;border:1px solid rgba(0,212,255,0.12);overflow:hidden;background:#080c14;";

    const header = document.createElement("div");
    header.className = "jarvis-code-header";
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:4px 12px;background:rgba(0,212,255,0.05);border-bottom:1px solid rgba(0,212,255,0.08);font-size:10px;letter-spacing:1px;text-transform:uppercase;";
    const langLabel = document.createElement("span");
    langLabel.textContent = lang || "code";
    langLabel.style.color = T.textMuted;
    header.appendChild(langLabel);

    const copyBtn = document.createElement("span");
    copyBtn.className = "jarvis-code-copy";
    copyBtn.textContent = "copy";
    copyBtn.style.cssText = "cursor:pointer;opacity:0.4;transition:opacity 0.2s;user-select:none;color:" + T.textMuted + ";";
    // Copy handler will be attached on finalize with final code
    header._copyBtn = copyBtn;
    header.appendChild(copyBtn);
    codeBlockEl.appendChild(header);

    const pre = document.createElement("pre");
    pre.className = "jarvis-code-pre";
    pre.style.cssText = "margin:0;padding:12px 16px;overflow-x:auto;font-size:inherit;font-family:inherit;line-height:1.5;white-space:pre;word-break:normal;background:transparent;";
    codeContentEl = document.createElement("code");
    codeContentEl.style.fontFamily = "inherit";
    codeContentEl.style.display = "block";
    codeContentEl.style.color = C.plain;
    pre.appendChild(codeContentEl);
    codeBlockEl.appendChild(pre);

    container.appendChild(codeBlockEl);
  }

  function updateCodeBlockLive(newText) {
    // During streaming, just show raw text (no highlighting yet for perf)
    codeContentEl.textContent = codeBuffer;
  }

  function finalizeCodeBlock() {
    // Apply syntax highlighting
    codeContentEl.innerHTML = "";
    const finalCode = codeBuffer.replace(/\n$/, "");

    if (hlEnabled && codeLang) {
      const tokens = tokenize(finalCode, codeLang.toLowerCase());
      for (const token of tokens) {
        codeContentEl.appendChild(buildTokenSpan(token));
      }
    } else {
      codeContentEl.textContent = finalCode;
    }

    // Attach copy handler
    const copyBtn = codeBlockEl.querySelector(".jarvis-code-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(finalCode).then(() => {
          copyBtn.textContent = "\u2713";
          copyBtn.style.color = T.green;
          setTimeout(() => { copyBtn.textContent = "copy"; copyBtn.style.color = T.textMuted; }, 1200);
        });
      });
    }

    codeBlockEl = null;
    codeContentEl = null;
    codeBuffer = "";
    codeLang = "";
    currentTextWrap = null; // new text starts a fresh wrap
  }

  function processBuffer() {
    while (pendingText.length > 0) {
      if (state === "NORMAL") {
        // Look for opening code fence: ```lang\n
        const fenceMatch = pendingText.match(/^```(\w*)\n/m);
        if (!fenceMatch) {
          // Check if we might have a partial fence at the end
          const partialFence = pendingText.match(/`{1,3}$/);
          if (partialFence) {
            // Flush everything except the potential partial fence
            const safe = pendingText.slice(0, pendingText.length - partialFence[0].length);
            if (safe) flushPlainText(safe);
            pendingText = partialFence[0];
            return; // wait for more data
          }
          // No fence found — flush all as plain text
          flushPlainText(pendingText);
          pendingText = "";
          return;
        }

        // Found a fence opening
        const fenceIndex = pendingText.indexOf(fenceMatch[0]);
        // Flush text before the fence
        if (fenceIndex > 0) {
          flushPlainText(pendingText.slice(0, fenceIndex));
        }

        // Start code block
        state = "IN_CODE_BLOCK";
        startCodeBlock(fenceMatch[1]);
        pendingText = pendingText.slice(fenceIndex + fenceMatch[0].length);

      } else {
        // IN_CODE_BLOCK — look for closing fence: \n``` (at start of line)
        // Also check for ``` at position 0 if codeBuffer already ends with \n
        let closeIndex = pendingText.indexOf("\n```");
        let closeFenceLen = 4; // length of \n```
        if (closeIndex === -1 && pendingText.startsWith("```") && codeBuffer.endsWith("\n")) {
          closeIndex = 0;
          closeFenceLen = 3; // just ```
        }
        if (closeIndex === -1) {
          // Check for partial closing fence at end
          const tailCheck = pendingText.match(/\n`{1,2}$/) || (codeBuffer.endsWith("\n") ? pendingText.match(/^`{1,2}$/) : null);
          if (tailCheck) {
            const safe = pendingText.slice(0, pendingText.length - tailCheck[0].length);
            codeBuffer += safe;
            updateCodeBlockLive();
            pendingText = tailCheck[0];
            return;
          }
          // No closing fence — buffer all as code
          codeBuffer += pendingText;
          updateCodeBlockLive();
          pendingText = "";
          return;
        }

        // Found closing fence
        if (closeIndex === 0 && closeFenceLen === 3) {
          // ``` at start, codeBuffer already has trailing \n
          finalizeCodeBlock();
        } else {
          codeBuffer += pendingText.slice(0, closeIndex + 1); // include the \n before ```
          finalizeCodeBlock();
        }
        state = "NORMAL";

        // Skip past the ``` and any trailing whitespace on that line
        const afterClose = pendingText.slice(closeIndex + closeFenceLen);
        // Consume rest of the closing line (e.g., \n after ```)
        const lineEnd = afterClose.indexOf("\n");
        if (lineEnd === -1) {
          pendingText = afterClose;
        } else {
          pendingText = afterClose.slice(lineEnd);
        }
      }
    }
  }

  return {
    append(text) {
      buffer += text;
      pendingText += text;
      processBuffer();
    },

    finalize() {
      // Re-render the entire buffer with full markdown support.
      // During streaming, inline code and code blocks may be split across chunks
      // and rendered as plain text. Re-rendering ensures correct formatting.
      container.innerHTML = "";
      container.appendChild(renderMarkdown(buffer));
      state = "NORMAL";
      pendingText = "";
      codeBuffer = "";
      currentTextWrap = null;
      codeBlockEl = null;
      codeContentEl = null;
    },

    getTextNodes() {
      return allTextNodes;
    },

    getContainer() {
      return container;
    },
  };
}


return { renderMarkdown, createStreamRenderer };
