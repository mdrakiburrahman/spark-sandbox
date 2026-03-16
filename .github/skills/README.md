# Skills 🛠️

[[_TOC_]]

Each skill provides structured instructions for common development workflows.

## 📄 References

- [The Complete Guide to Building Skills](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf)
- [Ralph Wiggum as a "software engineer"](https://ghuntley.com/ralph/)

## 💬 Human-in-the-loop

For regular tasks that requires back-and-forth design discussions - use `/fleet`.

Example:

```bash
# Bootstrap the env
npx nx run spark-scala:init

/fleet @//workspaces/spark-sandbox/.github/skills/whatever-skill/skill.md
```

## 🔁 Ralph Loop

![*Chuckles*](.imgs/ralph.gif)

### How to

We run a skill autonomously in a loop (re-invoking Copilot until the task is complete).

This is a Ralph loop.

It allows the Agent to make simple-but-useful changes until a desired state is reached.

> Certain skills may require local dev env pre-reqs, such as [playwright](https://playwright.dev/):

#### Local dev-env pre-reqs

```powershell
$GIT_ROOT = git rev-parse --show-toplevel
Set-Location $GIT_ROOT

npm install
npm install playwright @playwright/browser-chromium --no-save
```

> Note that the Windows Playwright quality is **significantly** superior to Linux as Windows has your auth context.

You can use the [Playwright MCP](https://github.com/microsoft/playwright-mcp) in Linux devcontainer as well, but it runs in a headless mode and has no access to the user's credentials, to do that, run:

```bash
npx playwright install msedge
```

#### Start Ralph

Then fire:

```bash
cd $(git rev-parse --show-toplevel)
npx tsx tools/scripts/ralph.ts .github/skills/ralph-spark-scala/skill.md -n 10
```

All Ralph skills should be constructed with skippability in mind (e.g. Step 1 - N).

This allows you to guide Ralph towards skipping easier/faster tests if you're confident it already worked:

```bash
cd $(git rev-parse --show-toplevel)
npx tsx tools/scripts/ralph.ts .github/skills/ralph-spark-scala/skill.md -n 10 --skip-to "Do Step 1-3 only and skip Step 4"
npx tsx tools/scripts/ralph.ts .github/skills/ralph-spark-scala/skill.md -n 10 --skip-to "Do Step 4+, since 1-3 was done already"
```

> 💡 The other alternative is to split the skills apart, this is difficult since there might be duplicate context in each.

---

[Home](../../README.md) > [Skills](./)
