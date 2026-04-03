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
Follow these phases in order. At each step, explain what you're doing and present numbered options.
**Rule**: Always use numbered options for user choices. Only use open-ended questions when free-text input is required (e.g., token, profile name, user IDs).

**Important**: All file operations use Read/Write tools directly. All API calls use Bash(curl).
Never call external scripts.

---

## Phase 1: Environment Detection + Profile Selection

1. Check for existing channel configurations:
   ```bash
   ls -la ~/.claude/channels/
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

4. Ask the user about profile selection. Display the following:

   > **Profile 選擇**
   >
   > Profile 是一組獨立的 bot 設定（token + 頻道 + 權限）。
   > 每個 profile 對應一個 Discord bot，可以同時運行多個。
   >
   > 請選擇：
   > 1. **使用預設 profile**（推薦，適合只有一個 bot）
   >    → 設定存放在 `~/.claude/channels/discord/`
   > 2. **建立新的具名 profile**（適合多個 bot 或多個用途）
   >    → 需要提供名稱，例如 `frontend`、`team-bot`
   >    → 設定存放在 `~/.claude/channels/discord-<名稱>/`

   If existing profiles were found in step 1, also show:
   > 3. **修改現有 profile** → 列出已有的 profile 名稱讓使用者選擇

   Wait for the user to reply with a number (1/2/3) or a profile name.
   - **1** or "no" or "預設": use `~/.claude/channels/discord/`
   - **2** or "yes": ask for profile name (only `[a-z0-9-]` allowed), use `~/.claude/channels/discord-<profile>/`
   - **3** or a profile name: use the selected existing profile directory

5. Check the target directory for existing config:
   - Has `.env` + `access.json` → show summary, then display:
     > **已有設定，請選擇：**
     > 1. **修改現有設定** — 保留 token，重新設定頻道與權限
     > 2. **從頭開始** — 清除所有設定，重新輸入 token
     > 3. **取消** — 不做任何變更
   - Has `.env` but no `access.json` → resume from Phase 3 (token already saved)
   - Has `.env` + `access.json` + tool permissions → show status, then display:
     > **設定已完成，請選擇：**
     > 1. **修改設定** — 重新設定頻道與權限
     > 2. **查看啟動指令** — 跳到 Phase 5 顯示啟動方式
     > 3. **取消** — 不做任何變更
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
- **401**: Display:
  > ❌ Token 無效，請選擇：
  > 1. **重新輸入 token**
  > 2. **取消設定**
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

Display:
> **Bot 邀請完成了嗎？**
> 1. **已加入** — 繼續設定
> 2. **遇到問題** — 顯示疑難排解

If user selects 2, show common issues (permissions, OAuth2 scope) and re-display the invite URL.

### 3b. Select Server

```bash
TOKEN="<token>" curl -sS -H "Authorization: Bot $TOKEN" https://discord.com/api/v10/users/@me/guilds
```

Parse the JSON array. Display as a numbered list:
```
1. My Server (ID: 123456789)
2. Test Server (ID: 987654321)
```

- If empty: "❌ Bot 尚未加入任何伺服器，請使用上方的邀請連結。"
- If 403: "❌ Bot 權限不足，請使用上方的邀請連結重新邀請。"
- If only 1 server: auto-select it, show confirmation:
  > 偵測到唯一伺服器：**ServerName**，自動選取。

Display: "請輸入伺服器編號："

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

Display: "請輸入要啟用的頻道編號（多個用逗號分隔，例如 `1,3`）："

- Deduplicate selected channel IDs
- If user selects 0 channels, display:
  > **未選擇任何頻道，請選擇模式：**
  > 1. **僅 DM 模式** — bot 只回應私訊
  > 2. **重新選擇頻道**

### 3d. Mention Setting

Display:
> **@mention 設定**（在共用頻道中建議開啟）
> 1. **需要 @mention 才回應**（推薦）
> 2. **所有訊息都回應**

### 3e. DM Access Policy

Display:
> **DM 存取策略**
> 1. **配對模式**（推薦）— 未知使用者會收到 6 碼配對碼，你在終端確認後才能對話
> 2. **直接輸入 User ID** — 進階用戶，直接指定允許的 Discord User ID
> 3. **停用 DM** — bot 只在伺服器頻道中回應
> 4. **跳過** — 使用預設（配對模式）

If user selects 2:
- Show hint: "Discord: 設定 → 進階 → 開發者模式 → 右鍵點擊使用者名稱 → 複製 User ID"
- Ask for comma-separated IDs (must be numeric)

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
cp ~/.claude/settings.json ~/.claude/settings.json.bak
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
