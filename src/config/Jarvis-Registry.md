---
agents:
  - name: dev-assistant
    displayName: Dev Assistant
    model: sonnet
    color: "#00d4ff"
    location: vault
    configPath: .claude/agents/dev-assistant.md
    description: "General-purpose development helper for coding, debugging, and code review tasks across any project."
    skills:
      - code-review
      - refactoring
    command: /dev
    memoryDate: 2025-01-15

  - name: research-expert
    displayName: Research Expert
    model: opus
    color: "#7c6bff"
    location: vault
    configPath: .claude/agents/research-expert.md
    description: "Deep research and analysis agent for exploring topics, summarizing findings, and creating structured knowledge notes."
    skills:
      - deep-research
    command: /research
    memoryDate: 2025-01-10

  - name: docs-writer
    displayName: Docs Writer
    model: sonnet
    color: "#44c98f"
    location: vault
    configPath: .claude/agents/docs-writer.md
    description: "Documentation and technical writing agent for creating READMEs, guides, API docs, and architecture decision records."
    skills:
      - doc-generation
    command: /docs
    memoryDate: 2025-01-12
---

# Jarvis Agent Registry

This file defines the agents displayed on the Jarvis Dashboard. The dashboard reads the YAML frontmatter above to render agent cards with status, skills, and robot avatars.

## How to Add an Agent

Add a new entry to the `agents` array in the YAML frontmatter above. Each agent requires the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier (slug). Used internally for matching and robot avatar generation. |
| `displayName` | string | Yes | Human-readable name shown on the card. |
| `model` | string | Yes | AI model used: `opus`, `sonnet`, or `haiku`. Displayed as a badge. |
| `color` | string | Yes | Hex color code for the card accent and robot avatar (e.g., `"#00d4ff"`). |
| `location` | string | Yes | Where the agent config lives: `vault` (inside vault) or `global` (`~/.claude/`). |
| `configPath` | string | Yes | Path to the agent's config file. Relative to vault root if `vault`, absolute if `global`. |
| `description` | string | Yes | Short description of the agent's capabilities. Shown on the card. |
| `skills` | list | No | List of skill names this agent uses. Displayed as pills on the card. |
| `command` | string | No | Slash command to invoke this agent (e.g., `/dev`). |
| `memoryDate` | string | No | Last memory update date (`YYYY-MM-DD`). Shows freshness on the card. |

## Example: Adding a Custom Agent

```yaml
  - name: my-agent
    displayName: My Custom Agent
    model: opus
    color: "#ff6b35"
    location: vault
    configPath: .claude/agents/my-agent.md
    description: "A custom agent for my specific workflow."
    skills:
      - skill-one
      - skill-two
    command: /myagent
    memoryDate: 2025-01-20
```

## Robot Avatar Styles

Each agent gets a unique animated robot avatar on the dashboard. The avatar style is automatically determined by the agent's `name` field. The robot's color matches the agent's `color` field. When an agent is actively working (detected via live session monitoring), its robot shows a breathing animation with an orbiting glow ring.

## Live Status Detection

The dashboard monitors Claude Code session transcripts to detect which agents are currently active. When a session invokes an agent (via the `Agent` tool or a `Skill` mapped to this registry), the corresponding card switches from "Available" to "Working" with enhanced animations.
