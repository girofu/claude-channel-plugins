import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectClaudeCode,
  getPluginInstallCommands,
  getChannelLaunchCommand,
  parseClaudeVersion,
  isVersionSufficient,
  getClaudeCodeInfo,
  writeToolPermissions,
  checkFeatureSupport,
  MINIMUM_CHANNEL_VERSION,
  MINIMUM_PERMISSION_RELAY_VERSION,
} from "../src/lib/claude";

describe("Claude Code integration", () => {
  describe("detectClaudeCode", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("returns true when claude command exists", async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: "/usr/local/bin/claude\n" });
      const result = await detectClaudeCode(mockExec);
      expect(result).toBe(true);
    });

    it("returns false when claude command does not exist", async () => {
      const mockExec = vi.fn().mockRejectedValue(new Error("not found"));
      const result = await detectClaudeCode(mockExec);
      expect(result).toBe(false);
    });
  });

  describe("getPluginInstallCommands", () => {
    it("generates discord plugin install commands", () => {
      const cmds = getPluginInstallCommands("discord");
      expect(cmds).toEqual({
        install: "/plugin install discord@claude-plugins-official",
        marketplaceAdd:
          "/plugin marketplace add anthropics/claude-plugins-official",
        marketplaceUpdate:
          "/plugin marketplace update claude-plugins-official",
        reload: "/reload-plugins",
      });
    });

    it("generates telegram plugin install commands", () => {
      const cmds = getPluginInstallCommands("telegram");
      expect(cmds.install).toBe(
        "/plugin install telegram@claude-plugins-official",
      );
    });
  });

  describe("getChannelLaunchCommand", () => {
    it("generates a launch command for a single channel", () => {
      const cmd = getChannelLaunchCommand(["discord"]);
      expect(cmd).toBe(
        "claude --channels plugin:discord@claude-plugins-official",
      );
    });

    it("generates a launch command for multiple channels", () => {
      const cmd = getChannelLaunchCommand(["discord", "telegram"]);
      expect(cmd).toBe(
        "claude --channels plugin:discord@claude-plugins-official plugin:telegram@claude-plugins-official",
      );
    });

    it("throws an error for an empty array", () => {
      expect(() => getChannelLaunchCommand([])).toThrow(
        "At least one channel is required",
      );
    });
  });

  describe("parseClaudeVersion", () => {
    it("parses a standard version string", () => {
      expect(parseClaudeVersion("2.1.80")).toBe("2.1.80");
    });

    it("parses version from claude --version output with prefix", () => {
      expect(parseClaudeVersion("Claude Code v2.1.80")).toBe("2.1.80");
    });

    it("parses version from multi-line output", () => {
      expect(parseClaudeVersion("Claude Code v2.1.81\nSome other info")).toBe("2.1.81");
    });

    it("returns null for unparseable output", () => {
      expect(parseClaudeVersion("not a version")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseClaudeVersion("")).toBeNull();
    });
  });

  describe("isVersionSufficient", () => {
    it("returns true when version equals minimum", () => {
      expect(isVersionSufficient("2.1.80", "2.1.80")).toBe(true);
    });

    it("returns true when version is higher (patch)", () => {
      expect(isVersionSufficient("2.1.81", "2.1.80")).toBe(true);
    });

    it("returns true when version is higher (minor)", () => {
      expect(isVersionSufficient("2.2.0", "2.1.80")).toBe(true);
    });

    it("returns true when version is higher (major)", () => {
      expect(isVersionSufficient("3.0.0", "2.1.80")).toBe(true);
    });

    it("returns false when version is lower", () => {
      expect(isVersionSufficient("2.1.79", "2.1.80")).toBe(false);
    });

    it("returns false when minor is lower", () => {
      expect(isVersionSufficient("2.0.99", "2.1.80")).toBe(false);
    });
  });

  describe("getClaudeCodeInfo", () => {
    it("returns installed with version when claude exists", async () => {
      const mockExec = vi.fn()
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/claude\n" })
        .mockResolvedValueOnce({ stdout: "Claude Code v2.1.81\n" });
      const info = await getClaudeCodeInfo(mockExec);
      expect(info).toEqual({ installed: true, version: "2.1.81" });
    });

    it("returns installed without version when version parse fails", async () => {
      const mockExec = vi.fn()
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/claude\n" })
        .mockResolvedValueOnce({ stdout: "unknown\n" });
      const info = await getClaudeCodeInfo(mockExec);
      expect(info).toEqual({ installed: true, version: null });
    });

    it("returns not installed when claude is missing", async () => {
      const mockExec = vi.fn().mockRejectedValue(new Error("not found"));
      const info = await getClaudeCodeInfo(mockExec);
      expect(info).toEqual({ installed: false, version: null });
    });
  });

  describe("writeToolPermissions", () => {
    let tmpDir: string;

    beforeEach(async () => {
      const fs = await import("node:fs");
      const os = await import("node:os");
      const path = await import("node:path");
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-test-"));
    });

    it("creates settings.json with tool permissions for discord", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");

      writeToolPermissions(["discord"], tmpDir);

      const settingsPath = path.join(tmpDir, "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.permissions.allow).toContain("mcp__plugin_discord_discord__*");
    });

    it("creates settings.json with tool permissions for telegram", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");

      writeToolPermissions(["telegram"], tmpDir);

      const settingsPath = path.join(tmpDir, "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.permissions.allow).toContain("mcp__plugin_telegram_telegram__*");
    });

    it("merges with existing settings without overwriting", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");

      const settingsPath = path.join(tmpDir, "settings.json");
      fs.writeFileSync(settingsPath, JSON.stringify({
        permissions: { allow: ["Bash(git *)"] },
        otherSetting: true,
      }), "utf-8");

      writeToolPermissions(["discord"], tmpDir);

      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.permissions.allow).toContain("Bash(git *)");
      expect(settings.permissions.allow).toContain("mcp__plugin_discord_discord__*");
      expect(settings.otherSetting).toBe(true);
    });

    it("does not add duplicate permissions", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");

      const settingsPath = path.join(tmpDir, "settings.json");
      fs.writeFileSync(settingsPath, JSON.stringify({
        permissions: { allow: ["mcp__plugin_discord_discord__*"] },
      }), "utf-8");

      writeToolPermissions(["discord"], tmpDir);

      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      const count = settings.permissions.allow.filter(
        (p: string) => p === "mcp__plugin_discord_discord__*"
      ).length;
      expect(count).toBe(1);
    });

    it("handles both channels at once", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");

      writeToolPermissions(["discord", "telegram"], tmpDir);

      const settingsPath = path.join(tmpDir, "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.permissions.allow).toContain("mcp__plugin_discord_discord__*");
      expect(settings.permissions.allow).toContain("mcp__plugin_telegram_telegram__*");
    });
  });

  describe("version constants", () => {
    it("exports MINIMUM_CHANNEL_VERSION as 2.1.80", () => {
      expect(MINIMUM_CHANNEL_VERSION).toBe("2.1.80");
    });

    it("exports MINIMUM_PERMISSION_RELAY_VERSION as 2.1.81", () => {
      expect(MINIMUM_PERMISSION_RELAY_VERSION).toBe("2.1.81");
    });
  });

  describe("checkFeatureSupport", () => {
    it("returns all features supported for v2.1.81+", () => {
      const support = checkFeatureSupport("2.1.81");
      expect(support.channels).toBe(true);
      expect(support.permissionRelay).toBe(true);
    });

    it("returns channels only for v2.1.80", () => {
      const support = checkFeatureSupport("2.1.80");
      expect(support.channels).toBe(true);
      expect(support.permissionRelay).toBe(false);
    });

    it("returns nothing supported for v2.1.79", () => {
      const support = checkFeatureSupport("2.1.79");
      expect(support.channels).toBe(false);
      expect(support.permissionRelay).toBe(false);
    });

    it("returns nothing supported for null version", () => {
      const support = checkFeatureSupport(null);
      expect(support.channels).toBe(false);
      expect(support.permissionRelay).toBe(false);
    });
  });
});
