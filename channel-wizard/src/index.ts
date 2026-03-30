#!/usr/bin/env node
import { Command } from "commander";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { validateTokens, fetchGuildChannels } from "./discord-api";
import { writeBotConfig } from "./config-writer";
import { writeAllScripts } from "./script-generator";
import { updateSettingsJson } from "./permissions";
import { parseBatchFile, resolveBatchConfig } from "./batch";
import { runInteractive } from "./interactive";
import type { BatchImportSchema, ToolPermission } from "./types";

const program = new Command();

program
  .name("channel-wizard")
  .description("Discord Bot 批次設定精靈")
  .version("1.0.0")
  .option("--import <file>", "從 JSON 檔案批次匯入")
  .option("--yes", "跳過確認（僅 --import）");

program.action(async (options: { import?: string; yes?: boolean }) => {
  if (options.import) {
    await runBatchMode(options.import, options.yes ?? false);
  } else {
    await runInteractive();
  }
});

async function runBatchMode(filePath: string, skipConfirm: boolean): Promise<void> {
  p.intro("Discord Bot 批次匯入精靈");

  // 1. parseBatchFile
  const s1 = p.spinner();
  s1.start(`解析批次檔案: ${filePath}`);
  const parseResult = await parseBatchFile(filePath);
  if (!parseResult.valid) {
    s1.error("批次檔案解析失敗");
    p.log.error(parseResult.errors?.join("\n") ?? "未知錯誤");
    process.exit(1);
  }
  s1.stop("✓ 批次檔案解析成功");

  const schema = parseResult.data as BatchImportSchema;

  // 2. validateTokens (parallel)
  const s2 = p.spinner();
  s2.start("驗證所有 Bot Tokens...");
  const tokens = schema.bots.map((b) => b.token);
  const validateResult = await validateTokens(tokens);
  s2.stop(
    `✓ 驗證完成：${validateResult.valid.length} 個有效，${validateResult.invalid.length} 個無效`
  );

  if (validateResult.invalid.length > 0) {
    p.log.warn("以下 token 無效：");
    for (const inv of validateResult.invalid) {
      p.log.warn(`  [${inv.index}] ${inv.token.substring(0, 20)}... → ${inv.error}`);
    }
  }

  if (validateResult.valid.length === 0) {
    p.cancel("沒有有效的 bot，結束");
    process.exit(1);
  }

  // 3. Resolve channels: ["*"] by calling fetchGuildChannels
  const s3 = p.spinner();
  s3.start("解析萬用字元頻道...");

  const resolvedSchema: BatchImportSchema = {
    ...schema,
    bots: [...schema.bots],
  };

  for (let i = 0; i < resolvedSchema.bots.length; i++) {
    const entry = resolvedSchema.bots[i];
    if (entry.channels.includes("*")) {
      // 找到對應的 BotInfo
      const botInfo = validateResult.valid.find((b) => b.token === entry.token);
      if (!botInfo) continue;

      const allChannelIds: string[] = [];
      for (const guild of botInfo.guilds) {
        const channels = await fetchGuildChannels(
          entry.token,
          guild.id,
          guild.name
        );
        for (const ch of channels) {
          if (!allChannelIds.includes(ch.id)) {
            allChannelIds.push(ch.id);
          }
        }
      }

      resolvedSchema.bots[i] = {
        ...entry,
        channels: allChannelIds,
      };
    }
  }

  s3.stop("✓ 頻道解析完成");

  // 4. resolveBatchConfig
  const wizardConfig = resolveBatchConfig(resolvedSchema, validateResult.valid);

  // 5. Show summary, confirm (skip with --yes)
  const summaryLines = [
    `Bots: ${wizardConfig.bots.length}`,
    ...wizardConfig.bots.map((b) => {
      const channels = wizardConfig.mappings.get(b.token) ?? [];
      return `  • ${b.botName} (${b.profileName}): ${channels.length} 個頻道`;
    }),
    `全域 allowFrom: ${wizardConfig.globalAllowFrom.join(", ")}`,
    `工具權限: ${wizardConfig.toolPermissions.join(", ")}`,
    `腳本目錄: ${wizardConfig.scriptsDir}`,
  ];

  p.note(summaryLines.join("\n"), "匯入摘要");

  if (!skipConfirm) {
    const confirmed = await p.confirm({
      message: "確認套用上述設定？",
      initialValue: true,
    });

    if (p.isCancel(confirmed) || confirmed === false) {
      p.cancel("已取消");
      process.exit(0);
    }
  }

  // 6. writeBotConfig for each, updateSettingsJson, writeAllScripts
  const channelsBase = join(homedir(), ".claude", "channels");
  const settingsPath = join(homedir(), ".claude", "settings.json");

  // Use scriptsDir from config, expanding ~ if needed
  const scriptsDir = wizardConfig.scriptsDir.startsWith("~/")
    ? join(homedir(), wizardConfig.scriptsDir.substring(2))
    : wizardConfig.scriptsDir;

  for (const bot of wizardConfig.bots) {
    const profileDir = join(channelsBase, bot.profileName);
    const channelIds = wizardConfig.mappings.get(bot.token) ?? [];
    const allowFrom = wizardConfig.perBotAllowFrom.get(bot.token) ?? wizardConfig.globalAllowFrom;
    const requireMention = wizardConfig.requireMention.get(bot.token) ?? true;

    const s = p.spinner();
    s.start(`寫入 ${bot.botName || bot.profileName} 的設定...`);

    await writeBotConfig({
      profileDir,
      token: bot.token,
      botId: bot.botId,
      channelIds,
      allowFrom,
      requireMention,
    });

    s.stop(`✓ ${bot.botName || bot.profileName} 設定已寫入 ${profileDir}`);
  }

  // updateSettingsJson
  {
    const s = p.spinner();
    s.start("更新 settings.json...");
    await updateSettingsJson(
      settingsPath,
      wizardConfig.toolPermissions as ToolPermission[]
    );
    s.stop("✓ settings.json 已更新");
  }

  // writeAllScripts
  {
    const s = p.spinner();
    s.start("寫入啟動腳本...");
    const profileNames = wizardConfig.bots.map((b) => b.profileName);
    await writeAllScripts(profileNames, scriptsDir);
    s.stop(`✓ 啟動腳本已寫入 ${scriptsDir}`);
  }

  // 7. Display startup commands
  const startAllPath = join(scriptsDir, "start-all.sh");
  p.note(
    [
      "啟動指令：",
      ...wizardConfig.bots.map(
        (b) => `  bash ${join(scriptsDir, `start-${b.profileName}.sh`)}`
      ),
      "",
      `或一次啟動全部：bash ${startAllPath}`,
    ].join("\n"),
    "完成"
  );

  p.outro("批次匯入完成！");
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
