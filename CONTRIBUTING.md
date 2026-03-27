# Contributing to claude-channel-plugins

Thank you for your interest in contributing!

## How It Works

This repo is a Claude Code plugin marketplace. The plugin's functionality lives entirely in `skills/` — each skill is a `SKILL.md` file that Claude Code reads and follows as instructions.

There is no build step. No compiled code. Just markdown.

## Adding or Editing a Skill

1. **Fork** the repository
2. **Create a branch** from `main`
3. **Edit** the skill in `skills/<name>/SKILL.md`
4. **Test** by installing the plugin locally:
   ```bash
   /plugin install /path/to/your/clone
   ```
5. **Submit a PR** with a clear description of what changed and why

## Adding a New Skill

1. Create `skills/<name>/SKILL.md` with YAML frontmatter:
   ```yaml
   ---
   name: my-skill
   description: >
     What this skill does and when to trigger it.
   user-invocable: true
   allowed-tools:
     - Read
     - Write
     - Bash(curl *)
   ---
   ```
2. Write the skill instructions in markdown
3. Update `plugin.json` if the skill needs new metadata
4. Update `README.md` to list the new skill

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New skill or feature
- `fix:` Bug fix in skill instructions
- `docs:` Documentation updates
- `chore:` Maintenance

## Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md). Include:
- Your Claude Code version
- Which skill you were using
- What you expected vs what happened

## Questions?

Open an [issue](https://github.com/girofu/claude-channel-plugins/issues).
