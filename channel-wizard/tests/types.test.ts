import { describe, it, expect } from "bun:test";
import type {
  GuildInfo,
  BotInfo,
  ChannelInfo,
  ChannelPool,
  BotChannelMapping,
  WizardConfig,
  BatchBotEntry,
  BatchImportSchema,
  AccessJson,
  ToolPermission,
} from "../src/types";
import { ALL_TOOL_PERMISSIONS, DISCORD_BOT_PERMISSIONS } from "../src/types";

describe("Type definitions", () => {
  it("GuildInfo can be created with correct shape", () => {
    const guild: GuildInfo = {
      id: "123456789",
      name: "My Server",
    };
    expect(guild.id).toBe("123456789");
    expect(guild.name).toBe("My Server");
  });

  it("BotInfo can be created with correct shape", () => {
    const bot: BotInfo = {
      token: "Bot token here",
      botName: "MyBot",
      botId: "987654321",
      profileName: "my-profile",
      guilds: [{ id: "111", name: "Server One" }],
    };
    expect(bot.token).toBe("Bot token here");
    expect(bot.botName).toBe("MyBot");
    expect(bot.guilds).toHaveLength(1);
  });

  it("ChannelInfo can be created with api source", () => {
    const channel: ChannelInfo = {
      id: "ch-001",
      name: "general",
      serverId: "srv-001",
      serverName: "My Server",
      type: 0,
      source: "api",
    };
    expect(channel.source).toBe("api");
  });

  it("ChannelInfo can be created with manual source", () => {
    const channel: ChannelInfo = {
      id: "ch-002",
      name: "announcements",
      serverId: "srv-001",
      serverName: "My Server",
      type: 0,
      source: "manual",
    };
    expect(channel.source).toBe("manual");
  });

  it("ChannelPool (Map<string, ChannelInfo>) can be created", () => {
    const pool: ChannelPool = new Map();
    const channel: ChannelInfo = {
      id: "ch-001",
      name: "general",
      serverId: "srv-001",
      serverName: "My Server",
      type: 0,
      source: "api",
    };
    pool.set("ch-001", channel);
    expect(pool.size).toBe(1);
    expect(pool.get("ch-001")?.name).toBe("general");
  });

  it("BotChannelMapping (Map<string, string[]>) can be created", () => {
    const mapping: BotChannelMapping = new Map();
    mapping.set("bot-profile-1", ["ch-001", "ch-002"]);
    expect(mapping.get("bot-profile-1")).toEqual(["ch-001", "ch-002"]);
  });

  it("WizardConfig can be created with all required fields", () => {
    const config: WizardConfig = {
      bots: [],
      channelPool: new Map(),
      mappings: new Map(),
      globalAllowFrom: ["user1"],
      perBotAllowFrom: new Map(),
      requireMention: new Map(),
      toolPermissions: ["reply"],
      scriptsDir: "/home/user/scripts",
    };
    expect(config.globalAllowFrom).toEqual(["user1"]);
    expect(config.scriptsDir).toBe("/home/user/scripts");
  });

  it("BatchBotEntry can be created with required fields only", () => {
    const entry: BatchBotEntry = {
      token: "bot-token",
      channels: ["ch-001"],
    };
    expect(entry.token).toBe("bot-token");
    expect(entry.profileName).toBeUndefined();
  });

  it("BatchBotEntry can be created with all optional fields", () => {
    const entry: BatchBotEntry = {
      token: "bot-token",
      profileName: "my-bot",
      channels: ["ch-001", "ch-002"],
      requireMention: true,
      allowFrom: ["user1"],
    };
    expect(entry.profileName).toBe("my-bot");
    expect(entry.requireMention).toBe(true);
  });

  it("BatchImportSchema can be created with required fields", () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "tk", channels: ["ch-1"] }],
      globalAllowFrom: [],
    };
    expect(schema.bots).toHaveLength(1);
    expect(schema.toolPermissions).toBeUndefined();
  });

  it("BatchImportSchema can be created with all optional fields", () => {
    const schema: BatchImportSchema = {
      bots: [],
      globalAllowFrom: ["everyone"],
      toolPermissions: ["reply", "fetch_messages"],
      scriptsDir: "/scripts",
    };
    expect(schema.scriptsDir).toBe("/scripts");
  });

  it("AccessJson can be created with all required fields", () => {
    const access: AccessJson = {
      dmPolicy: "pairing",
      allowFrom: [],
      groups: {
        myGroup: { requireMention: true, allowFrom: ["user1"] },
      },
      mentionPatterns: [],
      ackReaction: "✅",
      replyToMode: "first",
      textChunkLimit: 2000,
      chunkMode: "length",
    };
    expect(access.dmPolicy).toBe("pairing");
    expect(access.replyToMode).toBe("first");
    expect(access.chunkMode).toBe("length");
  });

  it("ALL_TOOL_PERMISSIONS contains expected permissions", () => {
    expect(ALL_TOOL_PERMISSIONS).toContain("reply");
    expect(ALL_TOOL_PERMISSIONS).toContain("fetch_messages");
    expect(ALL_TOOL_PERMISSIONS).toContain("react");
    expect(ALL_TOOL_PERMISSIONS).toContain("edit_message");
    expect(ALL_TOOL_PERMISSIONS).toContain("download_attachment");
    expect(ALL_TOOL_PERMISSIONS).toHaveLength(5);
  });

  it("ToolPermission type accepts valid values", () => {
    const perm: ToolPermission = "reply";
    expect(perm).toBe("reply");
  });

  it("DISCORD_BOT_PERMISSIONS is correct numeric value", () => {
    expect(DISCORD_BOT_PERMISSIONS).toBe(274878008384);
  });
});
