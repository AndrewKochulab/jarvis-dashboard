// Communication Link Widget
// Terminal-style panel with launch button
// Returns: HTMLElement

const { el, T, config, isNarrow } = ctx;
const linkCfg = config.widgets?.communicationLink || {};
const terminalApp = linkCfg.terminalApp || "Terminal";
const terminalTitle = linkCfg.terminalTitle || "claude \u2014 Dashboard";
const vaultPathDisplay = linkCfg.vaultPathDisplay || "~/my-vault";

const section = el("div", {
  position: "relative",
  zIndex: "2",
  marginBottom: isNarrow ? "24px" : "40px",
});

// Title
const titleRow = el("div", {
  display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px",
});
section.appendChild(titleRow);

titleRow.appendChild(el("div", {
  flex: "0 0 4px", height: "24px", background: T.accent, borderRadius: "2px",
}));

titleRow.appendChild(el("span", {
  fontSize: isNarrow ? "14px" : "18px",
  fontWeight: "700", letterSpacing: "3px",
  textTransform: "uppercase", color: T.text,
}, "Communication Link"));

// Terminal panel
const panel = el("div", {
  background: T.panelBg, border: `1px solid ${T.panelBorder}`,
  borderRadius: "12px", overflow: "hidden",
  animation: "jarvisCardFadeIn 0.5s ease-out 0.4s both",
});
section.appendChild(panel);

// Title bar with traffic lights
const titleBar = el("div", {
  display: "flex", alignItems: "center", gap: "8px",
  padding: isNarrow ? "10px 14px" : "12px 18px",
  background: "rgba(0,0,0,0.3)",
  borderBottom: `1px solid ${T.panelBorder}`,
});
panel.appendChild(titleBar);

[{ color: "#ff5f57" }, { color: "#febc2e" }, { color: "#28c840" }].forEach(d => {
  titleBar.appendChild(el("span", {
    width: "12px", height: "12px", borderRadius: "50%",
    background: d.color, display: "inline-block", opacity: "0.85",
  }));
});

titleBar.appendChild(el("span", {
  fontSize: "12px", color: T.textMuted,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  marginLeft: "8px", letterSpacing: "0.5px",
}, terminalTitle));

// Terminal body
const termBody = el("div", {
  padding: isNarrow ? "16px 14px" : "24px 24px",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  fontSize: isNarrow ? "12px" : "14px",
  lineHeight: "2",
});
panel.appendChild(termBody);

const line1 = el("div", { color: T.textDim });
line1.appendChild(el("span", { color: T.green }, "$ "));
line1.appendChild(el("span", { color: T.textMuted }, `cd ${vaultPathDisplay}`));
termBody.appendChild(line1);

const line2 = el("div", { color: T.textDim });
line2.appendChild(el("span", { color: T.green }, "$ "));
line2.appendChild(el("span", { color: T.textMuted }, "claude"));
termBody.appendChild(line2);

const line3 = el("div", { display: "flex", alignItems: "center" });
line3.appendChild(el("span", { color: T.accent, fontWeight: "600" }, "\u25b8 "));
line3.appendChild(el("span", { color: T.accent }, "Ready to assist..."));
line3.appendChild(el("span", {
  display: "inline-block", width: "8px", height: isNarrow ? "14px" : "16px",
  background: T.accent, marginLeft: "4px",
  animation: "jarvisCursorBlink 0.8s step-end infinite",
  verticalAlign: "middle",
}));
termBody.appendChild(line3);

// Launch button
const btnWrap = el("div", {
  padding: isNarrow ? "0 14px 16px" : "0 24px 24px",
  display: "flex", flexDirection: "column", alignItems: "center", gap: "12px",
});
panel.appendChild(btnWrap);

const launchBtn = el("div", {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  gap: "10px", padding: isNarrow ? "12px 24px" : "14px 40px",
  border: `1px solid ${T.accent}55`, borderRadius: "8px",
  background: "rgba(0, 212, 255, 0.06)",
  cursor: "pointer", transition: "all 0.3s ease",
  width: "100%", maxWidth: "400px", boxSizing: "border-box",
});
btnWrap.appendChild(launchBtn);

launchBtn.appendChild(el("span", { fontSize: "16px", color: T.accent }, "\u25b6"));
launchBtn.appendChild(el("span", {
  fontSize: isNarrow ? "11px" : "13px",
  fontWeight: "700", letterSpacing: "3px",
  textTransform: "uppercase", color: T.accent,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
}, "Launch Terminal"));

launchBtn.addEventListener("mouseenter", () => {
  launchBtn.style.boxShadow = `0 0 20px ${T.accentDim}, 0 0 40px rgba(0,212,255,0.1)`;
  launchBtn.style.borderColor = T.accent + "88";
  launchBtn.style.transform = "scale(1.02)";
  launchBtn.style.background = "rgba(0, 212, 255, 0.1)";
});
launchBtn.addEventListener("mouseleave", () => {
  launchBtn.style.boxShadow = "none";
  launchBtn.style.borderColor = T.accent + "55";
  launchBtn.style.transform = "scale(1)";
  launchBtn.style.background = "rgba(0, 212, 255, 0.06)";
});

launchBtn.addEventListener("click", () => {
  const vaultPath = app.vault.adapter.basePath;
  require("child_process").execFile("osascript", [
    "-e", `tell application "${terminalApp}"`,
    "-e", `do script "cd '${vaultPath}' && claude"`,
    "-e", "activate",
    "-e", "end tell"
  ]);
  new Notice("Launching Claude Code in " + terminalApp + "...");
});

btnWrap.appendChild(el("div", {
  fontSize: "10px", color: T.textDim, letterSpacing: "1px", textAlign: "center",
}, `Opens ${terminalApp} \u2192 navigates to vault \u2192 starts Claude Code`));

return section;
