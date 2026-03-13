// Robot Avatar Builder
// Procedural robot face with antenna, head variants, eye variants, mouth, neck
// Returns: { createRobotAvatar }

const { el, T, animationsEnabled } = ctx;

function createRobotAvatar(agentName, color) {
  const robotWrap = el("div", {
    width: "56px", height: "64px", position: "relative",
    animation: animationsEnabled ? "jarvisBreathing 2.5s ease-in-out infinite" : "none",
    flexShrink: "0",
    willChange: animationsEnabled ? "transform" : "auto",
  });

  // Antenna
  robotWrap.appendChild(el("div", {
    position: "absolute", top: "0", left: "50%", transform: "translateX(-50%)",
    width: "2px", height: "10px", background: color, borderRadius: "1px",
  }));

  robotWrap.appendChild(el("div", {
    position: "absolute", top: "-3px", left: "50%", transform: "translateX(-50%)",
    width: "6px", height: "6px", borderRadius: "50%", background: color,
    boxShadow: `0 0 6px ${color}, 0 0 12px ${color}`,
  }));

  // Head
  const nameHash = agentName.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const headStyle = nameHash % 3;
  const headRadius = headStyle === 0 ? "14px" : headStyle === 1 ? "8px" : "12px 8px";

  const head = el("div", {
    position: "absolute", top: "10px", left: "50%", transform: "translateX(-50%)",
    width: "48px", height: "38px", border: `2px solid ${color}`,
    borderRadius: headRadius, background: "rgba(0,0,0,0.4)",
    boxShadow: `inset 0 0 12px rgba(0,0,0,0.5), 0 0 8px ${color}33`,
    overflow: "hidden",
  });
  robotWrap.appendChild(head);

  // Eyes - style based on name hash
  const eyeStyle = nameHash % 3;
  if (eyeStyle === 0) {
    // Visor style
    const visor = el("div", {
      position: "absolute", top: "12px", left: "6px", right: "6px",
      height: "10px", background: `linear-gradient(90deg, ${color}, ${color}aa, ${color})`,
      borderRadius: "3px", boxShadow: `0 0 8px ${color}, 0 0 16px ${color}66`,
    });
    head.appendChild(visor);
    for (let i = 1; i <= 2; i++) {
      visor.appendChild(el("div", {
        position: "absolute", top: "0", left: `${i * 33}%`,
        width: "1px", height: "100%", background: "rgba(0,0,0,0.3)",
      }));
    }
  } else if (eyeStyle === 1) {
    // Lens style
    const lens = el("div", {
      position: "absolute", top: "8px", left: "50%", transform: "translateX(-50%)",
      width: "18px", height: "18px", borderRadius: "50%",
      border: `2px solid ${color}`,
      background: "radial-gradient(circle, " + color + "44, transparent)",
      boxShadow: `0 0 6px ${color}, 0 0 12px ${color}, 0 0 20px ${color}`,
      animation: animationsEnabled ? "jarvisEyeGlow 2s ease-in-out infinite" : "none",
      willChange: animationsEnabled ? "opacity" : "auto",
      color: color,
    });
    head.appendChild(lens);
    lens.appendChild(el("div", {
      position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
      width: "6px", height: "6px", borderRadius: "50%",
      background: color, boxShadow: `0 0 4px ${color}`,
    }));
  } else {
    // Dual dot eyes
    head.appendChild(el("div", {
      position: "absolute", top: "10px", left: "10px",
      width: "8px", height: "8px", borderRadius: "50%", background: color,
      boxShadow: `0 0 6px ${color}, 0 0 12px ${color}66`,
      animation: animationsEnabled ? "jarvisEyeGlow 2.5s ease-in-out infinite" : "none",
      willChange: animationsEnabled ? "opacity" : "auto",
      color: color,
    }));
    head.appendChild(el("div", {
      position: "absolute", top: "10px", right: "10px",
      width: "8px", height: "8px", borderRadius: "50%", background: color,
      boxShadow: `0 0 6px ${color}, 0 0 12px ${color}66`,
      animation: animationsEnabled ? "jarvisEyeGlow 2.5s ease-in-out infinite 0.3s" : "none",
      willChange: animationsEnabled ? "opacity" : "auto",
      color: color,
    }));
  }

  // Mouth
  const mouth = el("div", {
    position: "absolute", bottom: "6px", left: "50%", transform: "translateX(-50%)",
    width: "20px", display: "flex", flexDirection: "column", gap: "2px", alignItems: "center",
  });
  head.appendChild(mouth);
  for (let i = 0; i < 3; i++) {
    mouth.appendChild(el("div", {
      width: `${20 - i * 4}px`, height: "1px",
      background: color + "66", borderRadius: "1px",
    }));
  }

  // Neck
  robotWrap.appendChild(el("div", {
    position: "absolute", bottom: "4px", left: "50%", transform: "translateX(-50%)",
    width: "12px", height: "6px", background: color + "33",
    borderRadius: "0 0 3px 3px",
    borderLeft: `1px solid ${color}44`, borderRight: `1px solid ${color}44`,
    borderBottom: `1px solid ${color}44`,
  }));

  return robotWrap;
}

return { createRobotAvatar };
