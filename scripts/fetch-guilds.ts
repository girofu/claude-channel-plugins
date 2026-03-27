#!/usr/bin/env bun
// 取得 Discord bot 已加入的 server 列表
// 用法: TOKEN=xxx bun run scripts/fetch-guilds.ts

import { runScript, requireEnv } from "./helpers.js";
import { fetchBotGuilds } from "../src/channels/discord.js";

runScript(async () => {
  const token = requireEnv("TOKEN");
  const guilds = await fetchBotGuilds(token);
  return guilds;
});
