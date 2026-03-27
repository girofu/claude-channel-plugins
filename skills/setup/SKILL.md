---
name: setup
description: >
  Interactive setup wizard for Discord & Telegram channels.
  Use when the user wants to set up a new channel bot,
  configure server channels, or manage allowed users.
  Triggers: "set up discord", "configure telegram", "channel setup",
  "connect bot", "set up channels".
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash(curl *)
  - Bash(chmod *)
  - Bash(mkdir *)
  - Bash(ls *)
  - Bash(open *)
  - Bash(xdg-open *)
  - Bash(cat *)
  - Bash(cp *)
  - Bash(bun --version)
  - Bash(uname *)
---

# /channel-setup:setup — Channel Setup Wizard

You are guiding the user through setting up a Discord channel for Claude Code.
Follow these phases in order. At each step, explain what you're doing and ask for input.

**Important**: All file operations use Read/Write tools directly. All API calls use Bash(curl).
Never call external scripts.

---

## Phase 1: Environment Detection + Profile Selection

1. Check for existing channel configurations:
   ```bash
   ls -la ~/.claude/channels/ 2>/dev/null
   ```
   Scan for `discord`, `discord-*` directories. If profiles exist, list them:
   > "Found existing profiles: default, frontend, backend"

2. Check Bun is installed (required by official channel plugin):
   ```bash
   bun --version
   ```
   - If not installed: warn "Official channel plugin requires Bun (https://bun.sh). Please install it before launching."
   - If installed: continue silently.

3. Detect platform for browser opening later:
   ```bash
   uname -s
   ```
   Remember: Darwin = macOS (`open`), Linux = (`xdg-open`), other = show URL only.

4. Ask the user:
   > "Create a separate profile? (for multi-bot / multi-session setups)"
   - **No** (default): use `~/.claude/channels/discord/`
   - **Yes**: ask for profile name (only `[a-z0-9-]` allowed), use `~/.claude/channels/discord-<profile>/`

5. Check the target directory for existing config:
   - Has `.env` + `access.json` → show summary, ask: modify or start fresh?
   - Has `.env` but no `access.json` → resume from Phase 3 (token already saved)
   - Has `.env` + `access.json` + tool permissions → show status, ask: modify?
   - Empty → proceed to Phase 2

---

## Phase 2: Token Setup

Show the user these manual steps:

> **Create a Discord Bot (manual steps):**
> 1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
> 2. Click **New Application** → name it → Create
> 3. Left menu → **Bot** → set username → **Reset Token** → copy the token
> 4. Same page below → **Privileged Gateway Intents** → enable **Message Content Intent**

Ask the user to paste their bot token. Once received:

**Trim whitespace** from the token, then validate:

```bash
TOKEN="<pasted_token>" curl -sS -w "\n%{http_code}" -H "Authorization: Bot $TOKEN" https://discord.com/api/v10/users/@me
```

Parse the response:
- Last line = HTTP status code
- **200**: Parse JSON body → extract `id`, `username`, `discriminator`. Show:
  > "✅ Token verified (bot: username#discriminator, ID: 123456)"
  Save the bot ID for later use.
- **401**: "❌ Token invalid. Please check and try again." Ask to re-enter.
- **429**: "⚠️ Rate limited by Discord. Waiting..." Read `Retry-After` header, wait, retry once.
- **Other / non-JSON response**: "❌ Unexpected response from Discord API. Check your network."

**Save the token:**

```bash
mkdir -p <profile_dir>
```

Write the `.env` file:
- Default profile: `~/.claude/channels/discord/.env`
  ```
  DISCORD_BOT_TOKEN=<token>
  ```
- Named profile (e.g. "frontend"): `~/.claude/channels/discord-frontend/.env`
  ```
  DISCORD_BOT_TOKEN=<token>
  DISCORD_STATE_DIR=/Users/<user>/.claude/channels/discord-frontend
  ```

Then set permissions:
```bash
chmod 600 <profile_dir>/.env
```

---

## Phase 3: Invite & Server/Channel Setup

### 3a. Invite URL

Compute the permission integer:
```
274878008384 = VIEW_CHANNELS(1024) | SEND_MESSAGES(2048)
             | SEND_MESSAGES_IN_THREADS(274877906944)
             | READ_MESSAGE_HISTORY(65536) | ATTACH_FILES(32768)
             | ADD_REACTIONS(64)
```

Build the invite URL:
```
https://discord.com/oauth2/authorize?client_id=<BOT_ID>&scope=bot&permissions=274878008384
```

Display the URL and **automatically open the browser** (no asking):
- macOS: `open "<url>"`
- Linux: `xdg-open "<url>"`
- Other: just display the URL

Also display the URL as text so the user can copy it if the browser didn't open.

Ask: "Has the bot joined your server?"

### 3b. Select Server

```bash
TOKEN="<token>" curl -sS -H "Authorization: Bot $TOKEN" https://discord.com/api/v10/users/@me/guilds
```

Parse the JSON array. Display as a numbered list:
```
1. My Server (ID: 123456789)
2. Test Server (ID: 987654321)
```

- If empty: "❌ Bot hasn't joined any server. Please use the invite URL above."
- If 403: "❌ Bot lacks permissions. Please re-invite with the URL above."

Ask the user to pick a server (by number).

### 3c. Select Channels

```bash
TOKEN="<token>" curl -sS -H "Authorization: Bot $TOKEN" https://discord.com/api/v10/guilds/<GUILD_ID>/channels
```

Parse the JSON array:
- Filter type=4 (GUILD_CATEGORY) → build category name map
- Filter type=0 (GUILD_TEXT) → text channels only
- Sort by `position`
- Display as numbered list with category names:
  ```
  1. #general         [General]
  2. #dev             [Development]
  3. #bot-commands    [Bot]
  ```

Ask: "Select channels to enable (comma-separated numbers, e.g. 1,3):"

- If user selects 0 channels: ask "Use DM-only mode? (bot only responds to direct messages)"
- Deduplicate selected channel IDs

### 3d. Mention Setting

Ask: "Require @mention to respond? (recommended for shared channels)"
- Default: Yes

### 3e. DM Access Policy

Ask: "How should the bot handle DMs?"
- **A) Pairing mode** (default) — unknown senders get a 6-char pairing code
- **B) Enter User ID directly** — for advanced users (switch to allowlist mode)
  - Show hint: "Discord: Settings → Advanced → Developer Mode → right-click name → Copy User ID"
  - Accept comma-separated IDs (must be numeric)
- **C) Disable DMs** — bot only responds in server channels (set dmPolicy to "disabled")
- **D) Skip** — keep pairing default

### 3f. Write access.json

Read existing `access.json` from the profile directory (if it exists) to preserve any
extra fields (ackReaction, replyToMode, etc.) the official plugin may have set.

Build the access config object:
```json
{
  "dmPolicy": "<chosen_policy>",
  "allowFrom": ["<user_ids_if_any>"],
  "groups": {
    "<channel_id>": {
      "requireMention": true,
      "allowFrom": []
    }
  },
  "pending": {},
  "mentionPatterns": ["<@BOT_ID>"]
}
```

If existing access.json had extra fields, merge them into the new object (preserve
ackReaction, replyToMode, textChunkLimit, chunkMode, userLabels).

Write the merged object to `<profile_dir>/access.json`.

---

## Phase 4: Tool Permissions

Backup settings.json first:
```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak 2>/dev/null
```

Read `~/.claude/settings.json`. If it doesn't exist, start with `{}`.

Check if `permissions.allow` array contains `"mcp__plugin_discord_discord__*"`.

If not present:
- Add it to the `permissions.allow` array (create the array if needed)
- Write the updated settings.json (preserve ALL existing fields)
- Verify by re-reading the file

If the write produces invalid JSON, restore from backup:
```bash
cp ~/.claude/settings.json.bak ~/.claude/settings.json
```

Tell the user: "✅ Tool permissions added to ~/.claude/settings.json"

---

## Phase 5: Completion Summary

Display the final summary:

### Plugin Install
```
/plugin install discord@claude-plugins-official
```
If not found: `/plugin marketplace add anthropics/claude-plugins-official`
After install: `/reload-plugins`

Alternatively, the official configure command also works:
```
/discord:configure <TOKEN>
```

### Launch Command
- Default profile:
  ```
  claude --channels plugin:discord@claude-plugins-official
  ```
- Named profile (e.g. "frontend"):
  ```
  DISCORD_STATE_DIR=~/.claude/channels/discord-frontend claude --channels plugin:discord@claude-plugins-official
  ```

### Next Steps (based on DM policy)

**If pairing mode:**
1. DM the bot on Discord (you must share at least one server to DM)
2. The bot replies with a pairing code
3. In Claude Code, run: `/channel-setup:access pair <code>`
   - This command scans ALL profiles automatically — no need to specify which one
   - Alternatively: `/discord:access pair <code>` (only works for default profile)
4. Lock down access: `/channel-setup:access policy allowlist --profile <name>`

**If allowlist mode:**
- Send a message in the configured channel or DM the bot

**If disabled:**
- Send a message in the configured server channel (DMs are disabled)

### Notes
- **Team/Enterprise users**: ensure `channelsEnabled` is enabled by your admin
  (claude.ai → Admin settings → Claude Code → Channels)
- **Permission Relay** (v2.1.81+): Claude forwards tool approval prompts to your DM.
  Reply "yes \<code>" or "no \<code>" to approve/deny remotely.
  Both terminal and remote work — first answer wins.

### Official Plugin MCP Tools
reply, react, edit_message, fetch_messages, download_attachment
