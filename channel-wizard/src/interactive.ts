import * as p from "@clack/prompts";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  validateToken,
  fetchGuilds,
  fetchGuildChannels,
  generateProfileName,
} from "./discord-api";
import { writeBotConfig } from "./config-writer";
import { writeAllScripts } from "./script-generator";
import { updateSettingsJson } from "./permissions";
import {
  ALL_TOOL_PERMISSIONS,
  DISCORD_BOT_PERMISSIONS,
  type BotInfo,
  type ChannelInfo,
  type ChannelPool,
  type ToolPermission,
} from "./types";

// ==================== 主入口 ====================

export async function runInteractive(): Promise<void> {
  p.intro("Discord Bot 批次設定精靈");

  // ── Step 1: 批次註冊 Tokens ──────────────────────────────────────────────
  p.log.step("步驟 1/5：批次註冊 Bot Tokens");

  const tokenInput = await p.text({
    message: "請輸入 Bot Token（每行一個，可貼多個）",
    placeholder: "MTA1NjI1MTc...",
    validate: (value) => {
      if (!value || value.trim() === "") return "至少需要一個 token";
    },
  });

  if (p.isCancel(tokenInput)) {
    p.cancel("已取消");
    process.exit(0);
  }

  const rawTokens = (tokenInput as string)
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const bots: BotInfo[] = [];
  const usedProfileNames: string[] = [];

  for (const token of rawTokens) {
    const s = p.spinner();
    s.start(`驗證 token: ${token.substring(0, 20)}...`);

    const result = await validateToken(token);

    if (!result.valid) {
      s.error(`Token 無效 (${result.error}): ${token.substring(0, 20)}...`);
      const action = await p.select({
        message: "此 token 無效，如何處理？",
        options: [
          { value: "skip", label: "跳過此 token" },
          { value: "cancel", label: "取消整個精靈" },
        ],
      });
      if (p.isCancel(action) || action === "cancel") {
        p.cancel("已取消");
        process.exit(0);
      }
      continue;
    }

    s.message(`取得伺服器列表: ${result.botName}...`);
    const guilds = await fetchGuilds(token);
    s.stop(`✓ ${result.botName}（加入了 ${guilds.length} 個伺服器）`);

    const autoProfileName = generateProfileName(result.botName, usedProfileNames);

    // 顯示建議的 profile 名稱，讓使用者確認或修改
    p.log.info(`建議的 profile 名稱：${autoProfileName}`);

    const wantCustomName = await p.confirm({
      message: "是否要修改 profile 名稱？",
      initialValue: false,
    });

    let profileName = autoProfileName;
    if (!p.isCancel(wantCustomName) && wantCustomName === true) {
      const customName = await p.text({
        message: "請輸入 profile 名稱",
        initialValue: autoProfileName,
        validate: (value) => {
          if (!value || value.trim() === "") return "不能為空";
          if (usedProfileNames.includes(value.trim()))
            return "此名稱已被使用";
        },
      });
      if (!p.isCancel(customName)) {
        profileName = (customName as string).trim();
      }
    }

    usedProfileNames.push(profileName);
    bots.push({
      token,
      botName: result.botName,
      botId: result.botId,
      profileName,
      guilds,
    });
  }

  if (bots.length === 0) {
    p.cancel("沒有有效的 bot，結束");
    process.exit(1);
  }

  // ── Step 2: 頻道池建立 ────────────────────────────────────────────────────
  p.log.step("步驟 2/5：建立頻道池");

  const channelPool: ChannelPool = new Map<string, ChannelInfo>();

  for (const bot of bots) {
    if (bot.guilds.length === 0) continue;

    const s = p.spinner();
    s.start(`取得 ${bot.botName} 的頻道清單...`);

    for (const guild of bot.guilds) {
      const channels = await fetchGuildChannels(bot.token, guild.id, guild.name);
      for (const ch of channels) {
        if (!channelPool.has(ch.id)) {
          channelPool.set(ch.id, ch);
        }
      }
    }

    s.stop(`✓ ${bot.botName} 的頻道已載入`);
  }

  // 顯示頻道池（依伺服器分組）
  const channelsByServer = new Map<string, ChannelInfo[]>();
  for (const ch of channelPool.values()) {
    const list = channelsByServer.get(ch.serverName) ?? [];
    list.push(ch);
    channelsByServer.set(ch.serverName, list);
  }

  for (const [serverName, channels] of channelsByServer) {
    const channelList = channels.map((c) => `  #${c.name} (${c.id})`).join("\n");
    p.log.info(`伺服器：${serverName}\n${channelList}`);
  }

  // 詢問是否要手動新增頻道
  const wantManual = await p.confirm({
    message: "是否要手動新增頻道（輸入 channelId,serverId 格式）？",
    initialValue: false,
  });

  if (!p.isCancel(wantManual) && wantManual === true) {
    const manualInput = await p.text({
      message: "請輸入頻道（每行一個，格式：channelId,serverId）",
      placeholder: "123456789,987654321",
    });

    if (!p.isCancel(manualInput) && manualInput) {
      const lines = (manualInput as string)
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      for (const line of lines) {
        const parts = line.split(",");
        if (parts.length >= 1) {
          const channelId = parts[0].trim();
          const serverId = parts[1]?.trim() ?? "";
          if (channelId && !channelPool.has(channelId)) {
            channelPool.set(channelId, {
              id: channelId,
              name: channelId,
              serverId,
              serverName: serverId,
              type: 0,
              source: "manual",
            });
          }
        }
      }
    }
  }

  // ── Step 3: Bot↔Channel 矩陣對應 ─────────────────────────────────────────
  p.log.step("步驟 3/5：設定 Bot↔頻道對應");

  const mappingMode = await p.select({
    message: "選擇對應模式",
    options: [
      { value: "quick", label: "快速語法（輸入 * / #名稱 / ID）" },
      { value: "interactive", label: "逐一互動（多選清單）" },
    ],
  });

  if (p.isCancel(mappingMode)) {
    p.cancel("已取消");
    process.exit(0);
  }

  const botChannelMapping = new Map<string, string[]>();
  const allChannels = Array.from(channelPool.values());

  for (const bot of bots) {
    if (mappingMode === "quick") {
      const quickInput = await p.text({
        message: `${bot.botName} 的頻道（* = 全部，#名稱，或頻道 ID，空格分隔）`,
        placeholder: "* 或 #general #announcements 或 123456",
        validate: (value) => {
          if (!value || value.trim() === "") return "至少需要輸入一個頻道";
        },
      });

      if (p.isCancel(quickInput)) {
        p.cancel("已取消");
        process.exit(0);
      }

      const tokens = (quickInput as string)
        .trim()
        .split(/\s+/)
        .filter((t) => t.length > 0);
      const resolvedChannelIds: string[] = [];

      for (const token of tokens) {
        if (token === "*") {
          // 全部頻道
          for (const ch of allChannels) {
            if (!resolvedChannelIds.includes(ch.id)) {
              resolvedChannelIds.push(ch.id);
            }
          }
        } else if (token.startsWith("#")) {
          // 依名稱搜尋
          const name = token.substring(1).toLowerCase();
          const matches = allChannels.filter(
            (ch) => ch.name.toLowerCase() === name
          );
          if (matches.length === 0) {
            p.log.warn(`找不到名稱為 #${name} 的頻道，已跳過`);
          } else if (matches.length > 1) {
            p.log.warn(
              `名稱 #${name} 有多個匹配（${matches.map((c) => c.id).join(", ")}），已全部加入`
            );
            for (const ch of matches) {
              if (!resolvedChannelIds.includes(ch.id)) {
                resolvedChannelIds.push(ch.id);
              }
            }
          } else {
            if (!resolvedChannelIds.includes(matches[0].id)) {
              resolvedChannelIds.push(matches[0].id);
            }
          }
        } else {
          // 直接 ID
          if (!resolvedChannelIds.includes(token)) {
            resolvedChannelIds.push(token);
          }
        }
      }

      botChannelMapping.set(bot.token, resolvedChannelIds);
    } else {
      // interactive: p.multiselect
      const options = allChannels.map((ch) => ({
        value: ch.id,
        label: ch.source === "api" ? `#${ch.name} (${ch.serverName})` : `${ch.id} [手動]`,
        hint: ch.id,
      }));

      if (options.length === 0) {
        p.log.warn(`沒有可選頻道，${bot.botName} 跳過`);
        botChannelMapping.set(bot.token, []);
        continue;
      }

      const selected = await p.multiselect({
        message: `選擇 ${bot.botName} 要監聽的頻道`,
        options,
        required: true,
      });

      if (p.isCancel(selected)) {
        p.cancel("已取消");
        process.exit(0);
      }

      botChannelMapping.set(bot.token, selected as string[]);
    }
  }

  // ── Step 4: 批次設定 ───────────────────────────────────────────────────────
  p.log.step("步驟 4/5：批次設定");

  // 4a: mention 設定
  const mentionMode = await p.select({
    message: "需要 mention bot 才回應嗎？",
    options: [
      { value: "all-yes", label: "全部需要 mention" },
      { value: "all-no", label: "全部不需要 mention" },
      { value: "per-bot", label: "逐一設定" },
    ],
  });

  if (p.isCancel(mentionMode)) {
    p.cancel("已取消");
    process.exit(0);
  }

  const requireMentionMap = new Map<string, boolean>();
  if (mentionMode === "all-yes") {
    for (const bot of bots) requireMentionMap.set(bot.token, true);
  } else if (mentionMode === "all-no") {
    for (const bot of bots) requireMentionMap.set(bot.token, false);
  } else {
    for (const bot of bots) {
      const val = await p.confirm({
        message: `${bot.botName} 需要 mention 才回應？`,
        initialValue: true,
      });
      if (p.isCancel(val)) {
        p.cancel("已取消");
        process.exit(0);
      }
      requireMentionMap.set(bot.token, val as boolean);
    }
  }

  // 4b: allowFrom 設定
  const globalAllowFromInput = await p.text({
    message: "全域允許的使用者 ID（逗號分隔，必填）",
    placeholder: "123456789,987654321",
    validate: (value) => {
      if (!value || value.trim() === "") return "至少需要一個使用者 ID";
    },
  });

  if (p.isCancel(globalAllowFromInput)) {
    p.cancel("已取消");
    process.exit(0);
  }

  const globalAllowFrom = (globalAllowFromInput as string)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // 每個 bot 的額外 allowFrom
  const perBotAllowFrom = new Map<string, string[]>();
  for (const bot of bots) {
    const extraInput = await p.text({
      message: `${bot.botName} 額外允許的使用者 ID（選填，逗號分隔）`,
      placeholder: "留空表示不額外新增",
    });

    if (p.isCancel(extraInput)) {
      p.cancel("已取消");
      process.exit(0);
    }

    const extra =
      extraInput && (extraInput as string).trim()
        ? (extraInput as string)
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [];

    const merged = Array.from(new Set([...globalAllowFrom, ...extra]));
    perBotAllowFrom.set(bot.token, merged);
  }

  // 4c: tool permissions
  const toolOptions = ALL_TOOL_PERMISSIONS.map((t) => ({
    value: t as string,
    label: t,
  }));

  const selectedTools = await p.multiselect({
    message: "選擇要授予的工具權限",
    options: toolOptions,
    initialValues: [...ALL_TOOL_PERMISSIONS] as string[],
    required: false,
  });

  if (p.isCancel(selectedTools)) {
    p.cancel("已取消");
    process.exit(0);
  }

  const toolPermissions = selectedTools as ToolPermission[];

  // ── Step 5: 產出 ─────────────────────────────────────────────────────────
  p.log.step("步驟 5/5：產出設定檔");

  const channelsBase = join(homedir(), ".claude", "channels");
  const scriptsDir = join(channelsBase, "scripts");
  const settingsPath = join(homedir(), ".claude", "settings.json");

  const createdFiles: string[] = [];
  const inviteLinks: string[] = [];

  for (const bot of bots) {
    const profileDir = join(channelsBase, bot.profileName);
    const channelIds = botChannelMapping.get(bot.token) ?? [];
    const allowFrom = perBotAllowFrom.get(bot.token) ?? globalAllowFrom;
    const requireMention = requireMentionMap.get(bot.token) ?? true;

    const s = p.spinner();
    s.start(`寫入 ${bot.botName} 的設定...`);

    await writeBotConfig({
      profileDir,
      token: bot.token,
      botId: bot.botId,
      channelIds,
      allowFrom,
      requireMention,
    });

    s.stop(`✓ ${bot.botName} 設定已寫入 ${profileDir}`);
    createdFiles.push(join(profileDir, ".env"));
    createdFiles.push(join(profileDir, "access.json"));

    // 檢查 bot 是否不在目標伺服器
    if (bot.guilds.length === 0) {
      const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${bot.botId}&permissions=${DISCORD_BOT_PERMISSIONS}&scope=bot`;
      inviteLinks.push(`${bot.botName}: ${inviteLink}`);
    }
  }

  // 更新 settings.json
  {
    const s = p.spinner();
    s.start("更新 settings.json...");
    await updateSettingsJson(settingsPath, toolPermissions);
    s.stop("✓ settings.json 已更新");
  }

  // 寫入啟動腳本
  {
    const s = p.spinner();
    s.start("寫入啟動腳本...");
    const profileNames = bots.map((b) => b.profileName);
    await writeAllScripts(profileNames, scriptsDir);
    s.stop(`✓ 啟動腳本已寫入 ${scriptsDir}`);
    createdFiles.push(join(scriptsDir, "start-all.sh"));
  }

  // 顯示摘要
  const startAllPath = join(scriptsDir, "start-all.sh");
  const startCommands = bots
    .map((b) => `bash ${join(scriptsDir, `start-${b.profileName}.sh`)}`)
    .join("\n");

  p.note(
    [
      "建立的檔案：",
      ...createdFiles.map((f) => `  ${f}`),
      "",
      "啟動指令：",
      ...bots.map(
        (b) => `  bash ${join(scriptsDir, `start-${b.profileName}.sh`)}`
      ),
      "",
      `或一次啟動全部：bash ${startAllPath}`,
    ].join("\n"),
    "完成摘要"
  );

  if (inviteLinks.length > 0) {
    p.note(
      ["以下 bot 尚未加入任何伺服器，請使用邀請連結：", ...inviteLinks].join(
        "\n"
      ),
      "邀請連結"
    );
  }

  p.note(
    [
      "提醒事項：",
      "• 私有頻道需要在 Discord 中手動將 bot 加入",
      "• 執行 claude --channel plugin:discord@claude-plugins-official 驗證設定",
      "• 請確保 DISCORD_BOT_TOKEN 的 .env 檔案權限設為 600",
    ].join("\n"),
    "注意事項"
  );

  p.outro("設定完成！");
}
