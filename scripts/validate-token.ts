#!/usr/bin/env bun
// 驗證 Discord/Telegram bot token
// 用法: TOKEN=xxx bun run scripts/validate-token.ts <channel>
// channel: "discord" 或 "telegram"

import { runScript, requireEnv, requireArg } from "./helpers.js";
import { validateDiscordToken } from "../src/channels/discord.js";
import { validateTelegramToken } from "../src/channels/telegram.js";

runScript(async () => {
  const channel = requireArg(0, "channel");
  const token = requireEnv("TOKEN");

  if (channel === "discord") {
    const result = await validateDiscordToken(token);
    if (!result.valid) throw new Error(result.error);
    return { channel: "discord", bot: result.bot };
  }

  if (channel === "telegram") {
    const result = await validateTelegramToken(token);
    if (!result.valid) throw new Error(result.error);
    return { channel: "telegram", bot: result.bot };
  }

  throw new Error(`Unsupported channel: ${channel}. Use "discord" or "telegram".`);
});
