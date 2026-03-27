---
name: reset
description: >
  Reset a channel's configuration with automatic backup.
  Use when starting over with a channel setup.
  Triggers: "reset channel", "start over", "clear config", "reset discord", "reset telegram".
user-invocable: true
allowed-tools:
  - Read
  - Bash(ls *)
  - Bash(mkdir *)
  - Bash(cp *)
  - Bash(rm ~/.claude/channels/*)
---

# /channel-setup:reset — Reset Channel Configuration

Reset a channel's configuration. Automatically backs up before deleting.

## Steps

### 1. List Available Channels

```bash
ls -d ~/.claude/channels/discord* ~/.claude/channels/telegram*
```

If nothing found: "No channels configured. Nothing to reset."

Show the list and ask which channel/profile to reset (e.g. "discord", "discord-frontend").

### 2. Show What Will Be Removed

Read and display the contents that will be deleted:

- `.env` — bot token
- `access.json` — DM policy, groups, allowed users, pending pairs
- `approved/` directory — pairing approval files

Show a summary:
```
Will reset: ~/.claude/channels/discord-frontend/
  - .env (bot token)
  - access.json (2 groups, 1 allowed user, pairing mode)
  - approved/ (0 files)
```

### 3. Confirm

Ask the user to confirm: "Reset this channel? A backup will be created first."

If they decline: "Cancelled. No changes made."

### 4. Create Backup

```bash
mkdir -p ~/.claude/channels/<channel>/backup-$(date +%Y%m%d-%H%M%S)
```

```bash
cp ~/.claude/channels/<channel>/.env ~/.claude/channels/<channel>/backup-<timestamp>/
cp ~/.claude/channels/<channel>/access.json ~/.claude/channels/<channel>/backup-<timestamp>/
```

Tell the user: "Backup saved to ~/.claude/channels/<channel>/backup-<timestamp>/"

### 5. Remove Config Files

```bash
rm -f ~/.claude/channels/<channel>/.env
rm -f ~/.claude/channels/<channel>/access.json
rm -rf ~/.claude/channels/<channel>/approved/
```

### 6. Confirm Reset

> "✅ Channel reset complete."
> "Backup at: ~/.claude/channels/<channel>/backup-<timestamp>/"
> "To reconfigure, run `/channel-setup:setup`"
