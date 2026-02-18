# 🤖 AI in the Devcontainer

## Getting Started

Github copilot needs no introduction.

```bash
curl -fsSL https://gh.io/copilot-install | bash;
${HOME}/.local/bin/copilot --yolo
```

## Useful Commands

| Command          | Description                                                           |
| ---------------- | --------------------------------------------------------------------- |
| `/yolo`          | Enable all permissions (tools, paths, URLs) — no confirmation prompts |
| `/model`         | Switch between available models (e.g. Claude Sonnet 4.5, GPT-5)       |
| `/plan <prompt>` | Create an implementation plan before coding                           |
| `/review`        | Run code review agent to analyze your changes                         |
| `/diff`          | Review changes made in the current directory                          |
| `/compact`       | Summarize conversation to reduce context window usage                 |
| `/clear`         | Clear conversation history and start fresh                            |
| `/context`       | Show context window token usage                                       |

## Tips

- **Mention files** with `@` to include their contents in context (e.g. `@src/main.ts`)
- **Run shell commands** directly with `!` prefix (e.g. `!git status`)
- **Press `Shift+Tab`** to cycle through modes (including experimental Autopilot mode)
- **Press `Ctrl+O`** (with empty input) to expand recent timeline
- Launch with `copilot --yolo` to start with all permissions pre-approved
