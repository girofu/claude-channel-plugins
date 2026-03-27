# claude-channel-plugins

Marketplace for [Claude Code](https://code.claude.com) channel plugins — setup wizards, access management, and verification tools for Discord (Telegram coming soon).

## Install

```bash
# Add the marketplace
/plugin marketplace add girofu/claude-channel-plugins

# Install the plugin
/plugin install channel-setup@claude-channel-plugins
```

For local development:

```bash
git clone https://github.com/girofu/claude-channel-plugins.git
/plugin marketplace add ./claude-channel-plugins
/plugin install channel-setup@claude-channel-plugins
```

## Skills

| Command | Description |
|---------|-------------|
| `/channel-setup:setup` | Interactive wizard — token validation, server/channel selection, access control, tool permissions |
| `/channel-setup:verify` | Verify config — token, bot presence, access.json format, permissions |
| `/channel-setup:status` | Show current config — DM policy, groups, allowed users |
| `/channel-setup:access` | Profile-aware access management — pair, allow, deny, policy |
| `/channel-setup:reset` | Reset config with automatic backup |

## Example: Set Up Discord

```
> /channel-setup:setup

Phase 1: Environment Detection
  ✅ Bun runtime detected

Phase 2: Token Setup
  Paste your Discord Bot Token: ********
  ✅ Token verified (bot: MyClaude#1234)

Phase 3: Invite & Server/Channel Setup
  🔗 Invite URL: https://discord.com/oauth2/authorize?...
  Select server: My Dev Server
  Select channels: #claude-dev, #claude-ops
  Require @mention? Yes

Phase 4: Tool Permissions
  ✅ Added mcp__plugin_discord_discord__* to settings.json

Phase 5: Complete!
  Launch: claude --channels plugin:discord@claude-plugins-official
```

## Example: Pair a User (Cross-Profile)

```
> /channel-setup:access pair 80ff6a

Scanning all profiles...
  ✅ Found code 80ff6a in profile discord-frontend
  ✅ Approved sender 890824536533131274
```

Scans ALL profiles automatically — no need to know which profile received the pairing request.

## Multi-Bot Profiles

Map different Discord channels to different Claude Code sessions:

```
~/.claude/channels/
├── discord/              # Default profile
├── discord-frontend/     # Bot A
└── discord-backend/      # Bot B
```

Launch each session separately:

```bash
DISCORD_STATE_DIR=~/.claude/channels/discord-frontend \
  claude --channels plugin:discord@claude-plugins-official

DISCORD_STATE_DIR=~/.claude/channels/discord-backend \
  claude --channels plugin:discord@claude-plugins-official
```

## Discord Permissions

The invite URL includes exactly these permissions:

| Permission | Value |
|-----------|-------|
| View Channels | 1024 |
| Send Messages | 2048 |
| Send Messages in Threads | 274877906944 |
| Read Message History | 65536 |
| Attach Files | 32768 |
| Add Reactions | 64 |
| **Total** | **274878008384** |

## Structure

```
├── .claude-plugin/
│   ├── plugin.json      # Claude Code plugin manifest
│   └── marketplace.json # Marketplace registry
└── skills/              # Plugin skills
    ├── setup/SKILL.md   # Interactive setup wizard
    ├── verify/SKILL.md  # Config verification
    ├── status/SKILL.md  # Status display
    ├── access/SKILL.md  # Profile-aware access management
    └── reset/SKILL.md   # Reset with backup
```

## Related

- [Claude Code Channels Documentation](https://code.claude.com/docs/en/channels)
- [Claude Code Channels Reference](https://code.claude.com/docs/en/channels-reference)
- [Official Channel Plugins](https://github.com/anthropics/claude-plugins-official)

## License

[MIT](LICENSE)
