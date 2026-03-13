// Communication Link Widget — Orchestrator
// Terminal-style panel with launch button
// Returns: HTMLElement

const { el, T, config, isNarrow, createSectionTitle } = ctx;
const linkCfg = config.widgets?.communicationLink || {};
const terminalApp = linkCfg.terminalApp || "Terminal";

function loadSub(rel) {
  const code = ctx.nodeFs.readFileSync(
    ctx.nodePath.join(ctx._srcDir, "widgets", "communication-link", rel), "utf8"
  );
  return new Function("ctx", code)(ctx);
}

const { createTerminalDisplay } = loadSub("ui/terminal-display.js");

const section = el("div", {
  position: "relative",
  zIndex: "2",
  marginBottom: isNarrow ? "24px" : "40px",
});

// Title
section.appendChild(createSectionTitle("Communication Link", { marginBottom: "20px" }));

// Terminal panel
const terminal = createTerminalDisplay(() => {
  const vaultPath = app.vault.adapter.basePath;
  require("child_process").execFile("osascript", [
    "-e", `tell application "${terminalApp}"`,
    "-e", `do script "cd '${vaultPath}' && claude"`,
    "-e", "activate",
    "-e", "end tell"
  ]);
  new Notice("Launching Claude Code in " + terminalApp + "...");
});
section.appendChild(terminal.el.panel);

return section;
