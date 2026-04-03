import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  readSettingsJson,
  addToolPermissions,
  updateSettingsJson,
} from "../src/permissions";
import type { ToolPermission } from "../src/types";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "permissions-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("readSettingsJson", () => {
  it("reads existing settings.json and returns parsed content", async () => {
    const settingsPath = join(tempDir, "settings.json");
    const original = {
      permissions: { allow: ["Bash(git status)"] },
      someOtherKey: "value",
    };
    await writeFile(settingsPath, JSON.stringify(original), "utf-8");

    const result = await readSettingsJson(settingsPath);
    expect(result.permissions.allow).toEqual(["Bash(git status)"]);
    expect((result as Record<string, unknown>)["someOtherKey"]).toBe("value");
  });

  it("returns default structure when file does not exist", async () => {
    const settingsPath = join(tempDir, "nonexistent.json");
    const result = await readSettingsJson(settingsPath);
    expect(result).toEqual({ permissions: { allow: [] } });
  });

  it("returns with empty allow array when permissions.allow is missing", async () => {
    const settingsPath = join(tempDir, "settings.json");
    const partial = { permissions: {} };
    await writeFile(settingsPath, JSON.stringify(partial), "utf-8");

    const result = await readSettingsJson(settingsPath);
    expect(result.permissions.allow).toEqual([]);
  });
});

describe("addToolPermissions", () => {
  it("converts tool names to mcp__ format and adds to allow", () => {
    const settings = { permissions: { allow: [] } };
    const tools: ToolPermission[] = ["reply", "fetch_messages"];

    const result = addToolPermissions(settings, tools);

    expect(result.permissions.allow).toContain(
      "mcp__plugin_discord_discord__reply"
    );
    expect(result.permissions.allow).toContain(
      "mcp__plugin_discord_discord__fetch_messages"
    );
    expect(result.permissions.allow).toHaveLength(2);
  });

  it("skips duplicates", () => {
    const settings = {
      permissions: { allow: ["mcp__plugin_discord_discord__reply"] },
    };
    const tools: ToolPermission[] = ["reply", "react"];

    const result = addToolPermissions(settings, tools);

    const replyCount = result.permissions.allow.filter(
      (p) => p === "mcp__plugin_discord_discord__reply"
    ).length;
    expect(replyCount).toBe(1);
    expect(result.permissions.allow).toContain(
      "mcp__plugin_discord_discord__react"
    );
    expect(result.permissions.allow).toHaveLength(2);
  });

  it("preserves existing non-discord permissions", () => {
    const settings = {
      permissions: { allow: ["Bash(git status)", "Bash(npm test)"] },
    };
    const tools: ToolPermission[] = ["reply"];

    const result = addToolPermissions(settings, tools);

    expect(result.permissions.allow).toContain("Bash(git status)");
    expect(result.permissions.allow).toContain("Bash(npm test)");
    expect(result.permissions.allow).toContain(
      "mcp__plugin_discord_discord__reply"
    );
    expect(result.permissions.allow).toHaveLength(3);
  });

  it("does not mutate original settings", () => {
    const settings = { permissions: { allow: ["Bash(git)"] } };
    const tools: ToolPermission[] = ["reply"];

    addToolPermissions(settings, tools);

    expect(settings.permissions.allow).toEqual(["Bash(git)"]);
  });
});

describe("updateSettingsJson", () => {
  it("creates backup (.bak) and writes updated settings when file exists", async () => {
    const settingsPath = join(tempDir, "settings.json");
    const original = { permissions: { allow: ["Bash(git status)"] } };
    await writeFile(settingsPath, JSON.stringify(original), "utf-8");

    const tools: ToolPermission[] = ["reply", "react"];
    await updateSettingsJson(settingsPath, tools);

    // Check backup exists
    const bakPath = settingsPath + ".bak";
    const bakContent = await readFile(bakPath, "utf-8");
    expect(JSON.parse(bakContent)).toEqual(original);

    // Check updated file
    const updated = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(updated.permissions.allow).toContain("Bash(git status)");
    expect(updated.permissions.allow).toContain(
      "mcp__plugin_discord_discord__reply"
    );
    expect(updated.permissions.allow).toContain(
      "mcp__plugin_discord_discord__react"
    );
  });

  it("creates new settings.json without .bak when file does not exist", async () => {
    const settingsPath = join(tempDir, "settings.json");
    const tools: ToolPermission[] = ["reply", "fetch_messages"];

    await updateSettingsJson(settingsPath, tools);

    // .bak should NOT exist
    let bakExists = false;
    try {
      await readFile(settingsPath + ".bak", "utf-8");
      bakExists = true;
    } catch {
      bakExists = false;
    }
    expect(bakExists).toBe(false);

    // Check written file
    const content = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(content.permissions.allow).toContain(
      "mcp__plugin_discord_discord__reply"
    );
    expect(content.permissions.allow).toContain(
      "mcp__plugin_discord_discord__fetch_messages"
    );
  });

  it("writes JSON ending with newline", async () => {
    const settingsPath = join(tempDir, "settings.json");
    const tools: ToolPermission[] = ["reply"];

    await updateSettingsJson(settingsPath, tools);

    const raw = await readFile(settingsPath, "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
  });
});
