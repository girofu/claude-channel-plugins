import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  writeEnvFile,
  writeAccessJson,
  writeBotConfig,
  addUsersToProfile,
} from "../src/config-writer";
import type { AccessJson } from "../src/types";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "config-writer-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("writeEnvFile", () => {
  it("writes correct content to .env", async () => {
    const profileDir = join(tempDir, "myprofile");
    await writeEnvFile(profileDir, "my-secret-token");

    const content = await readFile(join(profileDir, ".env"), "utf-8");
    expect(content).toBe("DISCORD_BOT_TOKEN=my-secret-token\n");
  });

  it("sets .env file permissions to 0o600", async () => {
    const profileDir = join(tempDir, "myprofile");
    await writeEnvFile(profileDir, "my-secret-token");

    const s = await stat(join(profileDir, ".env"));
    // Check last 3 octal digits: owner=6, group=0, other=0
    expect(s.mode & 0o777).toBe(0o600);
  });

  it("creates profileDir if it does not exist", async () => {
    const profileDir = join(tempDir, "nested", "dir", "profile");
    await writeEnvFile(profileDir, "tok");

    const s = await stat(join(profileDir, ".env"));
    expect(s.isFile()).toBe(true);
  });
});

describe("writeAccessJson", () => {
  it("writes valid JSON with correct structure", async () => {
    const profileDir = join(tempDir, "myprofile");
    const accessJson: AccessJson = {
      dmPolicy: "pairing",
      allowFrom: ["user1"],
      groups: {
        "123456": { requireMention: true, allowFrom: ["user1"] },
      },
      mentionPatterns: ["<@987654>"],
      ackReaction: "eyes",
      replyToMode: "first",
      textChunkLimit: 2000,
      chunkMode: "length",
    };

    await writeAccessJson(profileDir, accessJson);

    const raw = await readFile(join(profileDir, "access.json"), "utf-8");
    // Must end with newline
    expect(raw.endsWith("\n")).toBe(true);

    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(accessJson);
  });

  it("creates profileDir if it does not exist", async () => {
    const profileDir = join(tempDir, "deep", "nested");
    const accessJson: AccessJson = {
      dmPolicy: "pairing",
      allowFrom: [],
      groups: {},
      mentionPatterns: [],
      ackReaction: "eyes",
      replyToMode: "first",
      textChunkLimit: 2000,
      chunkMode: "length",
    };

    await writeAccessJson(profileDir, accessJson);

    const s = await stat(join(profileDir, "access.json"));
    expect(s.isFile()).toBe(true);
  });
});

describe("writeBotConfig", () => {
  it("creates complete profile with both files (requireMention true)", async () => {
    const profileDir = join(tempDir, "bot-profile");
    await writeBotConfig({
      profileDir,
      token: "bot-token-123",
      botId: "111222333",
      channelIds: ["aaa", "bbb"],
      allowFrom: ["alice", "bob"],
      requireMention: true,
    });

    // Check .env
    const envContent = await readFile(join(profileDir, ".env"), "utf-8");
    expect(envContent).toBe("DISCORD_BOT_TOKEN=bot-token-123\n");

    // Check .env permissions
    const envStat = await stat(join(profileDir, ".env"));
    expect(envStat.mode & 0o777).toBe(0o600);

    // Check access.json
    const raw = await readFile(join(profileDir, "access.json"), "utf-8");
    const parsed: AccessJson = JSON.parse(raw);

    expect(parsed.dmPolicy).toBe("pairing");
    expect(parsed.allowFrom).toEqual(["alice", "bob"]);
    expect(parsed.mentionPatterns).toEqual(["<@111222333>"]);
    expect(parsed.ackReaction).toBe("eyes");
    expect(parsed.replyToMode).toBe("first");
    expect(parsed.textChunkLimit).toBe(2000);
    expect(parsed.chunkMode).toBe("length");

    expect(parsed.groups["aaa"]).toEqual({
      requireMention: true,
      allowFrom: ["alice", "bob"],
    });
    expect(parsed.groups["bbb"]).toEqual({
      requireMention: true,
      allowFrom: ["alice", "bob"],
    });
  });

  it("creates complete profile with requireMention false", async () => {
    const profileDir = join(tempDir, "bot-profile-nomention");
    await writeBotConfig({
      profileDir,
      token: "tok-xyz",
      botId: "999888777",
      channelIds: ["ch1"],
      allowFrom: ["everyone"],
      requireMention: false,
    });

    const raw = await readFile(join(profileDir, "access.json"), "utf-8");
    const parsed: AccessJson = JSON.parse(raw);

    expect(parsed.groups["ch1"]).toEqual({
      requireMention: false,
      allowFrom: ["everyone"],
    });
  });
});

describe("addUsersToProfile", () => {
  it("adds new users to allowFrom", async () => {
    const profileDir = join(tempDir, "add-user-profile");
    await writeBotConfig({
      profileDir,
      token: "tok",
      botId: "111",
      channelIds: ["ch1"],
      allowFrom: ["alice"],
      requireMention: true,
    });

    const result = await addUsersToProfile(profileDir, ["bob", "carol"], false);

    expect(result.added).toEqual(["bob", "carol"]);
    expect(result.alreadyPresent).toEqual([]);

    const raw = await readFile(join(profileDir, "access.json"), "utf-8");
    const parsed: AccessJson = JSON.parse(raw);
    expect(parsed.allowFrom).toContain("alice");
    expect(parsed.allowFrom).toContain("bob");
    expect(parsed.allowFrom).toContain("carol");
  });

  it("reports already present users without duplicating", async () => {
    const profileDir = join(tempDir, "add-user-dup");
    await writeBotConfig({
      profileDir,
      token: "tok",
      botId: "111",
      channelIds: ["ch1"],
      allowFrom: ["alice"],
      requireMention: true,
    });

    const result = await addUsersToProfile(profileDir, ["alice", "bob"], false);

    expect(result.added).toEqual(["bob"]);
    expect(result.alreadyPresent).toEqual(["alice"]);

    const raw = await readFile(join(profileDir, "access.json"), "utf-8");
    const parsed: AccessJson = JSON.parse(raw);
    // alice must not be duplicated
    expect(parsed.allowFrom.filter((id) => id === "alice")).toHaveLength(1);
  });

  it("syncs users to groups when applyToGroups=true", async () => {
    const profileDir = join(tempDir, "add-user-groups");
    await writeBotConfig({
      profileDir,
      token: "tok",
      botId: "111",
      channelIds: ["ch1", "ch2"],
      allowFrom: ["alice"],
      requireMention: true,
    });

    await addUsersToProfile(profileDir, ["bob"], true);

    const raw = await readFile(join(profileDir, "access.json"), "utf-8");
    const parsed: AccessJson = JSON.parse(raw);

    expect(parsed.groups["ch1"].allowFrom).toContain("bob");
    expect(parsed.groups["ch2"].allowFrom).toContain("bob");
  });

  it("does not sync users to groups when applyToGroups=false", async () => {
    const profileDir = join(tempDir, "add-user-nogroups");
    await writeBotConfig({
      profileDir,
      token: "tok",
      botId: "111",
      channelIds: ["ch1"],
      allowFrom: ["alice"],
      requireMention: true,
    });

    await addUsersToProfile(profileDir, ["bob"], false);

    const raw = await readFile(join(profileDir, "access.json"), "utf-8");
    const parsed: AccessJson = JSON.parse(raw);

    expect(parsed.groups["ch1"].allowFrom).not.toContain("bob");
    expect(parsed.allowFrom).toContain("bob");
  });

  it("throws if access.json does not exist", async () => {
    const profileDir = join(tempDir, "nonexistent-profile");
    await expect(
      addUsersToProfile(profileDir, ["alice"], false)
    ).rejects.toThrow("找不到");
  });
});
