// Capture Input — Textarea with focus styling
// Returns: { createCaptureInput }

const { T, isNarrow } = ctx;

function createCaptureInput(placeholder) {
  const input = document.createElement("textarea");
  Object.assign(input.style, {
    width: "100%", minHeight: isNarrow ? "80px" : "100px", flex: "1",
    background: "rgba(0,0,0,0.3)", border: `1px solid ${T.panelBorder}`,
    borderRadius: "8px", padding: "12px", color: T.text,
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontSize: "13px", lineHeight: "1.6", resize: "vertical",
    outline: "none", boxSizing: "border-box", transition: "border-color 0.3s",
  });
  input.placeholder = placeholder || "Capture a thought...";
  input.addEventListener("focus", () => { input.style.borderColor = T.purple + "66"; });
  input.addEventListener("blur", () => { input.style.borderColor = T.panelBorder; });

  function getValue() { return input.value; }
  function setValue(v) { input.value = v; }
  function clear() { input.value = ""; }

  return { el: { input }, getValue, setValue, clear };
}

return { createCaptureInput };
