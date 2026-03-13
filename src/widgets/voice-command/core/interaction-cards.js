// Voice Command — Interaction cards
// All card types: permission, settings permission, question, AskUserQuestion,
// completed, display-only, status labels, batch questions.

const { el, T, config, isNarrow } = ctx;
const animationsEnabled = ctx.animationsEnabled !== false;
const animOrNone = (s) => animationsEnabled ? s : "none";
const cmdCfg = config.widgets?.voiceCommand || {};
const interactiveCfg = cmdCfg.interactive || {};

function createCardRenderer(options) {
  const {
    sendControlResponse,
    onHistoryPush,
    syncToManager,
    ttsService,
    personalityCfg,
    showStatusLabels,
  } = options || {};

  // ── Batch state ──
  const pendingQuestions = new Map();
  let batchSubmitBtn = null;
  let batchSubmitContainer = null;

  // ── Card base styles ──
  function cardBaseStyles() {
    return {
      margin: "12px 0",
      padding: isNarrow ? "12px" : "16px",
      borderRadius: "8px",
      border: `1px solid ${T.accent}44`,
      background: `linear-gradient(135deg, rgba(10,15,30,0.95), rgba(13,17,23,0.95))`,
      boxShadow: `0 0 12px ${T.accent}15, inset 0 0 8px rgba(0,0,0,0.3)`,
      animation: "jarvisCardSlideIn 0.3s ease-out",
      fontFamily: "monospace",
    };
  }

  function makeBtn(label, bg, hoverBg) {
    const btn = el("div", {
      padding: "6px 14px", borderRadius: "4px", cursor: "pointer",
      background: bg, color: "#fff", fontSize: "11px", fontWeight: "bold",
      letterSpacing: "1px", textAlign: "center", transition: "all 0.2s",
      border: `1px solid ${bg}`,
    }, label);
    btn.addEventListener("mouseenter", () => { btn.style.background = hoverBg; btn.style.boxShadow = `0 0 10px ${bg}66`; });
    btn.addEventListener("mouseleave", () => { btn.style.background = bg; btn.style.boxShadow = "none"; });
    return btn;
  }

  function makeCardHeader(icon, title) {
    const header = el("div", {
      display: "flex", alignItems: "center", gap: "8px",
      marginBottom: "10px", paddingBottom: "8px",
      borderBottom: `1px solid ${T.accent}22`,
    });
    header.appendChild(el("span", { fontSize: "14px" }, icon));
    header.appendChild(el("span", {
      color: T.accent, fontSize: isNarrow ? "11px" : "12px",
      fontWeight: "bold", letterSpacing: "1.5px", textTransform: "uppercase",
    }, title));
    return header;
  }

  function appendToolPreview(card, toolName, input) {
    const toolRow = el("div", { marginBottom: "6px" });
    toolRow.appendChild(el("span", { color: T.textMuted, fontSize: "11px" }, "Tool: "));
    toolRow.appendChild(el("span", { color: T.gold, fontSize: "12px", fontWeight: "bold" }, toolName));
    card.appendChild(toolRow);

    if (toolName === "Edit" && input.file_path) {
      const fileRow = el("div", { marginBottom: "6px" });
      fileRow.appendChild(el("span", { color: T.textMuted, fontSize: "11px" }, "File: "));
      fileRow.appendChild(el("span", { color: T.text, fontSize: "11px" }, input.file_path.split("/").slice(-2).join("/")));
      card.appendChild(fileRow);
      if (input.old_string || input.new_string) {
        const diffBox = el("div", {
          background: "rgba(0,0,0,0.4)", borderRadius: "4px",
          padding: "8px", marginBottom: "8px", fontSize: "10px",
          border: `1px solid ${T.panelBorder}`, maxHeight: "120px", overflow: "auto",
        });
        if (input.old_string) {
          diffBox.appendChild(el("div", { color: T.red, whiteSpace: "pre-wrap", wordBreak: "break-all" },
            "- " + (input.old_string.length > 200 ? input.old_string.slice(0, 200) + "..." : input.old_string)));
        }
        if (input.new_string) {
          diffBox.appendChild(el("div", { color: T.green, whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: "4px" },
            "+ " + (input.new_string.length > 200 ? input.new_string.slice(0, 200) + "..." : input.new_string)));
        }
        card.appendChild(diffBox);
      }
    }

    if (toolName === "Bash" && input.command) {
      card.appendChild(el("div", {
        background: "rgba(0,0,0,0.4)", borderRadius: "4px",
        padding: "8px", marginBottom: "8px", fontSize: "10px",
        color: T.gold, border: `1px solid ${T.panelBorder}`,
        whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "80px", overflow: "auto",
      }, "$ " + (input.command.length > 300 ? input.command.slice(0, 300) + "..." : input.command)));
    }

    if ((toolName === "Write") && input.file_path) {
      const fileRow = el("div", { marginBottom: "6px" });
      fileRow.appendChild(el("span", { color: T.textMuted, fontSize: "11px" }, "File: "));
      fileRow.appendChild(el("span", { color: T.text, fontSize: "11px" }, input.file_path.split("/").slice(-2).join("/")));
      card.appendChild(fileRow);
    }
  }

  // ── Permission Card (control_request flow) ──
  function renderPermissionCard(requestId, request, container, scrollParent) {
    const card = el("div", cardBaseStyles());
    card.appendChild(makeCardHeader("\u26A1", "TOOL PERMISSION REQUEST"));

    const toolName = request.tool_name || "Unknown";
    const description = request.description || "";
    const input = request.input || {};

    appendToolPreview(card, toolName, input);
    if (description) {
      card.appendChild(el("div", { color: T.text, fontSize: "11px", marginBottom: "8px", opacity: "0.8" }, description));
    }

    const btnRow = el("div", { display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" });
    const allowBtn = makeBtn("ALLOW", T.green, "#55daa0");
    const alwaysBtn = makeBtn("ALWAYS ALLOW", T.purple, "#8d7cff");
    const denyBtn = makeBtn("DENY", T.red, "#ff5f4f");

    function disableCard() {
      card.style.opacity = "0.5";
      card.style.pointerEvents = "none";
    }

    function respond(behavior, decision, updatedPermissions) {
      disableCard();
      const resp = { subtype: "success", request_id: requestId, response: { behavior } };
      if (updatedPermissions) resp.updated_permissions = updatedPermissions;
      if (sendControlResponse) sendControlResponse(requestId, resp);
      if (onHistoryPush) onHistoryPush({
        role: "permission", tool: toolName, input, decision, requestId, timestamp: Date.now(),
      });
      if (syncToManager) syncToManager();
    }

    allowBtn.addEventListener("click", () => respond("allow", "allow"));
    alwaysBtn.addEventListener("click", () => respond("allowAlways", "allowAlways",
      [{ type: "allow_tool", tool_name: toolName }]));
    denyBtn.addEventListener("click", () => respond("deny", "deny"));

    btnRow.appendChild(allowBtn);
    btnRow.appendChild(alwaysBtn);
    btnRow.appendChild(denyBtn);
    card.appendChild(btnRow);
    container.appendChild(card);
    if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;

    if (ttsService?.isEnabled && !ttsService.isMuted) {
      const toolDesc = description || `use ${toolName}`;
      ttsService.speak(`Sir, JARVIS needs to ${toolDesc}. Allow?`);
    }
  }

  // ── Settings Permission Card (settings.local.json flow) ──
  function renderSettingsPermissionCard(permItem, container, scrollParent, callbacks) {
    const card = el("div", cardBaseStyles());
    card.appendChild(makeCardHeader("\u26A1", "TOOL PERMISSION REQUEST"));

    const toolName = permItem.toolName;
    const input = permItem.input || {};
    appendToolPreview(card, toolName, input);

    const btnRow = el("div", { display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" });

    function disableCard(badge) {
      card.style.opacity = "0.6";
      card.style.pointerEvents = "none";
      btnRow.innerHTML = "";
      btnRow.appendChild(el("span", {
        color: badge === "DENIED" ? T.red : T.green,
        fontSize: "11px", fontWeight: "bold", letterSpacing: "1px",
      }, badge));
    }
    permItem._disableCard = disableCard;

    const allowBtn = makeBtn("ALLOW", T.green, "#55daa0");
    const alwaysBtn = makeBtn("ALWAYS ALLOW", T.purple, "#8d7cff");
    const denyBtn = makeBtn("DENY", T.red, "#ff5f4f");

    allowBtn.addEventListener("click", () => {
      disableCard("ALLOWED");
      if (callbacks?.onAllow) callbacks.onAllow(permItem);
    });
    alwaysBtn.addEventListener("click", () => {
      disableCard("ALWAYS ALLOWED");
      if (callbacks?.onAlwaysAllow) callbacks.onAlwaysAllow(permItem);
    });
    denyBtn.addEventListener("click", () => {
      disableCard("DENIED");
      if (callbacks?.onDeny) callbacks.onDeny(permItem);
    });

    btnRow.appendChild(allowBtn);
    btnRow.appendChild(alwaysBtn);
    btnRow.appendChild(denyBtn);
    card.appendChild(btnRow);
    container.appendChild(card);
    if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;

    if (ttsService?.isEnabled && !ttsService.isMuted) {
      const userName = personalityCfg?.userName || "sir";
      ttsService.speak(`${userName}, permission needed to use ${toolName}. Allow?`);
    }
    return card;
  }

  // ── Question Card (Elicitation) ──
  function renderQuestionCard(requestId, request, container, scrollParent) {
    const isBatchMode = interactiveCfg.batchQuestions === true;
    const card = el("div", cardBaseStyles());
    card.appendChild(makeCardHeader("\uD83D\uDCAC", "JARVIS NEEDS YOUR INPUT"));

    const message = request.message || "Please provide your input.";
    card.appendChild(el("div", {
      color: T.text, fontSize: "12px", marginBottom: "10px",
      fontStyle: "italic", lineHeight: "1.5",
    }, `"${message}"`));

    let selectedAnswer = null;
    const options = request.options || [];

    if (isBatchMode) {
      pendingQuestions.set(requestId, { answered: false, answer: null, message });
    }

    // Radio options
    if (options.length > 0) {
      const optionsContainer = el("div", { marginBottom: "10px" });
      options.forEach((option) => {
        const optionLabel = typeof option === "string" ? option : (option.label || option.value || String(option));
        const optionValue = typeof option === "string" ? option : (option.value || option.label || String(option));
        const row = el("div", {
          display: "flex", alignItems: "center", gap: "8px",
          padding: "6px 8px", borderRadius: "4px", cursor: "pointer",
          transition: "all 0.15s", marginBottom: "2px",
          borderLeft: "3px solid transparent",
        });
        const radio = el("div", {
          width: "14px", height: "14px", borderRadius: "50%",
          border: `2px solid ${T.textMuted}`, flexShrink: "0",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "border-color 0.15s",
        });
        const radioDot = el("div", {
          width: "6px", height: "6px", borderRadius: "50%",
          background: "transparent", transition: "background 0.15s",
        });
        radio.appendChild(radioDot);
        row.appendChild(radio);
        row.appendChild(el("span", { color: T.text, fontSize: "11px" }, optionLabel));

        row.addEventListener("click", () => {
          optionsContainer.querySelectorAll("div[data-radio]").forEach(r => {
            r.style.borderColor = T.textMuted;
            r.firstChild.style.background = "transparent";
          });
          optionsContainer.querySelectorAll("[data-option-row]").forEach(r => {
            r.style.background = "transparent";
            r.style.borderLeft = "3px solid transparent";
            r.style.animation = "none";
          });
          radio.style.borderColor = T.accent;
          radioDot.style.background = T.accent;
          row.style.background = `${T.accent}15`;
          row.style.borderLeft = `3px solid ${T.accent}`;
          row.style.animation = animOrNone("jarvisOptionSelected 2s ease-in-out infinite");
          selectedAnswer = optionValue;
          if (isBatchMode) {
            const q = pendingQuestions.get(requestId);
            if (q) { q.answered = true; q.answer = optionValue; }
            updateBatchSubmitState();
          } else {
            updateSubmitState();
          }
          if (customInput) customInput.value = "";
        });

        radio.setAttribute("data-radio", "true");
        row.setAttribute("data-option-row", "true");
        optionsContainer.appendChild(row);
      });
      card.appendChild(optionsContainer);
    }

    // Custom text input
    card.appendChild(el("div", {
      color: T.textMuted, fontSize: "10px", marginBottom: "4px",
    }, options.length > 0 ? "Or type your own answer:" : "Your answer:"));

    const customInput = el("textarea", {
      width: "100%", boxSizing: "border-box",
      padding: "8px 10px", borderRadius: "4px",
      background: "rgba(0,0,0,0.4)", color: T.text,
      border: `1px solid ${T.panelBorder}`,
      fontSize: "11px", fontFamily: "monospace",
      outline: "none", resize: "none", overflow: "hidden",
      lineHeight: "1.4", minHeight: "32px", maxHeight: "80px",
    });
    customInput.rows = 1;
    customInput.setAttribute("placeholder", "Type your answer...");
    customInput.addEventListener("focus", () => { customInput.style.borderColor = `${T.accent}66`; });
    customInput.addEventListener("blur", () => { customInput.style.borderColor = T.panelBorder; });
    customInput.addEventListener("input", () => {
      customInput.style.height = "auto";
      customInput.style.height = Math.min(customInput.scrollHeight, 80) + "px";
      if (customInput.value.trim()) {
        selectedAnswer = customInput.value.trim();
        card.querySelectorAll("div[data-radio]").forEach(r => {
          r.style.borderColor = T.textMuted;
          r.firstChild.style.background = "transparent";
        });
        card.querySelectorAll("[data-option-row]").forEach(r => {
          r.style.background = "transparent";
          r.style.borderLeft = "3px solid transparent";
          r.style.animation = "none";
        });
        if (isBatchMode) {
          const q = pendingQuestions.get(requestId);
          if (q) { q.answered = true; q.answer = selectedAnswer; }
          updateBatchSubmitState();
        }
      } else {
        selectedAnswer = null;
        if (isBatchMode) {
          const q = pendingQuestions.get(requestId);
          if (q) { q.answered = false; q.answer = null; }
          updateBatchSubmitState();
        }
      }
      if (!isBatchMode) updateSubmitState();
    });
    card.appendChild(customInput);

    if (isBatchMode) {
      container.appendChild(card);
      if (!batchSubmitContainer) {
        batchSubmitContainer = el("div", { marginTop: "8px" });
        batchSubmitBtn = el("div", {
          padding: "8px 20px", borderRadius: "4px", cursor: "not-allowed",
          background: T.green, color: "#fff", fontSize: "11px", fontWeight: "bold",
          letterSpacing: "1px", textAlign: "center", marginTop: "10px",
          opacity: "0.4", transition: "all 0.2s", border: `1px solid ${T.green}`,
        }, "SUBMIT ALL");
        batchSubmitBtn.addEventListener("click", handleBatchSubmit);
        batchSubmitContainer.appendChild(batchSubmitBtn);
        container.appendChild(batchSubmitContainer);
      }
      customInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleBatchSubmit();
      });
      updateBatchSubmitState();
    } else {
      // Single mode submit button
      const submitBtn = el("div", {
        padding: "8px 20px", borderRadius: "4px", cursor: "not-allowed",
        background: T.green, color: "#fff", fontSize: "11px", fontWeight: "bold",
        letterSpacing: "1px", textAlign: "center", marginTop: "10px",
        opacity: "0.4", transition: "all 0.2s", border: `1px solid ${T.green}`,
      }, "SUBMIT");
      let submitEnabled = false;

      function updateSubmitState() {
        if (selectedAnswer) {
          submitEnabled = true;
          submitBtn.style.opacity = "1";
          submitBtn.style.cursor = "pointer";
          submitBtn.style.animation = animOrNone("jarvisSubmitPulse 2s ease-in-out infinite");
        } else {
          submitEnabled = false;
          submitBtn.style.opacity = "0.4";
          submitBtn.style.cursor = "not-allowed";
          submitBtn.style.animation = "none";
        }
      }

      submitBtn.addEventListener("click", () => {
        if (!submitEnabled || !selectedAnswer) return;
        card.style.opacity = "0.5";
        card.style.pointerEvents = "none";
        if (sendControlResponse) sendControlResponse(requestId, {
          subtype: "elicitation_complete",
          request_id: requestId,
          response: { selected: selectedAnswer },
        });
        if (onHistoryPush) onHistoryPush({
          role: "question", message: request.message, options: request.options,
          answer: selectedAnswer, requestId, timestamp: Date.now(),
        });
        if (syncToManager) syncToManager();
      });

      customInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && submitEnabled && selectedAnswer) submitBtn.click();
      });
      card.appendChild(submitBtn);
      container.appendChild(card);
    }

    if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;

    if (ttsService?.isEnabled && !ttsService.isMuted) {
      let ttsMsg = `Sir, ${message}`;
      if (options.length > 0) {
        const optLabels = options.map(o => typeof o === "string" ? o : (o.label || o.value || String(o)));
        ttsMsg += ` Options are: ${optLabels.join(", ")}.`;
      }
      ttsService.speak(ttsMsg);
    }
  }

  // ── AskUserQuestion Form ──
  function renderAskUserQuestionForm(toolUseId, input, container, scrollParent, callbacks) {
    const questions = input.questions || [];
    if (questions.length === 0) return;

    const isSingle = questions.length === 1;
    const answers = new Map();
    questions.forEach((q, idx) => answers.set(idx, { value: null, source: null }));

    const card = el("div", cardBaseStyles());
    card.appendChild(makeCardHeader("\uD83D\uDCAC", "JARVIS NEEDS YOUR INPUT"));

    const textInputs = [];
    let submitBtn = null;

    function allAnswered() {
      return [...answers.values()].every(a => a.value !== null && a.value !== "");
    }

    function updateSubmitState() {
      if (!submitBtn) return;
      if (allAnswered()) {
        submitBtn.style.opacity = "1";
        submitBtn.style.cursor = "pointer";
        submitBtn.style.animation = animOrNone("jarvisSubmitPulse 2s ease-in-out infinite");
      } else {
        submitBtn.style.opacity = "0.4";
        submitBtn.style.cursor = "not-allowed";
        submitBtn.style.animation = "none";
      }
    }

    function handleSubmit() {
      if (!allAnswered()) return;
      const answerLines = questions.map((q, idx) => {
        const a = answers.get(idx);
        return `${q.header || ("Question " + (idx + 1))}: ${a.value}`;
      });
      const responseText = answerLines.join("\n");
      const answerArray = questions.map((q, idx) => answers.get(idx).value);

      card.style.opacity = "0.5";
      card.style.pointerEvents = "none";

      if (callbacks?.onSubmit) callbacks.onSubmit(toolUseId, responseText, answerArray);
      if (onHistoryPush) onHistoryPush({
        role: "question",
        message: questions.map(q => q.question || q.header || "").join("; "),
        options: [], answer: responseText, requestId: null, timestamp: Date.now(),
      });
      if (syncToManager) syncToManager();
    }

    questions.forEach((q, idx) => {
      if (q.header) {
        card.appendChild(el("div", {
          color: T.accent, fontSize: "10px", fontWeight: "bold",
          letterSpacing: "1.5px", textTransform: "uppercase",
          marginTop: idx > 0 ? "6px" : "0", marginBottom: "4px",
        }, q.header));
      }
      if (q.question) {
        card.appendChild(el("div", {
          color: T.text, fontSize: "11px", marginBottom: "8px",
          fontStyle: "italic", lineHeight: "1.4",
        }, `"${q.question}"`));
      }

      // Pill options
      const options = q.options || [];
      const pills = [];
      if (options.length > 0) {
        const pillsWrap = el("div", { display: "flex", flexWrap: "wrap", marginBottom: "6px" });
        options.forEach((opt) => {
          const label = opt.label || String(opt);
          const desc = opt.description || "";
          const truncDesc = desc.length > 100 ? desc.slice(0, 100) + "..." : desc;
          const pill = el("div", {
            display: "inline-flex", flexDirection: "column", alignItems: "flex-start",
            padding: "8px 14px", borderRadius: "20px",
            border: `1px solid ${T.panelBorder}`, background: "rgba(0,0,0,0.3)",
            cursor: "pointer", transition: "all 0.2s",
            marginRight: "6px", marginBottom: "6px",
          });
          pill.appendChild(el("span", { fontSize: "11px", color: T.text }, label));
          if (truncDesc) pill.appendChild(el("span", { fontSize: "9px", color: T.textMuted, marginTop: "2px" }, truncDesc));

          let selected = false;
          pill.addEventListener("mouseenter", () => { if (!selected) pill.style.background = `${T.accent}11`; });
          pill.addEventListener("mouseleave", () => { if (!selected) pill.style.background = "rgba(0,0,0,0.3)"; });
          pill.addEventListener("click", () => {
            if (q.multiSelect) {
              selected = !selected;
              pill._selected = selected;
              pill.style.background = selected ? `${T.accent}22` : "rgba(0,0,0,0.3)";
              pill.style.borderColor = selected ? T.accent : T.panelBorder;
              pill.style.boxShadow = selected ? `0 0 8px ${T.accent}33` : "none";
              const selectedLabels = pills.filter(p => p._selected).map(p => p._label);
              answers.set(idx, selectedLabels.length > 0 ? { value: selectedLabels.join(", "), source: "pill" } : { value: null, source: null });
            } else {
              pills.forEach(p => {
                p._selected = false;
                p.style.background = "rgba(0,0,0,0.3)";
                p.style.borderColor = T.panelBorder;
                p.style.boxShadow = "none";
              });
              selected = true;
              pill._selected = true;
              pill.style.background = `${T.accent}22`;
              pill.style.borderColor = T.accent;
              pill.style.boxShadow = `0 0 8px ${T.accent}33`;
              answers.set(idx, { value: label, source: "pill" });
            }
            const ti = textInputs[idx];
            if (ti) ti.value = "";
            updateSubmitState();
          });

          pill._selected = false;
          pill._label = label;
          pills.push(pill);
          pillsWrap.appendChild(pill);
        });
        card.appendChild(pillsWrap);
      }

      // Custom text input
      card.appendChild(el("div", {
        color: T.textMuted, fontSize: "10px", marginBottom: "4px",
      }, options.length > 0 ? "Or type your own:" : "Your answer:"));

      const customInput = el("textarea", {
        width: isSingle ? "calc(100% - 100px)" : "100%",
        boxSizing: "border-box",
        padding: "8px 10px", borderRadius: "4px",
        background: "rgba(0,0,0,0.4)", color: T.text,
        border: `1px solid ${T.panelBorder}`,
        fontSize: "11px", fontFamily: "monospace",
        outline: "none", resize: "none", overflow: "hidden",
        lineHeight: "1.4", minHeight: "32px", maxHeight: "80px",
      });
      customInput.rows = 1;
      customInput.setAttribute("placeholder", "Type your answer...");
      customInput.addEventListener("focus", () => { customInput.style.borderColor = `${T.accent}66`; });
      customInput.addEventListener("blur", () => { customInput.style.borderColor = T.panelBorder; });
      customInput.addEventListener("input", () => {
        customInput.style.height = "auto";
        customInput.style.height = Math.min(customInput.scrollHeight, 80) + "px";
        if (customInput.value.trim()) {
          answers.set(idx, { value: customInput.value.trim(), source: "custom" });
          pills.forEach(p => {
            p._selected = false;
            p.style.background = "rgba(0,0,0,0.3)";
            p.style.borderColor = T.panelBorder;
            p.style.boxShadow = "none";
          });
        } else {
          answers.set(idx, { value: null, source: null });
        }
        updateSubmitState();
      });
      textInputs[idx] = customInput;

      if (isSingle) {
        const inlineRow = el("div", { display: "flex", alignItems: "center", gap: "8px" });
        inlineRow.appendChild(customInput);
        submitBtn = el("div", {
          padding: "8px 16px", borderRadius: "4px", cursor: "not-allowed",
          background: T.green, color: "#fff", fontSize: "11px", fontWeight: "bold",
          letterSpacing: "1px", textAlign: "center",
          opacity: "0.4", transition: "all 0.2s",
          border: `1px solid ${T.green}`, whiteSpace: "nowrap", flexShrink: "0",
        }, "SUBMIT");
        submitBtn.addEventListener("click", handleSubmit);
        inlineRow.appendChild(submitBtn);
        card.appendChild(inlineRow);
        customInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey && allAnswered()) { e.preventDefault(); handleSubmit(); }
        });
      } else {
        card.appendChild(customInput);
        customInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const nextIdx = idx + 1;
            if (nextIdx < textInputs.length) textInputs[nextIdx]?.focus();
            else if (allAnswered()) handleSubmit();
          }
        });
      }

      if (!isSingle && idx < questions.length - 1) {
        card.appendChild(el("div", { borderTop: `1px dashed ${T.panelBorder}`, margin: "10px 0" }));
      }
    });

    if (!isSingle) {
      submitBtn = el("div", {
        padding: "8px 20px", borderRadius: "4px", cursor: "not-allowed",
        background: T.green, color: "#fff", fontSize: "11px", fontWeight: "bold",
        letterSpacing: "1px", textAlign: "center", marginTop: "12px",
        opacity: "0.4", transition: "all 0.2s", border: `1px solid ${T.green}`,
      }, "SUBMIT");
      submitBtn.addEventListener("click", handleSubmit);
      card.appendChild(submitBtn);
    }

    container.appendChild(card);
    if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;

    if (ttsService?.isEnabled && !ttsService.isMuted) {
      const firstQ = questions[0];
      let ttsMsg = `Sir, ${firstQ.question || firstQ.header || "I have a question for you."}`;
      const optLabels = (firstQ.options || []).map(o => o.label || String(o));
      if (optLabels.length > 0) ttsMsg += ` Options are: ${optLabels.join(", ")}.`;
      ttsService.speak(ttsMsg);
    }
  }

  // ── Completed Interaction Card ──
  function renderCompletedInteractionCard(interaction, container, scrollParent) {
    const card = el("div", { ...cardBaseStyles(), opacity: "0.5", pointerEvents: "none" });

    if (interaction.type === "permission") {
      card.appendChild(makeCardHeader("\u26A1", "TOOL PERMISSION"));
      const toolRow = el("div", { marginBottom: "4px" });
      toolRow.appendChild(el("span", { color: T.textMuted, fontSize: "10px" }, "Tool: "));
      toolRow.appendChild(el("span", { color: T.gold, fontSize: "11px", fontWeight: "bold" }, interaction.tool || "Unknown"));
      card.appendChild(toolRow);

      const input = interaction.input || {};
      if (input.command) {
        card.appendChild(el("div", {
          background: "rgba(0,0,0,0.4)", borderRadius: "4px",
          padding: "6px", marginBottom: "6px", fontSize: "10px",
          color: T.gold, border: `1px solid ${T.panelBorder}`,
          whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "60px", overflow: "auto",
        }, "$ " + (input.command.length > 200 ? input.command.slice(0, 200) + "..." : input.command)));
      }
      if (input.file_path) {
        const fileRow = el("div", { marginBottom: "4px" });
        fileRow.appendChild(el("span", { color: T.textMuted, fontSize: "10px" }, "File: "));
        fileRow.appendChild(el("span", { color: T.text, fontSize: "10px" }, input.file_path.split("/").slice(-2).join("/")));
        card.appendChild(fileRow);
      }

      const decision = interaction.decision || "unknown";
      const badgeColor = decision === "allow" || decision === "allowAlways" ? T.green
        : decision === "deny" ? T.red
        : decision === "auto" ? T.purple
        : T.textMuted;
      const badgeLabel = decision === "allow" ? "ALLOWED"
        : decision === "allowAlways" ? "ALWAYS ALLOWED"
        : decision === "deny" ? "DENIED"
        : decision === "auto" ? "AUTO-APPROVED"
        : decision.toUpperCase();
      card.appendChild(el("div", {
        display: "inline-block", padding: "3px 10px", borderRadius: "3px",
        background: `${badgeColor}22`, color: badgeColor,
        fontSize: "10px", fontWeight: "bold", letterSpacing: "1px",
        marginTop: "6px", border: `1px solid ${badgeColor}44`,
      }, badgeLabel));
    } else if (interaction.type === "question") {
      card.appendChild(makeCardHeader("\uD83D\uDCAC", "INPUT PROVIDED"));
      if (interaction.message) {
        card.appendChild(el("div", {
          color: T.text, fontSize: "11px", marginBottom: "6px",
          fontStyle: "italic", lineHeight: "1.4",
        }, `"${interaction.message}"`));
      }
      const answer = interaction.answer || "\u2014";
      card.appendChild(el("div", {
        display: "inline-block", padding: "3px 10px", borderRadius: "3px",
        background: `${T.green}22`, color: T.green,
        fontSize: "10px", fontWeight: "bold", letterSpacing: "1px",
        marginTop: "4px", border: `1px solid ${T.green}44`,
      }, `ANSWER: ${typeof answer === "string" && answer.length > 80 ? answer.slice(0, 80) + "..." : answer}`));
    } else if (interaction.type === "askuser") {
      card.appendChild(makeCardHeader("\uD83D\uDCAC", "INPUT PROVIDED"));
      const questions = interaction.data?.questions || [];
      questions.forEach((q, idx) => {
        if (q.header) {
          card.appendChild(el("div", {
            color: T.accent, fontSize: "10px", fontWeight: "bold",
            marginTop: idx > 0 ? "6px" : "0", letterSpacing: "1px",
          }, q.header.toUpperCase()));
        }
        const answer = Array.isArray(interaction.answer) ? interaction.answer[idx] : "\u2014";
        card.appendChild(el("div", { color: T.green, fontSize: "11px", marginBottom: "4px" }, `\u2192 ${answer}`));
      });
    }

    container.appendChild(card);
    if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;
  }

  // ── Display-Only Permission Card ──
  function renderDisplayOnlyPermissionCard(toolName, input, container, scrollParent) {
    const card = el("div", { ...cardBaseStyles(), opacity: "0.6", pointerEvents: "none" });
    card.appendChild(makeCardHeader("\u26A1", "TOOL EXECUTED"));

    const toolRow = el("div", { marginBottom: "4px" });
    toolRow.appendChild(el("span", { color: T.textMuted, fontSize: "10px" }, "Tool: "));
    toolRow.appendChild(el("span", { color: T.gold, fontSize: "11px", fontWeight: "bold" }, toolName));
    card.appendChild(toolRow);

    if (input.command) {
      card.appendChild(el("div", {
        background: "rgba(0,0,0,0.4)", borderRadius: "4px",
        padding: "6px", marginBottom: "6px", fontSize: "10px",
        color: T.gold, border: `1px solid ${T.panelBorder}`,
        whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "80px", overflow: "auto",
      }, "$ " + (input.command.length > 300 ? input.command.slice(0, 300) + "..." : input.command)));
    }
    if (input.file_path) {
      const fileRow = el("div", { marginBottom: "4px" });
      fileRow.appendChild(el("span", { color: T.textMuted, fontSize: "10px" }, "File: "));
      fileRow.appendChild(el("span", { color: T.text, fontSize: "10px" }, input.file_path.split("/").slice(-2).join("/")));
      card.appendChild(fileRow);
    }
    if (toolName === "Edit" && input.old_string) {
      const diffBox = el("div", {
        background: "rgba(0,0,0,0.4)", borderRadius: "4px",
        padding: "6px", marginBottom: "6px", fontSize: "10px",
        border: `1px solid ${T.panelBorder}`, maxHeight: "80px", overflow: "auto",
      });
      diffBox.appendChild(el("div", { color: T.red, whiteSpace: "pre-wrap", wordBreak: "break-all" },
        "- " + (input.old_string.length > 150 ? input.old_string.slice(0, 150) + "..." : input.old_string)));
      if (input.new_string) {
        diffBox.appendChild(el("div", { color: T.green, whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: "2px" },
          "+ " + (input.new_string.length > 150 ? input.new_string.slice(0, 150) + "..." : input.new_string)));
      }
      card.appendChild(diffBox);
    }

    card.appendChild(el("div", {
      display: "inline-block", padding: "3px 10px", borderRadius: "3px",
      background: `${T.purple}22`, color: T.purple,
      fontSize: "10px", fontWeight: "bold", letterSpacing: "1px",
      marginTop: "6px", border: `1px solid ${T.purple}44`,
    }, "AUTO-APPROVED"));

    container.appendChild(card);
    if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;
  }

  // ── Display-Only Question Card ──
  function renderDisplayOnlyQuestionCard(input, container, scrollParent) {
    const card = el("div", { ...cardBaseStyles(), opacity: "0.6", pointerEvents: "none" });
    card.appendChild(makeCardHeader("\uD83D\uDCAC", "JARVIS ASKED"));

    const question = input.question || input.message || input.text || "\u2014";
    card.appendChild(el("div", {
      color: T.text, fontSize: "11px", marginBottom: "8px",
      fontStyle: "italic", lineHeight: "1.4",
    }, `"${typeof question === "string" && question.length > 200 ? question.slice(0, 200) + "..." : question}"`));

    card.appendChild(el("div", {
      display: "inline-block", padding: "3px 10px", borderRadius: "3px",
      background: `${T.orange}22`, color: T.orange,
      fontSize: "10px", fontWeight: "bold", letterSpacing: "1px",
      marginTop: "4px", border: `1px solid ${T.orange}44`,
    }, "AUTO-EXECUTED (no interactive card)"));

    container.appendChild(card);
    if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;
  }

  // ── Status Label ──
  function renderStatusLabel(type, text, container, scrollParent, opts) {
    if (!showStatusLabels) return;
    const isReplay = opts && opts.replay;
    const typeConfig = {
      skill:    { icon: "\uD83C\uDFAF", label: "SKILL",    color: T.purple },
      agent:    { icon: "\uD83E\uDD16", label: "AGENT",    color: T.accent },
      tool:     { icon: "\u26A1",       label: "TOOL",     color: T.gold },
      search:   { icon: "\uD83D\uDD0D", label: "SEARCH",   color: T.green },
      thinking: { icon: "\uD83D\uDCAD", label: "THINKING", color: T.textMuted },
    };
    const cfg = typeConfig[type] || typeConfig.tool;

    if (!isReplay) {
      if (onHistoryPush) onHistoryPush({ role: "status", type, label: text || "", timestamp: Date.now() });
    }

    const badge = el("div", {
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "3px 10px", borderRadius: "12px",
      background: `${cfg.color}18`, border: `1px solid ${cfg.color}33`,
      fontSize: "10px", fontFamily: "monospace", lineHeight: "1.4",
    });
    badge.appendChild(el("span", { fontSize: "10px" }, cfg.icon));
    badge.appendChild(el("span", {
      color: cfg.color, fontWeight: "bold", letterSpacing: "1px", textTransform: "uppercase",
    }, cfg.label));
    if (text) {
      badge.appendChild(el("span", { color: T.textMuted, fontSize: "9px" }, "\u00B7"));
      const detail = text.length > 50 ? text.slice(0, 50) + "\u2026" : text;
      badge.appendChild(el("span", { color: T.text, fontSize: "10px", opacity: "0.8" }, detail));
    }

    const lastChild = container.lastChild;
    let row;
    if (lastChild && lastChild.dataset && lastChild.dataset.statusRow) {
      row = lastChild;
    } else {
      row = el("div", { display: "block", marginTop: "6px", marginBottom: "4px" });
      row.dataset.statusRow = "true";
      container.appendChild(row);
    }
    row.appendChild(badge);
    badge.style.marginRight = "6px";
    badge.style.marginBottom = "2px";
    if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;
  }

  // ── Batch submit ──
  function updateBatchSubmitState() {
    if (!batchSubmitBtn || pendingQuestions.size === 0) return;
    const allAnswered = [...pendingQuestions.values()].every(q => q.answered);
    if (allAnswered) {
      batchSubmitBtn.style.opacity = "1";
      batchSubmitBtn.style.cursor = "pointer";
      batchSubmitBtn.style.animation = animOrNone("jarvisSubmitPulse 2s ease-in-out infinite");
    } else {
      batchSubmitBtn.style.opacity = "0.4";
      batchSubmitBtn.style.cursor = "not-allowed";
      batchSubmitBtn.style.animation = "none";
    }
  }

  function handleBatchSubmit() {
    const unanswered = [...pendingQuestions.entries()]
      .filter(([, q]) => !q.answered)
      .map(([, q]) => q.message);
    if (unanswered.length > 0) return;
    pendingQuestions.forEach((q, requestId) => {
      if (sendControlResponse) sendControlResponse(requestId, {
        subtype: "elicitation_complete",
        request_id: requestId,
        response: { selected: q.answer },
      });
      if (onHistoryPush) onHistoryPush({
        role: "question", message: q.message, options: [],
        answer: q.answer, requestId, timestamp: Date.now(),
      });
    });
    if (syncToManager) syncToManager();
    if (batchSubmitContainer) {
      batchSubmitContainer.style.opacity = "0.5";
      batchSubmitContainer.style.pointerEvents = "none";
    }
    pendingQuestions.clear();
    batchSubmitBtn = null;
    batchSubmitContainer = null;
  }

  return {
    renderPermissionCard,
    renderSettingsPermissionCard,
    renderQuestionCard,
    renderAskUserQuestionForm,
    renderCompletedInteractionCard,
    renderDisplayOnlyPermissionCard,
    renderDisplayOnlyQuestionCard,
    renderStatusLabel,
    cardBaseStyles,
    updateBatchSubmitState,
    handleBatchSubmit,
  };
}

return { createCardRenderer };
