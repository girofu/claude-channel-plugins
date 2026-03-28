import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  validateBatchSchema,
  parseBatchFile,
  resolveBatchConfig,
} from "../src/batch";
import type { BatchImportSchema, BotInfo } from "../src/types";
import { ALL_TOOL_PERMISSIONS } from "../src/types";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "batch-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ─── validateBatchSchema ──────────────────────────────────────────────────────

describe("validateBatchSchema", () => {
  it("accepts a valid schema with globalAllowFrom", () => {
    const schema: BatchImportSchema = {
      bots: [
        { token: "tok1", channels: ["ch1", "ch2"] },
        { token: "tok2", channels: ["ch3"] },
      ],
      globalAllowFrom: ["user1", "user2"],
    };
    const result = validateBatchSchema(schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("rejects when bots field is missing", () => {
    const result = validateBatchSchema({ globalAllowFrom: ["u1"] });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => /bots/.test(e))).toBe(true);
  });

  it("rejects when bots is an empty array", () => {
    const result = validateBatchSchema({ bots: [], globalAllowFrom: ["u1"] });
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => /bots/.test(e))).toBe(true);
  });

  it("rejects when a bot entry is missing token", () => {
    const result = validateBatchSchema({
      bots: [{ channels: ["ch1"] }],
      globalAllowFrom: ["u1"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => /token/.test(e))).toBe(true);
  });

  it("rejects when a bot entry is missing channels", () => {
    const result = validateBatchSchema({
      bots: [{ token: "tok1" }],
      globalAllowFrom: ["u1"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => /channels/.test(e))).toBe(true);
  });

  it("rejects when globalAllowFrom is empty and no bot has allowFrom", () => {
    const result = validateBatchSchema({
      bots: [{ token: "tok1", channels: ["ch1"] }],
      globalAllowFrom: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => /allowFrom/.test(e))).toBe(true);
  });

  it("accepts when globalAllowFrom is empty but every bot has its own allowFrom", () => {
    const schema: BatchImportSchema = {
      bots: [
        { token: "tok1", channels: ["ch1"], allowFrom: ["alice"] },
        { token: "tok2", channels: ["ch2"], allowFrom: ["bob"] },
      ],
      globalAllowFrom: [],
    };
    const result = validateBatchSchema(schema);
    expect(result.valid).toBe(true);
  });

  it("rejects when globalAllowFrom is empty and only SOME bots have allowFrom", () => {
    const result = validateBatchSchema({
      bots: [
        { token: "tok1", channels: ["ch1"], allowFrom: ["alice"] },
        { token: "tok2", channels: ["ch2"] }, // no allowFrom
      ],
      globalAllowFrom: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => /allowFrom/.test(e))).toBe(true);
  });
});

// ─── parseBatchFile ───────────────────────────────────────────────────────────

describe("parseBatchFile", () => {
  it("parses a valid JSON file and returns data", async () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "tok1", channels: ["ch1"] }],
      globalAllowFrom: ["user1"],
    };
    const filePath = join(tempDir, "batch.json");
    await writeFile(filePath, JSON.stringify(schema), "utf-8");

    const result = await parseBatchFile(filePath);
    expect(result.valid).toBe(true);
    expect(result.data).toBeDefined();
    expect((result.data as BatchImportSchema).bots[0].token).toBe("tok1");
  });

  it("returns error when file does not exist", async () => {
    const filePath = join(tempDir, "nonexistent.json");
    const result = await parseBatchFile(filePath);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => /File not found/.test(e))).toBe(true);
    expect(result.errors!.some((e) => e.includes(filePath))).toBe(true);
  });

  it("returns error when file contains invalid JSON", async () => {
    const filePath = join(tempDir, "bad.json");
    await writeFile(filePath, "{ this is not valid json }", "utf-8");

    const result = await parseBatchFile(filePath);
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => /Invalid JSON/.test(e))).toBe(true);
  });

  it("propagates schema validation errors from a valid JSON file", async () => {
    const filePath = join(tempDir, "invalid-schema.json");
    await writeFile(filePath, JSON.stringify({ bots: [], globalAllowFrom: [] }), "utf-8");

    const result = await parseBatchFile(filePath);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });
});

// ─── resolveBatchConfig ───────────────────────────────────────────────────────

describe("resolveBatchConfig", () => {
  const botInfos: BotInfo[] = [
    {
      token: "tok1",
      botName: "Bot One",
      botId: "id1",
      profileName: "profile-one",
      guilds: [],
    },
    {
      token: "tok2",
      botName: "Bot Two",
      botId: "id2",
      profileName: "profile-two",
      guilds: [],
    },
  ];

  it("merges globalAllowFrom with per-bot allowFrom (deduplicates)", () => {
    const schema: BatchImportSchema = {
      bots: [
        { token: "tok1", channels: ["ch1"], allowFrom: ["alice", "charlie"] },
        { token: "tok2", channels: ["ch2"] },
      ],
      globalAllowFrom: ["alice", "bob"],
    };

    const config = resolveBatchConfig(schema, botInfos);

    const bot1Allow = config.perBotAllowFrom.get("tok1")!;
    expect(bot1Allow).toContain("alice");
    expect(bot1Allow).toContain("bob");
    expect(bot1Allow).toContain("charlie");
    // deduplicated — alice appears only once
    expect(bot1Allow.filter((u) => u === "alice").length).toBe(1);

    const bot2Allow = config.perBotAllowFrom.get("tok2")!;
    expect(bot2Allow).toEqual(["alice", "bob"]);
  });

  it("defaults toolPermissions to ALL_TOOL_PERMISSIONS when not specified", () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "tok1", channels: ["ch1"] }],
      globalAllowFrom: ["user1"],
    };

    const config = resolveBatchConfig(schema, [botInfos[0]]);
    expect(config.toolPermissions).toEqual([...ALL_TOOL_PERMISSIONS]);
  });

  it("uses custom toolPermissions when specified", () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "tok1", channels: ["ch1"] }],
      globalAllowFrom: ["user1"],
      toolPermissions: ["reply", "react"],
    };

    const config = resolveBatchConfig(schema, [botInfos[0]]);
    expect(config.toolPermissions).toEqual(["reply", "react"]);
  });

  it("defaults scriptsDir to ~/.claude/channels/scripts/", () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "tok1", channels: ["ch1"] }],
      globalAllowFrom: ["user1"],
    };

    const config = resolveBatchConfig(schema, [botInfos[0]]);
    expect(config.scriptsDir).toBe("~/.claude/channels/scripts/");
  });

  it("uses custom scriptsDir when specified", () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "tok1", channels: ["ch1"] }],
      globalAllowFrom: ["user1"],
      scriptsDir: "/custom/scripts/",
    };

    const config = resolveBatchConfig(schema, [botInfos[0]]);
    expect(config.scriptsDir).toBe("/custom/scripts/");
  });

  it("defaults requireMention to true when not specified in bot entry", () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "tok1", channels: ["ch1"] }],
      globalAllowFrom: ["user1"],
    };

    const config = resolveBatchConfig(schema, [botInfos[0]]);
    expect(config.requireMention.get("tok1")).toBe(true);
  });

  it("respects requireMention: false when specified", () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "tok1", channels: ["ch1"], requireMention: false }],
      globalAllowFrom: ["user1"],
    };

    const config = resolveBatchConfig(schema, [botInfos[0]]);
    expect(config.requireMention.get("tok1")).toBe(false);
  });

  it("uses profileName from schema entry when provided", () => {
    const schema: BatchImportSchema = {
      bots: [
        { token: "tok1", channels: ["ch1"], profileName: "custom-profile" },
      ],
      globalAllowFrom: ["user1"],
    };

    const config = resolveBatchConfig(schema, [botInfos[0]]);
    const bot = config.bots.find((b) => b.token === "tok1");
    expect(bot?.profileName).toBe("custom-profile");
  });

  it("falls back to profileName from botInfo when schema entry has none", () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "tok1", channels: ["ch1"] }],
      globalAllowFrom: ["user1"],
    };

    const config = resolveBatchConfig(schema, [botInfos[0]]);
    const bot = config.bots.find((b) => b.token === "tok1");
    expect(bot?.profileName).toBe("profile-one");
  });

  it("builds channelPool from all bot channels", () => {
    const schema: BatchImportSchema = {
      bots: [
        { token: "tok1", channels: ["ch1", "ch2"] },
        { token: "tok2", channels: ["ch3"] },
      ],
      globalAllowFrom: ["user1"],
    };

    const config = resolveBatchConfig(schema, botInfos);
    expect(config.channelPool.has("ch1")).toBe(true);
    expect(config.channelPool.has("ch2")).toBe(true);
    expect(config.channelPool.has("ch3")).toBe(true);
  });

  it("builds mappings from bot tokens to channel ids", () => {
    const schema: BatchImportSchema = {
      bots: [
        { token: "tok1", channels: ["ch1", "ch2"] },
        { token: "tok2", channels: ["ch3"] },
      ],
      globalAllowFrom: ["user1"],
    };

    const config = resolveBatchConfig(schema, botInfos);
    expect(config.mappings.get("tok1")).toEqual(["ch1", "ch2"]);
    expect(config.mappings.get("tok2")).toEqual(["ch3"]);
  });
});
