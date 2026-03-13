// Voice Command — Session tab bar
// Multi-session tab bar with drag-drop, editable names, notification badges.

const { el, T } = ctx;
const sessionManager = ctx.sessionManager;

function createSessionTabs(options) {
  const { onSwitch, onClose, onCreate } = options || {};

  const tabBar = el("div", {
    display: "none",
    alignItems: "center",
    gap: "0",
    overflowX: "auto",
    overflowY: "hidden",
    borderTop: "1px solid rgba(0, 212, 255, 0.08)",
    background: "rgba(0, 0, 0, 0.2)",
    minHeight: "34px",
  });
  tabBar.classList.add("jarvis-tab-bar");

  let editingTabId = null;
  let editingInput = null;
  let dragSourceId = null;
  let tabAddPickerEl = null;
  let touchDragId = null;
  let touchTimer = null;

  function cancelTabEdit() {
    if (editingTabId) {
      editingTabId = null;
      editingInput = null;
      render();
    }
  }

  function startTabEdit(sessionId, labelSpan) {
    if (editingTabId) cancelTabEdit();
    const sess = sessionManager.getSession(sessionId);
    if (!sess) return;
    const color = sess.sessionColor || sess.projectColor || sessionManager.getProjectColor(sess.projectIndex);
    const icon = sess.projectIcon || sessionManager.getProjectIcon(sess.projectIndex);
    const currentName = sess.customName || `${icon} ${sess.projectLabel}`;
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentName;
    Object.assign(input.style, {
      font: "10px 'SF Mono', 'Fira Code', 'Consolas', monospace",
      fontWeight: "600", letterSpacing: "0.5px",
      background: "transparent", border: "none",
      borderBottom: `1px solid ${color}`,
      color: color, outline: "none", padding: "0",
      width: Math.max(60, Math.min(200, labelSpan.offsetWidth + 10)) + "px",
      minWidth: "60px", maxWidth: "200px",
    });
    labelSpan.textContent = "";
    labelSpan.appendChild(input);
    input.focus();
    input.select();
    editingTabId = sessionId;
    editingInput = input;

    function commitEdit() {
      const val = input.value.trim();
      sess.customName = val || null;
      sessionManager.saveImmediate();
      editingTabId = null;
      editingInput = null;
      render();
    }
    function cancelEdit() {
      editingTabId = null;
      editingInput = null;
      render();
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
      else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
    });
    input.addEventListener("blur", cancelEdit);
  }

  function render() {
    const allSessions = sessionManager.getAllSessions();
    tabBar.innerHTML = "";

    if (allSessions.length === 0) {
      tabBar.style.display = "none";
      return;
    }
    tabBar.style.display = "flex";

    const activeId = sessionManager.getActiveSessionId();

    for (const sess of allSessions) {
      const isActive = sess.id === activeId;
      const color = sess.sessionColor || sess.projectColor || sessionManager.getProjectColor(sess.projectIndex);
      const icon = sess.projectIcon || sessionManager.getProjectIcon(sess.projectIndex);

      const tab = el("div", {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "7px 14px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontSize: "10px",
        fontWeight: "600",
        letterSpacing: "0.5px",
        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
        borderBottom: `2px solid ${isActive ? color : "transparent"}`,
        borderRight: "1px solid rgba(0, 212, 255, 0.06)",
        transition: "all 0.15s ease",
        position: "relative",
        flexShrink: "0",
        color: isActive ? color : T.textMuted,
        background: isActive ? `${color}08` : "transparent",
      });
      tab.classList.add("jarvis-tab");
      tab.dataset.active = isActive ? "true" : "false";

      tab.appendChild(el("span", {
        display: "inline-block", width: "5px", height: "5px",
        borderRadius: "50%", background: color,
        opacity: isActive ? "1" : "0.6", flexShrink: "0",
      }));

      const displayText = sess.customName || `${icon} ${sess.projectLabel}`;
      const labelSpan = el("span", {}, displayText);
      tab.appendChild(labelSpan);
      labelSpan.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        startTabEdit(sess.id, labelSpan);
      });

      if (!isActive && sess.status === "done" && sess._notifyBadge) {
        const badge = el("span", { background: color });
        badge.classList.add("jarvis-tab-badge");
        tab.appendChild(badge);
      }

      const closeTabBtn = el("span", {
        color: T.textMuted,
        cursor: "pointer",
        opacity: "0",
        transition: "opacity 0.15s ease",
        fontSize: "9px",
        padding: "1px 3px",
        borderRadius: "3px",
        lineHeight: "1",
        marginLeft: "4px",
      }, "\u2715");
      closeTabBtn.classList.add("jarvis-tab-close");
      closeTabBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (onClose) onClose(sess.id);
      });
      closeTabBtn.addEventListener("mouseenter", () => {
        closeTabBtn.style.opacity = "1";
        closeTabBtn.style.background = "rgba(231, 76, 60, 0.2)";
        closeTabBtn.style.color = "#e74c3c";
      });
      closeTabBtn.addEventListener("mouseleave", () => {
        closeTabBtn.style.opacity = "0";
        closeTabBtn.style.background = "transparent";
        closeTabBtn.style.color = T.textMuted;
      });
      tab.appendChild(closeTabBtn);

      // Show close button on tab hover
      tab.addEventListener("mouseenter", () => {
        closeTabBtn.style.opacity = "0.5";
      });
      tab.addEventListener("mouseleave", () => {
        closeTabBtn.style.opacity = "0";
        closeTabBtn.style.background = "transparent";
        closeTabBtn.style.color = T.textMuted;
      });

      tab.addEventListener("click", () => {
        if (!isActive && onSwitch) onSwitch(sess.id);
      });

      // Mouse-based drag & drop (HTML5 drag API unreliable in Tauri WKWebView)
      tab.dataset.sessionId = sess.id;
      let mouseDownTimer = null;
      tab.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        const startX = e.clientX;
        mouseDownTimer = setTimeout(() => {
          dragSourceId = sess.id;
          tab.style.opacity = "0.4";
          tab.style.cursor = "grabbing";

          function onMouseMove(ev) {
            const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.(".jarvis-tab");
            tabBar.querySelectorAll(".jarvis-tab").forEach(t => {
              t.style.borderLeft = (t === target && target?.dataset.sessionId !== dragSourceId)
                ? "2px solid rgba(0, 212, 255, 0.6)" : "";
            });
          }
          function onMouseUp(ev) {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.(".jarvis-tab");
            if (target?.dataset.sessionId && target.dataset.sessionId !== dragSourceId) {
              const allS = sessionManager.getAllSessions();
              const targetIdx = allS.findIndex(s => s.id === target.dataset.sessionId);
              if (targetIdx >= 0) { sessionManager.moveSession(dragSourceId, targetIdx); }
            }
            tabBar.querySelectorAll(".jarvis-tab").forEach(t => {
              t.style.borderLeft = "";
              t.style.opacity = "";
              t.style.cursor = "";
            });
            dragSourceId = null;
            render();
          }
          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        }, 200);
      });
      tab.addEventListener("mouseup", () => { clearTimeout(mouseDownTimer); });
      tab.addEventListener("mouseleave", () => { if (!dragSourceId) clearTimeout(mouseDownTimer); });

      // Touch drag-drop (iOS)
      tab.addEventListener("touchstart", (e) => {
        touchTimer = setTimeout(() => {
          touchDragId = sess.id;
          tab.style.opacity = "0.4";
        }, 300);
      }, { passive: true });

      tab.addEventListener("touchmove", (e) => {
        if (!touchDragId) { clearTimeout(touchTimer); return; }
        e.preventDefault();
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest?.(".jarvis-tab");
        tabBar.querySelectorAll(".jarvis-tab").forEach(t => {
          t.style.borderLeft = (t === target && target?.dataset.sessionId !== touchDragId)
            ? "2px solid rgba(0, 212, 255, 0.6)" : "";
        });
      }, { passive: false });

      tab.addEventListener("touchend", (e) => {
        clearTimeout(touchTimer);
        if (!touchDragId) return;
        const lastTouch = e.changedTouches[0];
        const target = document.elementFromPoint(lastTouch.clientX, lastTouch.clientY)?.closest?.(".jarvis-tab");
        if (target?.dataset.sessionId && target.dataset.sessionId !== touchDragId) {
          const allS = sessionManager.getAllSessions();
          const targetIdx = allS.findIndex(s => s.id === target.dataset.sessionId);
          if (targetIdx >= 0) { sessionManager.moveSession(touchDragId, targetIdx); }
        }
        tabBar.querySelectorAll(".jarvis-tab").forEach(t => {
          t.style.borderLeft = "";
          t.style.opacity = "";
        });
        touchDragId = null;
        render();
      });

      tab.addEventListener("touchcancel", () => {
        clearTimeout(touchTimer);
        touchDragId = null;
        tab.style.opacity = "";
      });

      tabBar.appendChild(tab);
    }

    // "+" button
    const addBtn = el("div", {
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "6px 10px", cursor: "pointer", color: T.textMuted,
      fontSize: "14px", fontWeight: "600", transition: "color 0.15s ease", flexShrink: "0",
    }, "+");
    addBtn.addEventListener("mouseenter", () => { addBtn.style.color = T.accent; });
    addBtn.addEventListener("mouseleave", () => { addBtn.style.color = T.textMuted; });
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showTabAddPicker(addBtn);
    });
    tabBar.appendChild(addBtn);
  }

  function showTabAddPicker(anchorEl) {
    cancelTabEdit();
    if (tabAddPickerEl) { hideTabAddPicker(); return; }

    const picker = el("div", {
      position: "fixed",
      background: T.panelBg, border: `1px solid ${T.accent}33`,
      borderRadius: "8px", overflow: "hidden", zIndex: "10000",
      maxHeight: "200px", overflowY: "auto",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)", minWidth: "180px",
    });
    picker.classList.add("jarvis-project-dropdown");

    const tracked = sessionManager.tracked;
    for (let i = 0; i < tracked.length; i++) {
      const proj = tracked[i];
      const color = sessionManager.getProjectColor(i);
      const icon = sessionManager.getProjectIcon(i);

      const item = el("div", {
        display: "flex", alignItems: "center", gap: "8px",
        padding: "7px 12px", cursor: "pointer", transition: "background 0.1s ease",
      });
      item.appendChild(el("span", {
        display: "inline-block", width: "5px", height: "5px",
        borderRadius: "50%", background: color, flexShrink: "0",
      }));
      item.appendChild(el("span", { fontSize: "12px", lineHeight: "1", flexShrink: "0" }, icon));
      item.appendChild(el("span", {
        fontSize: "10px", fontWeight: "600", letterSpacing: "0.5px",
        color: T.text, fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
      }, proj.label));

      const projIdx = i;
      item.addEventListener("mouseenter", () => { item.style.background = `${color}08`; });
      item.addEventListener("mouseleave", () => { item.style.background = "transparent"; });
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        hideTabAddPicker();
        if (onCreate) onCreate(projIdx);
      });
      picker.appendChild(item);
    }

    tabAddPickerEl = picker;
    document.body.appendChild(picker);
    const rect = anchorEl.getBoundingClientRect();
    // Position above the button so all items are visible on mobile
    const pickerHeight = Math.min(tracked.length * 34 + 8, 200);
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < pickerHeight && spaceAbove > spaceBelow) {
      // Show above
      picker.style.bottom = (window.innerHeight - rect.top + 4) + "px";
      picker.style.top = "auto";
    } else {
      picker.style.top = (rect.bottom + 4) + "px";
    }
    picker.style.left = Math.max(4, rect.left - 80) + "px";
  }

  function hideTabAddPicker() {
    if (tabAddPickerEl && tabAddPickerEl.parentNode) {
      tabAddPickerEl.parentNode.removeChild(tabAddPickerEl);
    }
    tabAddPickerEl = null;
  }

  function handleClickOutside(e) {
    if (tabAddPickerEl && !tabAddPickerEl.contains(e.target)) hideTabAddPicker();
  }
  document.addEventListener("click", handleClickOutside);

  function showNotificationBadge(sessionId) {
    const sess = sessionManager.getSession(sessionId);
    if (sess) {
      sess._notifyBadge = true;
      render();
    }
  }

  function cleanup() {
    document.removeEventListener("click", handleClickOutside);
    hideTabAddPicker();
  }

  render();

  return {
    render,
    cancelTabEdit,
    showNotificationBadge,
    hideTabAddPicker,
    cleanup,
    el: { tabBar },
  };
}

return { createSessionTabs };
