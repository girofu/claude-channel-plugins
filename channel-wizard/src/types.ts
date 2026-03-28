export interface GuildInfo {
  id: string;
  name: string;
}

export interface BotInfo {
  token: string;
  botName: string;
  botId: string;
  profileName: string;
  guilds: GuildInfo[];
}

export interface ChannelInfo {
  id: string;
  name: string;
  serverId: string;
  serverName: string;
  type: number;
  source: "api" | "manual";
}

export type ChannelPool = Map<string, ChannelInfo>;
export type BotChannelMapping = Map<string, string[]>;

export interface WizardConfig {
  bots: BotInfo[];
  channelPool: ChannelPool;
  mappings: BotChannelMapping;
  globalAllowFrom: string[];
  perBotAllowFrom: Map<string, string[]>;
  requireMention: Map<string, boolean>;
  toolPermissions: string[];
  scriptsDir: string;
}

export interface BatchBotEntry {
  token: string;
  profileName?: string;
  channels: string[];
  requireMention?: boolean;
  allowFrom?: string[];
}

export interface BatchImportSchema {
  bots: BatchBotEntry[];
  globalAllowFrom: string[];
  toolPermissions?: string[];
  scriptsDir?: string;
}

export interface AccessJson {
  dmPolicy: "pairing" | "allowlist" | "disabled";
  allowFrom: string[];
  groups: Record<string, { requireMention: boolean; allowFrom: string[] }>;
  mentionPatterns: string[];
  ackReaction: string;
  replyToMode: "first" | "off" | "all";
  textChunkLimit: number;
  chunkMode: "length" | "newline";
}

export const ALL_TOOL_PERMISSIONS = [
  "reply",
  "fetch_messages",
  "react",
  "edit_message",
  "download_attachment",
] as const;

export type ToolPermission = (typeof ALL_TOOL_PERMISSIONS)[number];
export const DISCORD_BOT_PERMISSIONS = 274878008384;
