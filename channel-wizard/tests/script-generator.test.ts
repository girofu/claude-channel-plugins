import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, stat, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateStartScript,
  generateStartAllScript,
  writeAllScripts,
} from "../src/script-generator";

describe("generateStartScript", () => {
  it("contains shebang line", () => {
    const script = generateStartScript("my-bot");
    expect(script).toContain("#!/bin/bash");
  });

  it("includes the profile name in DISCORD_STATE_DIR", () => {
    const script = generateStartScript("my-bot");
    expect(script).toContain("DISCORD_STATE_DIR=~/.claude/channels/my-bot");
  });

  it("includes the discord plugin channel flag", () => {
    const script = generateStartScript("my-bot");
    expect(script).toContain("--channels plugin:discord@claude-plugins-official");
  });

  it("includes --dangerously-skip-permissions flag", () => {
    const script = generateStartScript("my-bot");
    expect(script).toContain("--dangerously-skip-permissions");
  });

  it("works with different profile names", () => {
    const script = generateStartScript("server-alpha");
    expect(script).toContain("DISCORD_STATE_DIR=~/.claude/channels/server-alpha");
  });
});

describe("generateStartAllScript", () => {
  it("contains shebang line", () => {
    const script = generateStartAllScript(["bot1", "bot2"], "/home/user/scripts");
    expect(script).toContain("#!/bin/bash");
  });

  it("uses osascript to open separate Terminal windows", () => {
    const script = generateStartAllScript(["bot1", "bot2"], "/home/user/scripts");
    expect(script).toContain("osascript");
    expect(script).toContain('tell application \\"Terminal\\"');
  });

  it("includes all profile start scripts via osascript", () => {
    const script = generateStartAllScript(["bot1", "bot2"], "/home/user/scripts");
    expect(script).toContain("start-bot1.sh");
    expect(script).toContain("start-bot2.sh");
  });

  it("resolves scripts dir dynamically", () => {
    const script = generateStartAllScript(["bot1"], "/home/user/scripts");
    expect(script).toContain('SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"');
  });

  it("includes completion echo message", () => {
    const script = generateStartAllScript(["bot1"], "/home/user/scripts");
    expect(script).toContain("已為每個 bot 開啟獨立的 Terminal 視窗");
  });

  it("works with single profile", () => {
    const script = generateStartAllScript(["only-bot"], "/tmp/scripts");
    expect(script).toContain("start-only-bot.sh");
  });

  it("works with multiple profiles", () => {
    const script = generateStartAllScript(["alpha", "beta", "gamma"], "/scripts");
    expect(script).toContain("start-alpha.sh");
    expect(script).toContain("start-beta.sh");
    expect(script).toContain("start-gamma.sh");
  });
});

describe("writeAllScripts", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "script-gen-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates scriptsDir if it does not exist", async () => {
    const scriptsDir = join(tmpDir, "new-scripts-dir");
    await writeAllScripts(["bot1"], scriptsDir);
    const dirStat = await stat(scriptsDir);
    expect(dirStat.isDirectory()).toBe(true);
  });

  it("creates individual start scripts for each profile", async () => {
    const scriptsDir = join(tmpDir, "scripts");
    await writeAllScripts(["bot1", "bot2"], scriptsDir);
    const bot1Stat = await stat(join(scriptsDir, "start-bot1.sh"));
    const bot2Stat = await stat(join(scriptsDir, "start-bot2.sh"));
    expect(bot1Stat.isFile()).toBe(true);
    expect(bot2Stat.isFile()).toBe(true);
  });

  it("individual scripts have correct content", async () => {
    const scriptsDir = join(tmpDir, "scripts");
    await writeAllScripts(["my-bot"], scriptsDir);
    const content = await readFile(join(scriptsDir, "start-my-bot.sh"), "utf-8");
    expect(content).toContain("#!/bin/bash");
    expect(content).toContain("DISCORD_STATE_DIR=~/.claude/channels/my-bot");
  });

  it("creates start-all.sh", async () => {
    const scriptsDir = join(tmpDir, "scripts");
    await writeAllScripts(["bot1"], scriptsDir);
    const allStat = await stat(join(scriptsDir, "start-all.sh"));
    expect(allStat.isFile()).toBe(true);
  });

  it("start-all.sh has correct content with osascript", async () => {
    const scriptsDir = join(tmpDir, "scripts");
    await writeAllScripts(["bot1", "bot2"], scriptsDir);
    const content = await readFile(join(scriptsDir, "start-all.sh"), "utf-8");
    expect(content).toContain("#!/bin/bash");
    expect(content).toContain("osascript");
    expect(content).toContain("start-bot1.sh");
    expect(content).toContain("start-bot2.sh");
    expect(content).toContain("已為每個 bot 開啟獨立的 Terminal 視窗");
  });

  it("individual scripts have 755 permissions", async () => {
    const scriptsDir = join(tmpDir, "scripts");
    await writeAllScripts(["my-bot"], scriptsDir);
    const fileStat = await stat(join(scriptsDir, "start-my-bot.sh"));
    // mode & 0o777 gives permission bits
    expect(fileStat.mode & 0o777).toBe(0o755);
  });

  it("start-all.sh has 755 permissions", async () => {
    const scriptsDir = join(tmpDir, "scripts");
    await writeAllScripts(["bot1"], scriptsDir);
    const fileStat = await stat(join(scriptsDir, "start-all.sh"));
    expect(fileStat.mode & 0o777).toBe(0o755);
  });

  it("backs up existing individual script to .bak before overwriting", async () => {
    const scriptsDir = join(tmpDir, "scripts");
    await mkdir(scriptsDir);
    const scriptPath = join(scriptsDir, "start-bot1.sh");
    await writeFile(scriptPath, "old content");
    await writeAllScripts(["bot1"], scriptsDir);
    const bakContent = await readFile(join(scriptsDir, "start-bot1.sh.bak"), "utf-8");
    expect(bakContent).toBe("old content");
  });

  it("backs up existing start-all.sh to .bak before overwriting", async () => {
    const scriptsDir = join(tmpDir, "scripts");
    await mkdir(scriptsDir);
    const allScriptPath = join(scriptsDir, "start-all.sh");
    await writeFile(allScriptPath, "old start-all content");
    await writeAllScripts(["bot1"], scriptsDir);
    const bakContent = await readFile(join(scriptsDir, "start-all.sh.bak"), "utf-8");
    expect(bakContent).toBe("old start-all content");
  });
});
