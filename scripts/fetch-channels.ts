#!/usr/bin/env bun
// 取得 Discord server 的 text channel 列表（含 category）
// 用法: TOKEN=xxx bun run scripts/fetch-channels.ts <guildId>

import { runScript, requireEnv, requireArg } from "./helpers.js";
import { fetchGuildChannelsWithCategories } from "../src/channels/discord.js";

runScript(async () => {
  const token = requireEnv("TOKEN");
  const guildId = requireArg(0, "guildId");
  const channels = await fetchGuildChannelsWithCategories(token, guildId);
  return channels;
});
