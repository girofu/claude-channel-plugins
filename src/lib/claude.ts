// Claude Code CLI integration module

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

type ExecFn = (cmd: string) => Promise<{ stdout: string }>;

/** 版本需求常數 */
export const MINIMUM_CHANNEL_VERSION = "2.1.80";
export const MINIMUM_PERMISSION_RELAY_VERSION = "2.1.81";

export interface FeatureSupport {
  channels: boolean;
  permissionRelay: boolean;
}

/** 根據 Claude Code 版本檢查功能支援 */
export function checkFeatureSupport(version: string | null): FeatureSupport {
  if (!version) {
    return { channels: false, permissionRelay: false };
  }
  return {
    channels: isVersionSufficient(version, MINIMUM_CHANNEL_VERSION),
    permissionRelay: isVersionSufficient(version, MINIMUM_PERMISSION_RELAY_VERSION),
  };
}

export interface ClaudeCodeInfo {
  installed: boolean;
  version: string | null;
}

/** 解析 claude --version 輸出中的版本號 */
export function parseClaudeVersion(output: string): string | null {
  const match = output.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

/** 比較版本是否 >= 最低要求 */
export function isVersionSufficient(version: string, minimum: string): boolean {
  const vParts = version.split(".").map(Number);
  const mParts = minimum.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    if (vParts[i] > mParts[i]) return true;
    if (vParts[i] < mParts[i]) return false;
  }
  return true; // 相等
}

/** 偵測 Claude Code CLI 並取得版本資訊 */
export async function getClaudeCodeInfo(
  exec?: ExecFn,
): Promise<ClaudeCodeInfo> {
  const run = exec ?? defaultExec;
  try {
    await run("which claude");
  } catch {
    return { installed: false, version: null };
  }

  try {
    const { stdout } = await run("claude --version");
    const version = parseClaudeVersion(stdout);
    return { installed: true, version };
  } catch {
    return { installed: true, version: null };
  }
}

/** Detect whether Claude Code CLI is installed on the system */
export async function detectClaudeCode(
  exec?: ExecFn,
): Promise<boolean> {
  const info = await getClaudeCodeInfo(exec);
  return info.installed;
}

/** Get plugin installation related commands */
export function getPluginInstallCommands(channel: string) {
  return {
    install: `/plugin install ${channel}@claude-plugins-official`,
    marketplaceAdd: `/plugin marketplace add anthropics/claude-plugins-official`,
    marketplaceUpdate: `/plugin marketplace update claude-plugins-official`,
    reload: `/reload-plugins`,
  };
}

/** Generate a Claude Code launch command with --channels flag */
export function getChannelLaunchCommand(channels: string[]): string {
  if (channels.length === 0) {
    throw new Error("At least one channel is required");
  }

  const plugins = channels
    .map((ch) => `plugin:${ch}@claude-plugins-official`)
    .join(" ");

  return `claude --channels ${plugins}`;
}

/** MCP tool permission patterns */
const TOOL_PERMISSION_PATTERNS: Record<string, string> = {
  discord: "mcp__plugin_discord_discord__*",
  telegram: "mcp__plugin_telegram_telegram__*",
};

/** 寫入 Claude Code tool permissions 到 settings.json */
export function writeToolPermissions(
  channels: string[],
  settingsDir?: string,
): void {
  const dir = settingsDir ?? path.join(os.homedir(), ".claude");
  const settingsPath = path.join(dir, "settings.json");

  // 讀取現有設定
  let settings: Record<string, unknown> = {};
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch {
    // 檔案不存在或解析失敗，使用空物件
  }

  // 確保 permissions.allow 存在
  if (!settings.permissions || typeof settings.permissions !== "object") {
    settings.permissions = {};
  }
  const permissions = settings.permissions as Record<string, unknown>;
  if (!Array.isArray(permissions.allow)) {
    permissions.allow = [];
  }
  const allow = permissions.allow as string[];

  // 加入每個 channel 的 tool pattern（不重複）
  for (const channel of channels) {
    const pattern = TOOL_PERMISSION_PATTERNS[channel];
    if (pattern && !allow.includes(pattern)) {
      allow.push(pattern);
    }
  }

  // 寫回
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

async function defaultExec(cmd: string): Promise<{ stdout: string }> {
  const { execFileSync } = await import("node:child_process");
  const args = cmd.split(" ");
  const bin = args[0];
  const stdout = execFileSync(bin, args.slice(1), { encoding: "utf-8" });
  return { stdout };
}
