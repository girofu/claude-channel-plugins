import { mkdir, writeFile, chmod } from "fs/promises";
import { join } from "path";
import type { AccessJson } from "./types";

export async function writeEnvFile(
  profileDir: string,
  token: string
): Promise<void> {
  await mkdir(profileDir, { recursive: true });
  const envPath = join(profileDir, ".env");
  await writeFile(envPath, `DISCORD_BOT_TOKEN=${token}\n`, "utf-8");
  await chmod(envPath, 0o600);
}

export async function writeAccessJson(
  profileDir: string,
  accessJson: AccessJson
): Promise<void> {
  await mkdir(profileDir, { recursive: true });
  const jsonPath = join(profileDir, "access.json");
  await writeFile(jsonPath, JSON.stringify(accessJson, null, 2) + "\n", "utf-8");
}

export interface WriteBotConfigOptions {
  profileDir: string;
  token: string;
  botId: string;
  channelIds: string[];
  allowFrom: string[];
  requireMention: boolean;
}

export async function writeBotConfig(
  options: WriteBotConfigOptions
): Promise<void> {
  const { profileDir, token, botId, channelIds, allowFrom, requireMention } =
    options;

  await writeEnvFile(profileDir, token);

  const groups: AccessJson["groups"] = {};
  for (const channelId of channelIds) {
    groups[channelId] = {
      requireMention,
      allowFrom: [...allowFrom],
    };
  }

  const accessJson: AccessJson = {
    dmPolicy: "pairing",
    allowFrom: [...allowFrom],
    groups,
    mentionPatterns: [`<@${botId}>`],
    ackReaction: "eyes",
    replyToMode: "first",
    textChunkLimit: 2000,
    chunkMode: "length",
  };

  await writeAccessJson(profileDir, accessJson);
}
