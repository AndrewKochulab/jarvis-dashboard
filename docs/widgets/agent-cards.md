# Agent Cards Widget

## Purpose

Displays visual status cards for each AI agent defined in the agent registry. Shows agent name, role, skills, and live status (active/standby/offline), updated in real-time by the Live Sessions widget.

## Configuration

```json
{
  "widgets": {
    "agentCards": {
      "registryPath": "src/config/Jarvis-Registry"
    }
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `registryPath` | string | `"src/config/Jarvis-Registry"` | Path to agent registry markdown file |

## Agent Registry Format

Agents are defined in `src/config/Jarvis-Registry.md` using YAML frontmatter:

```yaml
---
agents:
  - name: "JARVIS"
    role: "Primary AI Assistant"
    color: "#00d4ff"
    icon: "◆"
    skills: ["code-review", "refactoring", "debugging"]
    status: "active"
  - name: "FRIDAY"
    role: "Data Analyst"
    color: "#7c6bff"
    icon: "◇"
    skills: ["data-analysis", "visualization"]
    status: "standby"
---
```

## UI Components

### Agent Card (`ui/agent-card.js`)
- Robot avatar with configurable color
- Agent name and role
- Status indicator dot (green = active, yellow = standby, gray = offline)
- Skill tags
- Hover glow effect

### Robot Avatar (`ui/robot-avatar.js`)
- SVG robot icon
- Colored to match the agent's theme color
- Animated eyes on hover

## Cross-Widget Communication

Agent Cards registers DOM references in `ctx.agentCardRefs`:

```js
ctx.agentCardRefs.set("JARVIS", {
  card: cardElement,
  statusDot: dotElement,
  statusText: textElement
});
```

The Live Sessions widget updates these refs when it detects an agent is active in a session.

## Layout

```json
{ "type": "agent-cards" }
```

Displays in a responsive grid: 3 columns (wide), 1 column (narrow).

## Source

- `src/widgets/agent-cards/index.js`
- `src/widgets/agent-cards/ui/agent-card.js`
- `src/widgets/agent-cards/ui/robot-avatar.js`
