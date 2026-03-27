---
name: status
description: >
  Show current channel setup status — token, access policy, allowed users, groups.
  Use when checking if a channel is configured correctly.
  Triggers: "channel status", "show config", "what's configured", "check setup".
user-invocable: true
allowed-tools:
  - Read
  - Bash(ls *)
---

# /channel-setup:status — Channel Configuration Status

Read and display the current state of all configured channels. This is read-only — no changes are made.

## Steps

1. **List configured channels:**
   ```bash
   ls -d ~/.claude/channels/discord* ~/.claude/channels/telegram* 2>/dev/null
   ```

   If nothing found: "No channels configured. Run `/channel-setup:setup` to get started."

2. **For each channel directory found:**

   a. **Token status** — Read `<dir>/.env`:
   - File exists → "Token: ✓ configured"
   - File missing → "Token: ✗ not found"
   - Do NOT display the actual token value

   b. **Access config** — Read `<dir>/access.json`:
   If file exists, extract and display:
   ```
   === Discord [profile] ===
   Token:            ✓ configured
   DM Policy:        pairing
   Allowed Users:    2
   Groups:           1 channel(s)
     - #channel-name (1234567890) requireMention: true
   Mention Patterns: ["<@BOT_ID>"]
   Pending Pairs:    0
   Delivery:         ackReaction: 👀, replyToMode: first
   ```

   If file missing:
   ```
   === Discord ===
   Token:            ✓ configured
   Access Config:    ✗ not configured (default pairing mode)
   ```

3. **Tool permissions:**
   Read `~/.claude/settings.json`. Check for each channel's permission pattern:
   - Discord: `mcp__plugin_discord_discord__*`
   - Telegram: `mcp__plugin_telegram_telegram__*`

   Show: "Tool Permissions: ✓ discord" or "Tool Permissions: ✗ discord (not configured)"

4. **Profile summary** (if multiple profiles detected):
   ```
   Profiles:
     default  → ~/.claude/channels/discord/
     frontend → ~/.claude/channels/discord-frontend/
     backend  → ~/.claude/channels/discord-backend/
   ```

5. **Quick actions** if issues detected:
   - No token → "Run `/channel-setup:setup` to configure"
   - pairing with empty allowFrom → "DM the bot to start pairing, or run `/channel-setup:setup`"
   - No tool permissions → "Run `/channel-setup:setup` and enable auto-allow"
   - No access.json → "Run `/channel-setup:setup` to configure server channels"
