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

// ==================== 狀態型別 ====================

interface WizardState {
  bots: BotInfo[];
  usedProfileNames: string[];
  channelPool: ChannelPool;
  botChannelMapping: Map<string, string[]>;
  requireMentionMap: Map<string, boolean>;
  globalAllowFrom: string[];
  perBotAllowFrom: Map<string, string[]>;
  toolPermissions: ToolPermission[];
}

function createEmptyState(): WizardState {
  return {
    bots: [],
    usedProfileNames: [],
    channelPool: new Map(),
    botChannelMapping: new Map(),
    requireMentionMap: new Map(),
    globalAllowFrom: [],
    perBotAllowFrom: new Map(),
    toolPermissions: [...ALL_TOOL_PERMISSIONS] as ToolPermission[],
  };
}

// ==================== 步驟導航 ====================

type StepResult = "next" | "back" | "cancel";

async function askNavigation(stepNum: number): Promise<StepResult> {
  if (stepNum <= 1) return "next"; // Step 1 沒有上一步

  const nav = await p.select({
    message: "繼續？",
    options: [
      { value: "next", label: "下一步 →" },
      { value: "back", label: "← 回上一步" },
    ],
  });

  if (p.isCancel(nav)) return "cancel";
  return nav as StepResult;
}

// ==================== Step 1: 批次註冊 Tokens ====================

async function step1_registerTokens(state: WizardState): Promise<StepResult> {
  p.log.step("步驟 1/5：批次註冊 Bot Tokens");

  // 清空之前的資料（回到此步時重新開始）
  state.bots = [];
  state.usedProfileNames = [];

  let addMoreBots = true;
  while (addMoreBots) {
    const tokenInput = await p.text({
      message: state.bots.length === 0
        ? "請輸入 Bot Token"
        : `請輸入第 ${state.bots.length + 1} 個 Bot Token`,
      placeholder: "從 Discord Developer Portal 複製的 Token",
      validate: (value) => {
        if (!value || value.trim() === "") return "Token 不能為空";
      },
    });

    if (p.isCancel(tokenInput)) {
      if (state.bots.length > 0) break;
      return "cancel";
    }

    const token = (tokenInput as string).trim();
    const s = p.spinner();
    s.start(`驗證 token: ${token.substring(0, 20)}...`);

    const result = await validateToken(token);

    if (!result.valid) {
      s.stop(`✗ Token 無效 (${result.error})`);
      const action = await p.select({
        message: "此 token 無效，如何處理？",
        options: [
          { value: "retry", label: "重新輸入" },
          { value: "skip", label: "跳過" },
          { value: "cancel", label: "取消整個精靈" },
        ],
      });
      if (p.isCancel(action) || action === "cancel") return "cancel";
      if (action === "retry") continue;
    } else {
      s.message(`取得伺服器列表: ${result.botName}...`);
      const guilds = await fetchGuilds(token);
      s.stop(`✓ ${result.botName}（加入了 ${guilds.length} 個伺服器）`);

      const autoProfileName = generateProfileName(result.botName, state.usedProfileNames);
      p.log.info(`Profile 名稱：${autoProfileName}`);

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
            if (state.usedProfileNames.includes(value.trim()))
              return "此名稱已被使用";
          },
        });
        if (!p.isCancel(customName)) {
          profileName = (customName as string).trim();
        }
      }

      state.usedProfileNames.push(profileName);
      state.bots.push({
        token,
        botName: result.botName,
        botId: result.botId,
        profileName,
        guilds,
      });
    }

    const more = await p.confirm({
      message: "要新增更多 Bot 嗎？",
      initialValue: false,
    });
    addMoreBots = !p.isCancel(more) && more === true;
  }

  if (state.bots.length === 0) return "cancel";

  p.log.success(`已註冊 ${state.bots.length} 個 Bot：${state.bots.map(b => b.botName).join(", ")}`);
  return "next";
}

// ==================== Step 2: 頻道池建立 ====================

async function step2_buildChannelPool(state: WizardState): Promise<StepResult> {
  p.log.step("步驟 2/5：建立頻道池");

  // 清空之前的頻道池（回到此步時重新查詢）
  state.channelPool = new Map();

  for (const bot of state.bots) {
    if (bot.guilds.length === 0) continue;

    const s = p.spinner();
    s.start(`取得 ${bot.botName} 的頻道清單...`);

    for (const guild of bot.guilds) {
      const channels = await fetchGuildChannels(bot.token, guild.id, guild.name);
      for (const ch of channels) {
        if (!state.channelPool.has(ch.id)) {
          state.channelPool.set(ch.id, ch);
        }
      }
    }

    s.stop(`✓ ${bot.botName} 的頻道已載入`);
  }

  // 顯示頻道池
  const channelsByServer = new Map<string, ChannelInfo[]>();
  for (const ch of state.channelPool.values()) {
    const list = channelsByServer.get(ch.serverName) ?? [];
    list.push(ch);
    channelsByServer.set(ch.serverName, list);
  }

  if (channelsByServer.size > 0) {
    for (const [serverName, channels] of channelsByServer) {
      const channelList = channels.map((c) => `  #${c.name} (${c.id})`).join("\n");
      p.log.info(`伺服器：${serverName}\n${channelList}`);
    }
  } else {
    p.log.warn("未發現任何頻道（Bot 可能尚未加入伺服器）");
  }

  // 手動新增
  const wantManual = await p.confirm({
    message: "是否要手動新增頻道（輸入 channelId,serverId 格式）？",
    initialValue: false,
  });

  if (!p.isCancel(wantManual) && wantManual === true) {
    let addMore = true;
    while (addMore) {
      const manualInput = await p.text({
        message: "請輸入頻道（格式：channelId,serverId）",
        placeholder: "123456789,987654321",
        validate: (value) => {
          if (!value || value.trim() === "") return "不能為空";
          if (!value.includes(",")) return "格式：channelId,serverId";
        },
      });

      if (!p.isCancel(manualInput) && manualInput) {
        const parts = (manualInput as string).split(",");
        const channelId = parts[0].trim();
        const serverId = parts[1]?.trim() ?? "";
        if (channelId && !state.channelPool.has(channelId)) {
          state.channelPool.set(channelId, {
            id: channelId,
            name: channelId,
            serverId,
            serverName: serverId || "手動新增",
            type: 0,
            source: "manual",
          });
          p.log.success(`已新增頻道 ${channelId}`);
        }
      }

      const more = await p.confirm({
        message: "要繼續新增頻道嗎？",
        initialValue: false,
      });
      addMore = !p.isCancel(more) && more === true;
    }
  }

  return await askNavigation(2);
}

// ==================== Step 3: Bot↔Channel 矩陣對應 ====================

async function step3_mapBotChannels(state: WizardState): Promise<StepResult> {
  p.log.step("步驟 3/5：設定 Bot↔頻道對應");

  // 清空之前的對應
  state.botChannelMapping = new Map();
  const allChannels = Array.from(state.channelPool.values());

  if (allChannels.length === 0) {
    p.log.warn("頻道池為空，請回到上一步新增頻道");
    return "back";
  }

  const mappingMode = await p.select({
    message: "選擇對應模式",
    options: [
      { value: "quick", label: "快速語法（輸入 * / #名稱 / ID）" },
      { value: "interactive", label: "逐一互動（多選清單）" },
    ],
  });

  if (p.isCancel(mappingMode)) return "cancel";

  for (const bot of state.bots) {
    if (mappingMode === "quick") {
      const quickInput = await p.text({
        message: `${bot.botName} 的頻道（* = 全部，#名稱，或頻道 ID，逗號分隔）`,
        placeholder: "* 或 #general, #announcements 或 123456",
        validate: (value) => {
          if (!value || value.trim() === "") return "至少需要輸入一個頻道";
        },
      });

      if (p.isCancel(quickInput)) return "cancel";

      const refs = (quickInput as string)
        .trim()
        .split(/[\s,]+/)
        .filter((t) => t.length > 0);
      const resolvedChannelIds: string[] = [];

      for (const ref of refs) {
        if (ref === "*") {
          for (const ch of allChannels) {
            if (!resolvedChannelIds.includes(ch.id)) {
              resolvedChannelIds.push(ch.id);
            }
          }
        } else if (ref.startsWith("#")) {
          const name = ref.substring(1).toLowerCase();
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
          if (!resolvedChannelIds.includes(ref)) {
            resolvedChannelIds.push(ref);
          }
        }
      }

      state.botChannelMapping.set(bot.token, resolvedChannelIds);
      p.log.info(`${bot.botName} → ${resolvedChannelIds.length} 個頻道`);
    } else {
      const options = allChannels.map((ch) => ({
        value: ch.id,
        label: ch.source === "api" ? `#${ch.name} (${ch.serverName})` : `${ch.id} [手動]`,
        hint: ch.id,
      }));

      if (options.length === 0) {
        p.log.warn(`沒有可選頻道，${bot.botName} 跳過`);
        state.botChannelMapping.set(bot.token, []);
        continue;
      }

      const selected = await p.multiselect({
        message: `選擇 ${bot.botName} 要監聽的頻道`,
        options,
        required: true,
      });

      if (p.isCancel(selected)) return "cancel";

      state.botChannelMapping.set(bot.token, selected as string[]);
    }
  }

  return await askNavigation(3);
}

// ==================== Step 4: 批次設定 ====================

async function step4_batchSettings(state: WizardState): Promise<StepResult> {
  p.log.step("步驟 4/5：批次設定");

  // 4a: mention 設定
  const mentionMode = await p.select({
    message: "需要 @ mention bot 才回應嗎？",
    options: [
      { value: "all-yes", label: "全部需要 @" },
      { value: "all-no", label: "全部不需要 @" },
      { value: "per-bot", label: "逐一設定" },
    ],
  });

  if (p.isCancel(mentionMode)) return "cancel";

  state.requireMentionMap = new Map();
  if (mentionMode === "all-yes") {
    for (const bot of state.bots) state.requireMentionMap.set(bot.token, true);
  } else if (mentionMode === "all-no") {
    for (const bot of state.bots) state.requireMentionMap.set(bot.token, false);
  } else {
    for (const bot of state.bots) {
      const val = await p.confirm({
        message: `${bot.botName} 需要 @ 才回應？`,
        initialValue: true,
      });
      if (p.isCancel(val)) return "cancel";
      state.requireMentionMap.set(bot.token, val as boolean);
    }
  }

  // 4b: allowFrom 設定
  const globalAllowFromInput = await p.text({
    message: "全域允許的使用者 ID（逗號分隔，必填）",
    placeholder: "123456789, 987654321",
    validate: (value) => {
      if (!value || value.trim() === "") return "至少需要一個使用者 ID";
    },
  });

  if (p.isCancel(globalAllowFromInput)) return "cancel";

  state.globalAllowFrom = (globalAllowFromInput as string)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  state.perBotAllowFrom = new Map();
  for (const bot of state.bots) {
    const extraInput = await p.text({
      message: `${bot.botName} 額外允許的使用者 ID（選填，留空跳過）`,
      placeholder: "逗號分隔，留空表示不額外新增",
    });

    if (p.isCancel(extraInput)) return "cancel";

    const extra =
      extraInput && (extraInput as string).trim()
        ? (extraInput as string)
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [];

    const merged = Array.from(new Set([...state.globalAllowFrom, ...extra]));
    state.perBotAllowFrom.set(bot.token, merged);
  }

  // 4c: tool permissions
  const toolOptions = ALL_TOOL_PERMISSIONS.map((t) => ({
    value: t as string,
    label: t,
  }));

  const selectedTools = await p.multiselect({
    message: "選擇要授予的工具權限（預設全選）",
    options: toolOptions,
    initialValues: [...ALL_TOOL_PERMISSIONS] as string[],
    required: false,
  });

  if (p.isCancel(selectedTools)) return "cancel";
  state.toolPermissions = selectedTools as ToolPermission[];

  return await askNavigation(4);
}

// ==================== Step 5: 產出 ====================

async function step5_generate(state: WizardState): Promise<StepResult> {
  p.log.step("步驟 5/5：確認並產出設定檔");

  // 顯示摘要讓使用者確認
  const summaryLines = [
    `Bot 數量：${state.bots.length}`,
    ...state.bots.map((b) => {
      const channels = state.botChannelMapping.get(b.token) ?? [];
      const mention = state.requireMentionMap.get(b.token) ? "需要 @" : "不需要 @";
      return `  • ${b.botName} (${b.profileName}): ${channels.length} 個頻道, ${mention}`;
    }),
    "",
    `全域白名單：${state.globalAllowFrom.join(", ")}`,
    `工具權限：${state.toolPermissions.join(", ")}`,
  ];

  p.note(summaryLines.join("\n"), "設定摘要");

  const confirmed = await p.confirm({
    message: "確認產出設定？（選「否」回到上一步修改）",
    initialValue: true,
  });

  if (p.isCancel(confirmed)) return "cancel";
  if (confirmed === false) return "back";

  // 開始寫入
  const channelsBase = join(homedir(), ".claude", "channels");
  const scriptsDir = join(channelsBase, "scripts");
  const settingsPath = join(homedir(), ".claude", "settings.json");

  const createdFiles: string[] = [];
  const inviteLinks: string[] = [];

  for (const bot of state.bots) {
    const profileDir = join(channelsBase, bot.profileName);
    const channelIds = state.botChannelMapping.get(bot.token) ?? [];
    const allowFrom = state.perBotAllowFrom.get(bot.token) ?? state.globalAllowFrom;
    const requireMention = state.requireMentionMap.get(bot.token) ?? true;

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

    if (bot.guilds.length === 0) {
      const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${bot.botId}&permissions=${DISCORD_BOT_PERMISSIONS}&scope=bot`;
      inviteLinks.push(`${bot.botName}: ${inviteLink}`);
    }
  }

  // 更新 settings.json
  {
    const s = p.spinner();
    s.start("更新 settings.json...");
    await updateSettingsJson(settingsPath, state.toolPermissions);
    s.stop("✓ settings.json 已更新");
  }

  // 寫入啟動腳本
  {
    const s = p.spinner();
    s.start("寫入啟動腳本...");
    const profileNames = state.bots.map((b) => b.profileName);
    await writeAllScripts(profileNames, scriptsDir);
    s.stop(`✓ 啟動腳本已寫入 ${scriptsDir}`);
    for (const pn of profileNames) {
      createdFiles.push(join(scriptsDir, `start-${pn}.sh`));
    }
    createdFiles.push(join(scriptsDir, "start-all.sh"));
  }

  // 顯示完成摘要
  const startAllPath = join(scriptsDir, "start-all.sh");

  p.note(
    [
      "建立的檔案：",
      ...createdFiles.map((f) => `  ${f}`),
      "",
      "啟動指令：",
      ...state.bots.map(
        (b) => `  DISCORD_STATE_DIR=~/.claude/channels/${b.profileName} \\`,
      ),
      ...state.bots.map(
        (b) => `    claude --channel plugin:discord@claude-plugins-official --dangerously-skip-permissions`,
      ),
      "",
      `一鍵啟動全部：bash ${startAllPath}`,
    ].join("\n"),
    "完成摘要"
  );

  if (inviteLinks.length > 0) {
    p.note(
      ["以下 bot 尚未加入任何伺服器，請使用邀請連結：", ...inviteLinks].join("\n"),
      "邀請連結"
    );
  }

  p.note(
    [
      "• 私有頻道需要在 Discord 中手動將 bot 加入",
      "• 使用 /channel-setup:verify 驗證設定是否正確",
    ].join("\n"),
    "提醒"
  );

  return "next";
}

// ==================== 主入口：狀態機 ====================

export async function runInteractive(): Promise<void> {
  p.intro("Discord Bot 批次設定精靈");

  const state = createEmptyState();
  const steps = [step1_registerTokens, step2_buildChannelPool, step3_mapBotChannels, step4_batchSettings, step5_generate];
  let currentStep = 0;

  while (currentStep < steps.length) {
    const result = await steps[currentStep](state);

    switch (result) {
      case "next":
        currentStep++;
        break;
      case "back":
        if (currentStep > 0) {
          currentStep--;
          p.log.info("← 回到上一步");
        }
        break;
      case "cancel":
        p.cancel("已取消");
        process.exit(0);
    }
  }

  p.outro("設定完成！");
}
