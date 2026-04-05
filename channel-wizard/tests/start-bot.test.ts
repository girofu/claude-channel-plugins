import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { buildLaunchCommand, discoverBotProfiles } from "../src/start-bot";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "start-bot-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("buildLaunchCommand", () => {
  it("returns correct env and args for a profile", () => {
    const result = buildLaunchCommand("/home/user/.claude/channels/discord-mybot");
    expect(result.env["DISCORD_STATE_DIR"]).toBe("/home/user/.claude/channels/discord-mybot");
    expect(result.cmd).toBe("claude");
    expect(result.args).toContain("--channels");
    expect(result.args).toContain("plugin:discord@claude-plugins-official");
  });
});

describe("discoverBotProfiles", () => {
  it("returns profiles that have .env files", async () => {
    const botA = join(tempDir, "discord-botA");
    const botB = join(tempDir, "discord-botB");
    await mkdir(botA);
    await mkdir(botB);
    await writeFile(join(botA, ".env"), "DISCORD_BOT_TOKEN=tokenA\n");
    await writeFile(join(botB, ".env"), "DISCORD_BOT_TOKEN=tokenB\n");

    const profiles = await discoverBotProfiles(tempDir);
    const names = profiles.map((p) => p.name);
    expect(names).toContain("discord-botA");
    expect(names).toContain("discord-botB");
  });

  it("ignores directories without .env", async () => {
    const noEnvDir = join(tempDir, "discord-empty");
    await mkdir(noEnvDir);

    const profiles = await discoverBotProfiles(tempDir);
    const names = profiles.map((p) => p.name);
    expect(names).not.toContain("discord-empty");
  });

  it("ignores the scripts directory", async () => {
    const scriptsDir = join(tempDir, "scripts");
    await mkdir(scriptsDir);
    await writeFile(join(scriptsDir, ".env"), "should-be-ignored\n");

    const profiles = await discoverBotProfiles(tempDir);
    const names = profiles.map((p) => p.name);
    expect(names).not.toContain("scripts");
  });

  it("returns empty array if channels directory does not exist", async () => {
    const nonExistent = join(tempDir, "nonexistent");
    const profiles = await discoverBotProfiles(nonExistent);
    expect(profiles).toHaveLength(0);
  });
});
