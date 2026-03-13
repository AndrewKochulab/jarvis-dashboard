// Voice Command — Project selector dropdown
// Allows switching between tracked projects when no active session exists.

const { el, T, config, isNarrow } = ctx;
const sessionManager = ctx.sessionManager;

function createProjectSelector(options) {
  const { onSelect, isDisabled } = options || {};

  const dot = el("span", {
    display: "inline-block", width: "8px", height: "8px",
    borderRadius: "50%", flexShrink: "0", transition: "background 0.2s ease",
  });
  const icon = el("span", { fontSize: "14px", lineHeight: "1", flexShrink: "0" });
  const label = el("span", {
    fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px",
    color: T.text,
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  });
  const chevron = el("span", {
    fontSize: "14px", color: T.textMuted,
    transition: "transform 0.15s ease, color 0.15s ease", flexShrink: "0",
  }, "\u25BE");

  const selector = el("div", {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "8px 14px", marginTop: "12px",
    background: T.panelBg, border: `1px solid ${T.panelBorder}`,
    borderRadius: "8px", maxWidth: isNarrow ? "100%" : "600px",
    width: "100%", cursor: "pointer",
    transition: "border-color 0.2s ease",
    position: "relative", userSelect: "none",
  });
  selector.appendChild(dot);
  selector.appendChild(icon);
  selector.appendChild(label);
  selector.appendChild(chevron);

  let dropdownOpen = false;
  let dropdownEl = null;

  function getActiveProjectIndex() {
    const session = sessionManager.getActiveSession();
    return session ? session.projectIndex : (config.projects?.defaultProjectIndex || 0);
  }

  function shouldShow() {
    const all = sessionManager.getAllSessions();
    return all.length === 0 || all.every(s => s.conversationHistory.length === 0 && !s.sessionId);
  }

  function update() {
    selector.style.display = shouldShow() ? "flex" : "none";
    const idx = getActiveProjectIndex();
    const color = sessionManager.getProjectColor(idx);
    const projIcon = sessionManager.getProjectIcon(idx);
    const proj = sessionManager.getProject(idx);
    const projLabel = proj?.label || `Project ${idx}`;
    dot.style.background = color;
    icon.textContent = projIcon;
    label.textContent = projLabel;
    label.style.color = color;
  }

  function closeDropdown() {
    if (dropdownEl && dropdownEl.parentNode) dropdownEl.parentNode.removeChild(dropdownEl);
    dropdownEl = null;
    dropdownOpen = false;
    chevron.style.transform = "";
    selector.style.borderColor = T.panelBorder;
  }

  function openDropdown() {
    if (dropdownOpen) { closeDropdown(); return; }
    if (isDisabled && isDisabled()) return;

    dropdownOpen = true;
    chevron.style.transform = "rotate(180deg)";
    selector.style.borderColor = T.accent + "44";

    const rect = selector.getBoundingClientRect();
    const dropdown = el("div", {
      position: "fixed",
      top: (rect.bottom + 4) + "px",
      left: rect.left + "px",
      width: rect.width + "px",
      background: T.panelBg,
      border: `1px solid ${T.accent}33`,
      borderRadius: "8px", overflow: "hidden", zIndex: "10000",
      maxHeight: "240px", overflowY: "auto",
      boxShadow: `0 8px 24px rgba(0,0,0,0.4), 0 0 1px ${T.accent}22`,
    });
    dropdown.classList.add("jarvis-project-dropdown");

    const currentIdx = getActiveProjectIndex();
    const tracked = sessionManager.tracked;

    for (let i = 0; i < tracked.length; i++) {
      const proj = tracked[i];
      const color = sessionManager.getProjectColor(i);
      const projIcon = sessionManager.getProjectIcon(i);
      const isActive = i === currentIdx;

      const item = el("div", {
        display: "flex", alignItems: "center", gap: "8px",
        padding: "8px 14px", cursor: "pointer",
        transition: "background 0.1s ease",
        background: isActive ? `${color}12` : "transparent",
      });
      item.appendChild(el("span", {
        display: "inline-block", width: "6px", height: "6px",
        borderRadius: "50%", background: color, flexShrink: "0",
      }));
      item.appendChild(el("span", { fontSize: "13px", lineHeight: "1", flexShrink: "0" }, projIcon));
      item.appendChild(el("span", {
        fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px",
        color: isActive ? color : T.text,
        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace", flex: "1",
      }, proj.label));
      if (isActive) {
        item.appendChild(el("span", { fontSize: "12px", color, flexShrink: "0" }, "\u2713"));
      }

      const projIdx = i;
      item.addEventListener("mouseenter", () => { if (!isActive) item.style.background = `${color}08`; });
      item.addEventListener("mouseleave", () => { item.style.background = isActive ? `${color}12` : "transparent"; });
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        closeDropdown();
        if (projIdx !== currentIdx && onSelect) onSelect(projIdx);
      });
      dropdown.appendChild(item);
    }

    dropdownEl = dropdown;
    document.body.appendChild(dropdown);
  }

  selector.addEventListener("click", (e) => { e.stopPropagation(); openDropdown(); });
  selector.addEventListener("mouseenter", () => {
    if (!dropdownOpen && !(isDisabled && isDisabled())) {
      selector.style.borderColor = T.accent + "44";
    }
  });
  selector.addEventListener("mouseleave", () => {
    if (!dropdownOpen) selector.style.borderColor = T.panelBorder;
  });

  function handleClickOutside(e) {
    if (dropdownOpen && !selector.contains(e.target) && !(dropdownEl && dropdownEl.contains(e.target))) {
      closeDropdown();
    }
  }
  document.addEventListener("click", handleClickOutside);

  function setVisible(bool) { selector.style.display = bool ? "flex" : "none"; }
  function setEnabled(bool) {
    selector.style.opacity = bool ? "1" : "0.5";
    selector.style.pointerEvents = bool ? "auto" : "none";
  }

  function cleanup() {
    document.removeEventListener("click", handleClickOutside);
    closeDropdown();
  }

  update();

  return {
    update,
    setVisible,
    setEnabled,
    closeDropdown,
    cleanup,
    el: { selector },
  };
}

return { createProjectSelector };
