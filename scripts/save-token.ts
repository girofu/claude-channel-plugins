#!/usr/bin/env bun
// 儲存 bot token 到 .env（含 chmod 600）
// 用法: TOKEN=xxx bun run scripts/save-token.ts <channel> [profile]

import { runScript, requireEnv, requireArg, optionalArg } from "./helpers.js";
import { saveProfileConfig, getProfileDir } from "../src/lib/profile.js";

runScript(async () => {
  const token = requireEnv("TOKEN");
  const channel = requireArg(0, "channel");
  const profile = optionalArg(1);

  saveProfileConfig(channel, profile, token);

  const dir = getProfileDir(channel, profile);
  return { channel, profile: profile ?? "default", dir };
});
