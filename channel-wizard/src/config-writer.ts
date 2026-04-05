import { mkdir, writeFile, readFile, chmod } from "fs/promises";
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

export interface AddUsersResult {
  added: string[];
  alreadyPresent: string[];
}

export async function addUsersToProfile(
  profileDir: string,
  userIds: string[],
  applyToGroups: boolean
): Promise<AddUsersResult> {
  const jsonPath = join(profileDir, "access.json");
  let accessJson: AccessJson;

  try {
    const raw = await readFile(jsonPath, "utf-8");
    accessJson = JSON.parse(raw) as AccessJson;
  } catch {
    throw new Error(`找不到 ${jsonPath}，請先執行設定精靈`);
  }

  const existing = new Set(accessJson.allowFrom ?? []);
  const added: string[] = [];
  const alreadyPresent: string[] = [];

  for (const id of userIds) {
    if (existing.has(id)) {
      alreadyPresent.push(id);
    } else {
      existing.add(id);
      added.push(id);
    }
  }

  accessJson.allowFrom = Array.from(existing);

  if (applyToGroups && accessJson.groups) {
    for (const group of Object.values(accessJson.groups)) {
      const groupSet = new Set(group.allowFrom ?? []);
      for (const id of userIds) {
        groupSet.add(id);
      }
      group.allowFrom = Array.from(groupSet);
    }
  }

  await writeAccessJson(profileDir, accessJson);
  return { added, alreadyPresent };
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
