// claude-channel-setup CLI entry point

import { select, checkbox, input, confirm, password } from "@inquirer/prompts";
import ora from "ora";
import {
  SUPPORTED_CHANNELS,
  type ChannelType,
  getChannelDisplayName,
  getTokenEnvKey,
  getTokenPromptMessage,
  getPrerequisiteSteps,
} from "./commands/setup.js";
import {
  validateDiscordToken,
  generateInviteUrl,
  fetchBotGuilds,
  fetchGuildChannelsWithCategories,
} from "./channels/discord.js";
import { validateTelegramToken } from "./channels/telegram.js";
import {
  loadAccessConfigFromDir,
  saveAccessConfigToDir,
  addGroup,
  setDmPolicy,
  addAllowedUser,
  setMentionPatterns,
} from "./lib/access.js";
import {
  getProfileDir,
  listProfiles,
  saveProfileConfig,
  getProfileLaunchEnv,
} from "./lib/profile.js";
import {
  detectClaudeCode,
  getClaudeCodeInfo,
  isVersionSufficient,
  checkFeatureSupport,
  getPluginInstallCommands,
  getChannelLaunchCommand,
  writeToolPermissions,
  MINIMUM_CHANNEL_VERSION,
  MINIMUM_PERMISSION_RELAY_VERSION,
} from "./lib/claude.js";
import * as ui from "./utils/ui.js";

// 版本常數從 claude.ts 匯入

// 記錄每個 channel 的 allowed users 設定方式
type AllowedUsersMode = "pair" | "direct" | "skip";

async function main() {
  console.log(ui.title("Claude Channel Setup"));

  // 1. Detect Claude Code + version check
  const spinner = ora("Detecting Claude Code CLI...").start();
  const claudeInfo = await getClaudeCodeInfo();
  const features = checkFeatureSupport(claudeInfo.version);
  if (claudeInfo.installed) {
    if (claudeInfo.version) {
      if (features.channels) {
        const relayNote = features.permissionRelay
          ? " + Permission Relay"
          : ` — upgrade to v${MINIMUM_PERMISSION_RELAY_VERSION}+ for Permission Relay`;
        spinner.succeed(`Claude Code CLI detected (v${claudeInfo.version})${relayNote}`);
      } else {
        spinner.warn(
          `Claude Code CLI detected (v${claudeInfo.version}) — channels require v${MINIMUM_CHANNEL_VERSION}+, please upgrade`,
        );
      }
    } else {
      spinner.succeed("Claude Code CLI detected");
    }
  } else {
    spinner.warn("Claude Code CLI not detected — setup can continue, but plugin installation must be done manually");
  }

  // 2. Detect Bun
  const bunSpinner = ora("Detecting Bun runtime...").start();
  const hasBun = await detectBun();
  if (hasBun) {
    bunSpinner.succeed("Bun runtime detected");
  } else {
    bunSpinner.fail("Bun not detected — Channel plugins require Bun (https://bun.sh)");
    const shouldContinue = await confirm({
      message: "Continue setup? (you will need to install Bun later)",
      default: false,
    });
    if (!shouldContinue) {
      console.log(ui.dim("Cancelled. Please install Bun first: https://bun.sh/docs/installation"));
      process.exit(0);
    }
  }

  // 3. Select channel
  const selectedChannels = await selectChannels();
  if (selectedChannels.length === 0) {
    console.log(ui.dim("No channel selected, exiting."));
    process.exit(0);
  }

  // 4. Set up each channel and collect profile info + allowed users mode
  const profileMap: Record<string, string | undefined> = {};
  const allowedModeMap: Record<string, AllowedUsersMode> = {};
  for (const channel of selectedChannels) {
    const result = await setupChannel(channel);
    profileMap[channel] = result?.profileName;
    allowedModeMap[channel] = result?.allowedUsersMode ?? "skip";
  }

  // 5. Auto-allow tool permissions
  const wantAutoAllow = await confirm({
    message: "Auto-allow channel bot tools? (so you don't need terminal approval for each message)",
    default: true,
  });
  if (wantAutoAllow) {
    const permSpinner = ora("Writing tool permissions...").start();
    try {
      writeToolPermissions(selectedChannels);
      permSpinner.succeed("Tool permissions added to ~/.claude/settings.json");
    } catch (err) {
      permSpinner.fail(
        `Failed to write tool permissions: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 6. Display final instructions
  printNextSteps(selectedChannels, profileMap, allowedModeMap);
}

async function detectBun(): Promise<boolean> {
  try {
    const { execFileSync } = await import("node:child_process");
    execFileSync("bun", ["--version"], { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

async function selectChannels(): Promise<ChannelType[]> {
  const choices = SUPPORTED_CHANNELS.map((ch) => ({
    name: getChannelDisplayName(ch),
    value: ch,
  }));

  // If CLI arguments are provided, use them directly
  const args = process.argv.slice(2);
  if (args.length > 0) {
    const valid = args.filter((a): a is ChannelType =>
      (SUPPORTED_CHANNELS as readonly string[]).includes(a),
    );
    if (valid.length > 0) return valid;
  }

  const channel = await select({
    message: "Select channel to set up:",
    choices: [
      ...choices,
      { name: "All (Discord + Telegram)", value: "all" as const },
    ],
  });

  if (channel === "all") return [...SUPPORTED_CHANNELS];
  return [channel as ChannelType];
}

interface SetupResult {
  profileName: string | undefined;
  allowedUsersMode: AllowedUsersMode;
}

async function setupChannel(channel: ChannelType): Promise<SetupResult | undefined> {
  const displayName = getChannelDisplayName(channel);
  console.log(ui.title(`Setting up ${displayName}`));

  // Check whether to use a profile (multi-bot support)
  const existingProfiles = listProfiles(channel);
  let profileName: string | undefined;

  if (existingProfiles.length > 0) {
    console.log(ui.dim(`Existing profiles: ${existingProfiles.join(", ")}`));
  }

  const useProfile = await confirm({
    message: "Create a separate profile for this bot? (for multi-bot / multi-session setups)",
    default: existingProfiles.length > 0,
  });

  if (useProfile) {
    profileName = await input({
      message: "Profile name (e.g., backend, frontend, ops):",
      validate: (v) => {
        if (!v.trim()) return "Name cannot be empty";
        if (!/^[a-z0-9-]+$/.test(v)) return "Only lowercase letters, numbers, and hyphens are allowed";
        return true;
      },
    });
  }

  // Display prerequisites
  console.log(`\n${ui.icons.clipboard} Prerequisites (manual steps):`);
  console.log(ui.prerequisiteList(getPrerequisiteSteps(channel)));
  console.log();

  await confirm({ message: "All steps completed?", default: true });

  // Get token
  const token = await password({
    message: getTokenPromptMessage(channel),
    mask: "*",
  });

  if (!token) {
    console.log(ui.error("No token entered, skipping this channel."));
    return;
  }

  // Validate token
  const validateSpinner = ora("Validating token...").start();
  let botId = "";

  if (channel === "discord") {
    const result = await validateDiscordToken(token);
    if (!result.valid) {
      validateSpinner.fail(result.error);
      return;
    }
    validateSpinner.succeed(
      `Token verified (bot: ${result.bot.username}#${result.bot.discriminator})`,
    );
    botId = result.bot.id;
  } else {
    const result = await validateTelegramToken(token);
    if (!result.valid) {
      validateSpinner.fail(result.error);
      return;
    }
    validateSpinner.succeed(
      `Token verified (bot: @${result.bot.username})`,
    );
  }

  // Discord: generate invite URL
  if (channel === "discord") {
    const inviteUrl = generateInviteUrl(botId);
    console.log(`\n${ui.icons.link} Invite URL (all required permissions):`);
    console.log(`   ${ui.code(inviteUrl)}`);

    const openBrowser = await confirm({
      message: "Open invite URL in browser?",
      default: true,
    });

    if (openBrowser) {
      await openUrl(inviteUrl);
    }

    await confirm({ message: "Bot has joined your server?", default: true });
  }

  // Set up Server Channels (Groups) — Discord only
  const accessDir = getProfileDir(channel, profileName);
  if (channel === "discord") {
    await setupDiscordGroups(token, channel, profileName, botId);
  }

  // Set up Allowed Users (DM access) — 兩種方式
  const allowedUsersMode = await setupAllowedUsers(channel, accessDir);

  // Save token (using profile system)
  const saveSpinner = ora("Saving configuration...").start();
  const profileDir = getProfileDir(channel, profileName);
  saveProfileConfig(channel, profileName, token);

  const profileLabel = profileName ? ` (profile: ${profileName})` : "";
  saveSpinner.succeed(
    `Configuration saved to ${profileDir}/.env${profileLabel}`,
  );

  // Display plugin install commands
  const cmds = getPluginInstallCommands(channel);
  console.log(`\n${ui.icons.package} Plugin install command (run in Claude Code):`);
  console.log(`   ${ui.code(cmds.install)}`);
  console.log(ui.dim(`   If plugin not found, run first: ${cmds.marketplaceAdd}`));
  console.log(ui.dim(`   After installation, run: ${cmds.reload}`));

  return { profileName, allowedUsersMode };
}

/** 設定 DM 允許的使用者 — 兩種方式 */
async function setupAllowedUsers(
  channel: ChannelType,
  accessDir: string,
): Promise<AllowedUsersMode> {
  const displayName = getChannelDisplayName(channel);

  const mode = await select({
    message: "How would you like to add allowed DM users?",
    default: "pair",
    choices: [
      {
        name: `Pair via DM (easy — DM the bot to get a pairing code)`,
        value: "pair" as const,
      },
      {
        name: "Enter User ID directly (for advanced users or bulk add)",
        value: "direct" as const,
      },
      {
        name: "Skip for now",
        value: "skip" as const,
      },
    ],
  });

  let config = loadAccessConfigFromDir(accessDir);

  if (mode === "pair") {
    // 保持預設的 pairing 模式
    config = setDmPolicy(config, "pairing");
    saveAccessConfigToDir(accessDir, config);
    console.log(ui.success("DM policy set to pairing — DM the bot to get a pairing code after starting"));
    return "pair";
  }

  if (mode === "direct") {
    // 切換到 allowlist 模式，讓使用者輸入 ID
    config = setDmPolicy(config, "allowlist");

    const idHint = channel === "discord"
      ? "(Discord: Settings → Advanced → Developer Mode → Right-click your name → Copy User ID)"
      : "(Telegram: Use @userinfobot or forward a message to @JsonDumpBot to get your user ID)";

    console.log(ui.dim(`   ${idHint}`));

    let addMore = true;
    while (addMore) {
      const ids = await input({
        message: `Enter ${displayName} User ID(s) (comma-separated):`,
        validate: (v) => {
          if (!v.trim()) return "Please enter at least one ID";
          const parts = v.split(",").map((s) => s.trim());
          if (parts.some((p) => !/^\d+$/.test(p))) {
            return "User IDs should be numeric";
          }
          return true;
        },
      });

      const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
      for (const id of idList) {
        config = addAllowedUser(config, id);
      }
      console.log(ui.success(`Added ${idList.length} user(s) to allowlist`));

      addMore = await confirm({
        message: "Add more users?",
        default: false,
      });
    }

    saveAccessConfigToDir(accessDir, config);
    return "direct";
  }

  // skip — 保持 pairing 模式（安全預設）
  config = setDmPolicy(config, "pairing");
  saveAccessConfigToDir(accessDir, config);
  return "skip";
}

function printNextSteps(
  channels: ChannelType[],
  profileMap: Record<string, string | undefined> = {},
  allowedModeMap: Record<string, AllowedUsersMode> = {},
): void {
  console.log(ui.title("Setup Complete"));
  console.log(`${ui.icons.memo} Next steps:\n`);
  console.log(`   1. Install the plugin in Claude Code (see above)`);
  console.log(`   2. Restart Claude Code:`);

  for (const ch of channels) {
    const profile = profileMap[ch];
    const envPrefix = getProfileLaunchEnv(ch, profile);
    const launchCmd = getChannelLaunchCommand([ch]);
    const fullCmd = envPrefix ? `${envPrefix} ${launchCmd}` : launchCmd;
    console.log(`      ${ui.code(fullCmd)}`);
  }

  // 根據 allowed users mode 顯示不同指引
  let stepNum = 3;
  const hasPairingChannel = channels.some((ch) => allowedModeMap[ch] === "pair" || allowedModeMap[ch] === "skip");

  if (hasPairingChannel) {
    const pairingChannels = channels.filter((ch) => allowedModeMap[ch] === "pair" || allowedModeMap[ch] === "skip");
    for (const ch of pairingChannels) {
      const displayName = getChannelDisplayName(ch);
      console.log(`   ${stepNum}. DM the bot on ${displayName} — it will reply with a pairing code`);
      stepNum++;
      console.log(`   ${stepNum}. In Claude Code, run: ${ui.code(`/${ch}:access pair <code>`)}`);
      stepNum++;
      console.log(`   ${stepNum}. Lock down access: ${ui.code(`/${ch}:access policy allowlist`)}`);
      stepNum++;
    }
  }

  const hasDirectChannel = channels.some((ch) => allowedModeMap[ch] === "direct");
  if (hasDirectChannel) {
    console.log(`   ${stepNum}. Send a message in the configured channel or DM the bot`);
    stepNum++;
  }

  // Enterprise 提示
  console.log(`\n   ${ui.icons.warning} Team/Enterprise users: ensure channelsEnabled is enabled by your admin`);
  console.log(ui.dim("      (claude.ai → Admin settings → Claude Code → Channels)"));

  // Permission Relay 提示
  console.log(`\n   ${ui.icons.info} Permission Relay (v${MINIMUM_PERMISSION_RELAY_VERSION}+): approve tool use from your phone`);
  console.log(ui.dim("      When Claude needs approval, it sends a prompt to your DM."));
  console.log(ui.dim('      Reply "yes <code>" or "no <code>" to approve/deny remotely.'));
  console.log(ui.dim("      Both terminal and remote work — first answer wins."));
  console.log(ui.dim("      Docs: https://code.claude.com/docs/en/channels-reference#relay-permission-prompts"));

  console.log(`\n${ui.dim("Full documentation: https://code.claude.com/docs/en/channels")}`);
}

async function setupDiscordGroups(
  token: string,
  channel: ChannelType,
  profileName: string | undefined,
  botId: string,
): Promise<void> {
  const wantGroups = await confirm({
    message: "Set up Server Channels? (let the bot respond in specific channels, not just DMs)",
    default: true,
  });

  if (!wantGroups) return;

  const spinner = ora("Fetching servers the bot has joined...").start();
  let guilds;
  try {
    guilds = await fetchBotGuilds(token);
  } catch (err) {
    spinner.fail(
      `Failed to fetch server list: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  if (guilds.length === 0) {
    spinner.warn("Bot has not joined any server yet. Please use the invite URL to add it first.");
    return;
  }
  spinner.succeed(`Found ${guilds.length} server(s)`);

  // Select server
  const guildChoice = await select({
    message: "Select server to configure:",
    choices: guilds.map((g) => ({
      name: g.name,
      value: g.id,
      description: `ID: ${g.id}`,
    })),
  });

  // Fetch channel list (with category info)
  const chSpinner = ora("Fetching channel list...").start();
  let channels: import("./channels/discord.js").DiscordChannelWithCategory[];
  try {
    channels = await fetchGuildChannelsWithCategories(token, guildChoice);
  } catch (err) {
    chSpinner.fail(
      `Failed to fetch channel list: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  if (channels.length === 0) {
    chSpinner.warn("No text channels accessible by the bot in this server.");
    return;
  }
  chSpinner.succeed(`Found ${channels.length} text channel(s)`);

  // Select channels (multi-select, showing category info)
  const channelChoices = channels
    .sort((a, b) => a.position - b.position)
    .map((ch) => {
      const label = ch.categoryName
        ? `#${ch.name}  [${ch.categoryName}]`
        : `#${ch.name}`;
      return {
        name: label,
        value: ch.id,
      };
    });

  // Multi-select channels
  const selectedChannels = await checkbox({
    message: "Select channels to enable (space to toggle, enter to confirm):",
    choices: channelChoices,
  });

  if (selectedChannels.length === 0) {
    console.log(ui.dim("No channels selected, skipping group setup."));
    return;
  }

  // Configure requireMention
  const requireMention = await confirm({
    message: "Require @mention to respond? (recommended for shared channels)",
    default: true,
  });

  // Write access.json (in profile mode, write to profile directory)
  const accessDir = profileName ? getProfileDir(channel, profileName) : getProfileDir(channel, undefined);
  let config = loadAccessConfigFromDir(accessDir);
  for (const chId of selectedChannels) {
    config = addGroup(config, chId, { requireMention });
  }

  // 設定 mentionPatterns（官方 plugin 用來偵測 @mention）
  if (requireMention) {
    config = setMentionPatterns(config, [`<@${botId}>`]);
  }

  saveAccessConfigToDir(accessDir, config);

  const chNames = selectedChannels
    .map((id: string) => {
      const ch = channels.find((c) => c.id === id);
      if (!ch) return id;
      return ch.categoryName ? `#${ch.name} [${ch.categoryName}]` : `#${ch.name}`;
    })
    .join(", ");

  console.log(
    ui.success(
      `Configured ${selectedChannels.length} channel(s): ${chNames}`,
    ),
  );
  console.log(
    ui.dim(
      `  requireMention: ${requireMention} — ${requireMention ? "bot responds only when @mentioned" : "bot responds to all messages"}`,
    ),
  );
}

async function openUrl(url: string): Promise<void> {
  try {
    const { execFileSync } = await import("node:child_process");
    const platform = process.platform;
    if (platform === "darwin") {
      execFileSync("open", [url]);
    } else if (platform === "linux") {
      execFileSync("xdg-open", [url]);
    } else if (platform === "win32") {
      execFileSync("cmd", ["/c", "start", url]);
    }
  } catch {
    console.log(ui.warning("Unable to open browser automatically. Please copy the URL manually."));
  }
}

main().catch((err) => {
  console.error(ui.error(`Error: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
