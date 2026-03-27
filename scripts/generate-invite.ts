#!/usr/bin/env bun
// 產生 Discord bot OAuth2 邀請 URL
// 用法: bun run scripts/generate-invite.ts <botId>

import { runScript, requireArg } from "./helpers.js";
import { generateInviteUrl } from "../src/channels/discord.js";

runScript(async () => {
  const botId = requireArg(0, "botId");
  const url = generateInviteUrl(botId);
  return { url };
});
