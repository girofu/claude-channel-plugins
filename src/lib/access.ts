// Claude Code channel access.json management module

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface GroupPolicy {
  requireMention: boolean;
  allowFrom?: string[];
}

export interface PendingEntry {
  senderId: string;
  chatId: string;
  createdAt: number;
  expiresAt: number;
  replies: number;
}

export interface AccessConfig {
  dmPolicy: "pairing" | "allowlist" | "disabled";
  allowFrom: string[];
  groups: Record<string, GroupPolicy>;
  pending: Record<string, PendingEntry>;
  mentionPatterns?: string[];
  userLabels?: Record<string, string>;
  // 以下為官方 plugin 的 delivery/UX 設定欄位
  ackReaction?: string;
  replyToMode?: "off" | "first" | "all";
  textChunkLimit?: number;
  chunkMode?: "length" | "newline";
}

export interface PendingListEntry {
  code: string;
  senderId: string;
  chatId: string;
  createdAt: number;
  expiresAt: number;
  replies: number;
}

export type ApprovePairingResult =
  | { success: true; config: AccessConfig; senderId: string; chatId: string }
  | { success: false; error: string };

export interface GroupListEntry {
  channelId: string;
  requireMention: boolean;
  allowFrom?: string[];
}

function getAccessFilePath(channel: string, baseDir?: string): string {
  const base = baseDir ?? path.join(os.homedir(), ".claude");
  return path.join(base, "channels", channel, "access.json");
}

/** Load access.json; returns default config if file does not exist */
export function loadAccessConfig(
  channel: string,
  baseDir?: string,
): AccessConfig {
  const filePath = getAccessFilePath(channel, baseDir);

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as AccessConfig;
  } catch {
    return {
      dmPolicy: "pairing",
      allowFrom: [],
      groups: {},
      pending: {},
    };
  }
}

/** Save access.json */
export function saveAccessConfig(
  channel: string,
  config: AccessConfig,
  baseDir?: string,
): void {
  const filePath = getAccessFilePath(channel, baseDir);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}

/** Load access.json directly from a specified directory */
export function loadAccessConfigFromDir(dir: string): AccessConfig {
  const filePath = path.join(dir, "access.json");
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as AccessConfig;
  } catch {
    return {
      dmPolicy: "pairing",
      allowFrom: [],
      groups: {},
      pending: {},
    };
  }
}

/** Save access.json to a specified directory */
export function saveAccessConfigToDir(dir: string, config: AccessConfig): void {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "access.json");
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}

/** Add or update a group (Discord channel) */
export function addGroup(
  config: AccessConfig,
  channelId: string,
  policy: GroupPolicy,
): AccessConfig {
  // 官方 plugin 預期每個 group 都有 allowFrom 欄位
  const normalizedPolicy: GroupPolicy = {
    requireMention: policy.requireMention,
    allowFrom: policy.allowFrom ?? [],
  };
  return {
    ...config,
    groups: {
      ...config.groups,
      [channelId]: normalizedPolicy,
    },
  };
}

/** Remove a group */
export function removeGroup(
  config: AccessConfig,
  channelId: string,
): AccessConfig {
  const { [channelId]: _, ...rest } = config.groups;
  return {
    ...config,
    groups: rest,
  };
}

/** List all groups */
export function listGroups(config: AccessConfig): GroupListEntry[] {
  return Object.entries(config.groups).map(([channelId, policy]) => ({
    channelId,
    requireMention: policy.requireMention,
    ...(policy.allowFrom ? { allowFrom: policy.allowFrom } : {}),
  }));
}

/** Set the DM policy */
export function setDmPolicy(
  config: AccessConfig,
  policy: "pairing" | "allowlist" | "disabled",
): AccessConfig {
  return { ...config, dmPolicy: policy };
}

/** Set mention patterns (e.g., ["@mybot"]) */
export function setMentionPatterns(
  config: AccessConfig,
  patterns: string[],
): AccessConfig {
  return { ...config, mentionPatterns: patterns };
}

/** Approve a pending pairing code (official plugin pair <code> flow) */
export function approvePairing(
  config: AccessConfig,
  code: string,
): ApprovePairingResult {
  const entry = config.pending[code];
  if (!entry) {
    return { success: false, error: `Pairing code "${code}" not found` };
  }
  if (entry.expiresAt < Date.now()) {
    return { success: false, error: `Pairing code "${code}" has expired` };
  }

  const { senderId, chatId } = entry;

  // 加入 allowFrom（去重）
  const allowFrom = config.allowFrom.includes(senderId)
    ? config.allowFrom
    : [...config.allowFrom, senderId];

  // 刪除 pending entry
  const { [code]: _, ...remainingPending } = config.pending;

  return {
    success: true,
    config: { ...config, allowFrom, pending: remainingPending },
    senderId,
    chatId,
  };
}

/** Deny a pending pairing code */
export function denyPairing(
  config: AccessConfig,
  code: string,
): AccessConfig {
  const { [code]: _, ...remainingPending } = config.pending;
  return { ...config, pending: remainingPending };
}

/** List all pending pairing entries */
export function listPending(config: AccessConfig): PendingListEntry[] {
  return Object.entries(config.pending).map(([code, entry]) => ({
    code,
    senderId: entry.senderId,
    chatId: entry.chatId,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    replies: entry.replies,
  }));
}

/** Write the approved file (channel server polls this to send "you're in") */
export function writeApprovedFile(
  channelDir: string,
  senderId: string,
  chatId: string,
): void {
  const approvedDir = path.join(channelDir, "approved");
  fs.mkdirSync(approvedDir, { recursive: true });
  fs.writeFileSync(path.join(approvedDir, senderId), chatId, "utf-8");
}

/** Add a user to the DM allowlist */
export function addAllowedUser(
  config: AccessConfig,
  userId: string,
): AccessConfig {
  if (config.allowFrom.includes(userId)) {
    return config;
  }
  return {
    ...config,
    allowFrom: [...config.allowFrom, userId],
  };
}

/** Add a user to the DM allowlist with a display name label */
export function addAllowedUserWithLabel(
  config: AccessConfig,
  userId: string,
  label: string,
): AccessConfig {
  const allowFrom = config.allowFrom.includes(userId)
    ? config.allowFrom
    : [...config.allowFrom, userId];
  return {
    ...config,
    allowFrom,
    userLabels: {
      ...config.userLabels,
      [userId]: label,
    },
  };
}
