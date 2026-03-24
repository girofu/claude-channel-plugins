# claude-channel-setup

Automated setup for [Claude Code](https://code.claude.com) channel plugins — Discord and Telegram.

Reduces the 7-step manual setup process to a single interactive command.

## What It Automates

| Step | Before | After |
|------|--------|-------|
| Validate bot token | Test manually | API verification with bot info display |
| Generate invite URL (Discord) | Manually select 6 permissions | Auto-computed permission integer |
| Configure server channels | Manually edit `access.json` | Interactive guild/channel picker via Discord API |
| Save token | Manually create dirs and `.env` | Auto-saved to `~/.claude/channels/` |
| Plugin install commands | Look up in docs | Generated and displayed |
| Launch command | Build `--channels` flag manually | Auto-generated (supports multi-channel) |

**Still manual:** Creating the bot in Discord Developer Portal / Telegram BotFather (no public API exists for this).

## Quick Start

No installation required — just run:

```bash
npx claude-channel-setup
```

Or specify channel(s) directly:

```bash
npx claude-channel-setup discord
npx claude-channel-setup telegram
npx claude-channel-setup discord telegram
```

### Alternative: Python

```bash
pip install claude-channel-setup
claude-channel-setup
```

### Alternative: From source

```bash
git clone https://github.com/girofu/claude-channel-setup.git
cd claude-channel-setup
npm install && npm run build
node dist/index.js
```

### Example Session

```
🤖 Claude Channel Setup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Claude Code CLI detected
✅ Bun runtime detected

? Select channel to set up: Discord

🤖 Setting up Discord
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Prerequisites (manual steps):
   1. Create a new Application at Discord Developer Portal
   2. Enable "Message Content Intent" in Bot settings
   3. Copy the Bot Token

? All steps completed? Yes
? Paste your Discord Bot Token: ********

✅ Token verified (bot: MyClaude#1234)

🔗 Invite URL (all required permissions):
   https://discord.com/oauth2/authorize?client_id=...&scope=bot&permissions=274878008384

? Open in browser? Yes
? Bot has joined your server? Yes

? Set up Server Channels? (bot responds in specific channels, not just DMs) Yes
✅ Found 2 servers
? Select server: My Dev Server
✅ Found 5 text channels
? Select channels to enable (space to toggle, enter to confirm):
  ◻ #general          [General]
  ◼ #claude-dev       [Development]
  ◼ #claude-ops       [Operations]
  ◻ #random           [General]
  ◻ #voice-chat-text  [Voice]
? Require @mention to respond? (recommended for shared channels) Yes
? Current DM policy is pairing, switch to allowlist? Yes
✅ Configured 2 channels: #claude-dev, #claude-ops

📦 Plugin install command (run in Claude Code):
   /plugin install discord@claude-plugins-official

🔑 Token saved to ~/.claude/channels/discord/.env

🤖 Setup Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Next steps:
   1. Install the plugin in Claude Code (see above)
   2. Restart Claude Code:
      claude --channels plugin:discord@claude-plugins-official
   3. Send a message in the configured channel (if requireMention is enabled, @mention the bot), or DM the bot directly
```

## Prerequisites

- **Node.js 18+** (for npx) or **Python 3.10+** (for pip)
- **[Bun](https://bun.sh)** — required by Claude Code channel plugins
- **Claude Code v2.1.80+** — with channels support
- **Discord** — a bot created at [Developer Portal](https://discord.com/developers/applications)
- **Telegram** — a bot created via [BotFather](https://t.me/BotFather)

## Server Channel Setup (Discord Groups)

By default, a Discord bot only responds to DMs. To make it respond in server channels, you need to configure **groups** in `~/.claude/channels/discord/access.json`.

This CLI automates that:

1. Fetches servers the bot has joined (via Discord API)
2. Lists text channels in the selected server
3. Lets you pick which channels the bot should respond in
4. Configures `requireMention` (whether `@bot` is needed)
5. Writes the config to `access.json`

**Without this step**, the bot silently ignores all server channel messages — only DMs work.

### Multi-Session Setup (Profiles)

To map different Discord channels to different Claude Code sessions, use **profiles**:

```bash
# Set up Bot A with profile "frontend"
npx claude-channel-setup discord
# → Create a separate profile? Yes
# → Profile name: frontend

# Set up Bot B with profile "backend"
npx claude-channel-setup discord
# → Create a separate profile? Yes
# → Profile name: backend
```

This creates isolated directories:

```
~/.claude/channels/
├── discord-frontend/    # Bot A: token + access.json
└── discord-backend/     # Bot B: token + access.json
```

Then launch each session separately:

```bash
# Terminal 1
cd ~/projects/frontend
DISCORD_STATE_DIR=~/.claude/channels/discord-frontend claude --channels plugin:discord@claude-plugins-official

# Terminal 2
cd ~/projects/backend
DISCORD_STATE_DIR=~/.claude/channels/discord-backend claude --channels plugin:discord@claude-plugins-official
```

Each bot is fully isolated — different WebSocket connections, different processes, different working directories.

## Discord Permissions

The tool generates an invite URL with exactly these permissions:

| Permission | Value |
|-----------|-------|
| View Channels | 1024 |
| Send Messages | 2048 |
| Send Messages in Threads | 274877906944 |
| Read Message History | 65536 |
| Attach Files | 32768 |
| Add Reactions | 64 |
| **Total** | **274878008384** |

## Development

```bash
# Node.js
npm install
npm test              # Run tests (vitest)
npm run build         # Build CLI (tsup)
npm run check:build   # Type check + build

# Python
python3 -m venv .venv && source .venv/bin/activate
pip install -e python/ pytest pytest-asyncio
pytest python/tests/  # Run tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

## Architecture

```
├── src/                          # Node.js/TypeScript
│   ├── index.ts                  # Interactive CLI entry point
│   ├── channels/discord.ts       # Discord API validation + invite URL
│   ├── channels/telegram.ts      # Telegram API validation
│   ├── lib/access.ts             # access.json management (groups, DM policy)
│   ├── lib/config.ts             # Token storage (~/.claude/channels/)
│   ├── lib/claude.ts             # Claude Code CLI detection + commands
│   ├── commands/setup.ts         # Channel metadata (names, prerequisites)
│   ├── utils/ui.ts               # CLI formatting (colors, icons)
│   └── lib/profile.ts            # Multi-bot profile management (STATE_DIR)
├── python/                       # Python mirror
│   └── claude_channel_setup/     # Same structure, same functionality
└── tests/                        # Node.js + Python tests
```

## Related

- [Claude Code Channels Documentation](https://code.claude.com/docs/en/channels)
- [Official Channel Plugins](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins)
- [Claude Code](https://code.claude.com)

## License

[MIT](LICENSE)
