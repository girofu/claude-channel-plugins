---
name: verify
description: >
  Verify channel setup is correct — token validity, bot presence, access config format, tool permissions.
  Use when checking if everything is properly configured after setup.
  Triggers: "verify setup", "check config", "is it working", "verify channel", "test setup".
user-invocable: true
allowed-tools:
  - Read
  - Bash(curl *)
  - Bash(chmod *)
  - Bash(ls *)
  - Bash(uname *)
---

# /channel-setup:verify — Verify Channel Configuration

Run a comprehensive verification of the channel setup. Check each item and report pass/fail.

## Step 1: Detect Channels

```bash
ls -d ~/.claude/channels/discord*
```

If no directories found: "❌ No Discord channel configured. Run `/channel-setup:setup` first."

For each found directory (discord, discord-frontend, etc.), run all checks below.

## Step 2: Run 6-Point Checklist

### Check 1: Token Validity

Read the token from `<dir>/.env` (extract value after `DISCORD_BOT_TOKEN=`).

If no `.env` file:
- ❌ Token not found → "Run `/channel-setup:setup` to configure"

If token found, validate:
```bash
TOKEN="<token>" curl -sS -w "\n%{http_code}" -H "Authorization: Bot $TOKEN" https://discord.com/api/v10/users/@me
```

- ✅ 200 → "Token valid (bot: @username#discriminator)"
- ❌ 401 → "Token invalid or expired → reconfigure with `/channel-setup:setup`"
- ❌ Other → "Cannot reach Discord API → check network"

### Check 2: Bot Server Presence (Discord only)

```bash
TOKEN="<token>" curl -sS -H "Authorization: Bot $TOKEN" https://discord.com/api/v10/users/@me/guilds
```

- ✅ Array with entries → "Bot in N server(s)"
- ❌ Empty array → "Bot not in any server → use invite URL to add"
- ❌ Error → "Cannot fetch servers"

### Check 3: access.json Format

Read `<dir>/access.json`. If file doesn't exist:
- ⚠️ "No access.json — bot will use default pairing mode (DM only)"

If file exists, validate:
- `dmPolicy` is one of: "pairing", "allowlist", "disabled"
- `allowFrom` is an array (even if empty)
- `groups` is an object; each entry has `requireMention` (boolean) and `allowFrom` (array)
- `mentionPatterns` (if present) is a string array

Report any missing or malformed fields:
- ✅ "access.json format correct"
- ❌ "Malformed: [specific field] is [problem]"

### Check 4: Access Policy Logic

Detect common misconfigurations:
- ❌ `dmPolicy: "allowlist"` but `allowFrom: []` → "No one can DM the bot! Add users or switch to pairing."
- ⚠️ `dmPolicy: "pairing"` with empty `allowFrom` → "Normal — DM the bot to start pairing after launch."
- ⚠️ `groups` is empty → "DM-only mode — bot won't respond in server channels."

If token validation passed (Check 1) and groups are configured, optionally verify
channel IDs still exist in the guild:
```bash
TOKEN="<token>" curl -sS -H "Authorization: Bot $TOKEN" https://discord.com/api/v10/guilds/<guild_id>/channels
```
- ❌ Channel ID not found in guild → "Channel <id> may have been deleted"

### Check 5: Tool Permissions

Read `~/.claude/settings.json`.

Check if `permissions.allow` array contains `"mcp__plugin_discord_discord__*"`:
- ✅ "Tool permissions configured"
- ❌ "Missing — each message will require manual terminal approval. Add with `/channel-setup:setup` or manually."

### Check 6: File Permissions

```bash
ls -la <dir>/.env
```

Check file permissions:
- ✅ `-rw-------` (600) → ".env permissions correct"
- ⚠️ Other permissions → auto-fix:
  ```bash
  chmod 600 <dir>/.env
  ```
  "⚠️ Fixed .env permissions to 600"

## Step 3: Summary

Display results as a checklist:
```
=== Channel Verification: Discord [profile_name] ===
[✅] Token valid (bot: @mybot#1234)
[✅] Bot in 1 server(s)
[✅] access.json format correct
[⚠️] dmPolicy: pairing, no users yet — DM bot to pair
[✅] Tool permissions configured
[✅] .env permissions correct (600)

Result: 5/6 passed, 1 warning
```

If all checks pass:
> "Setup is complete! Start with: `claude --channels plugin:discord@claude-plugins-official`"

If profile exists, show the profile-specific launch command:
> "Start with: `DISCORD_STATE_DIR=<dir> claude --channels plugin:discord@claude-plugins-official`"

If any fail: show specific fix instructions for each failure.
