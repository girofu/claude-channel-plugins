// Multi-bot profile management module
// Uses official DISCORD_STATE_DIR / TELEGRAM_STATE_DIR to support multiple independent bot sessions

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface ProfileConfig {
  token: string;
  stateDir?: string;
}

const STATE_DIR_KEYS: Record<string, string> = {
  discord: "DISCORD_STATE_DIR",
  telegram: "TELEGRAM_STATE_DIR",
};

const TOKEN_KEYS: Record<string, string> = {
  discord: "DISCORD_BOT_TOKEN",
  telegram: "TELEGRAM_BOT_TOKEN",
};

/** Get the config directory path for a profile */
export function getProfileDir(
  channel: string,
  profile: string | undefined,
  baseDir?: string,
): string {
  const base = baseDir ?? path.join(os.homedir(), ".claude");
  if (!profile) {
    return path.join(base, "channels", channel);
  }
  return path.join(base, "channels", `${channel}-${profile}`);
}

/** Save a profile's token and STATE_DIR */
export function saveProfileConfig(
  channel: string,
  profile: string | undefined,
  token: string,
  baseDir?: string,
): void {
  const dir = getProfileDir(channel, profile, baseDir);
  fs.mkdirSync(dir, { recursive: true });

  const tokenKey = TOKEN_KEYS[channel] ?? `${channel.toUpperCase()}_BOT_TOKEN`;
  const lines = [`${tokenKey}=${token}`];

  if (profile) {
    const stateDirKey = STATE_DIR_KEYS[channel] ?? `${channel.toUpperCase()}_STATE_DIR`;
    lines.push(`${stateDirKey}=${dir}`);
  }

  const envPath = path.join(dir, ".env");
  fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
  // 官方 plugin 要求 chmod 600 保護 token
  fs.chmodSync(envPath, 0o600);
}

/** Load a profile's configuration */
export function loadProfileConfig(
  channel: string,
  profile: string | undefined,
  baseDir?: string,
): ProfileConfig | null {
  const dir = getProfileDir(channel, profile, baseDir);
  const envPath = path.join(dir, ".env");

  if (!fs.existsSync(envPath)) {
    return null;
  }

  const content = fs.readFileSync(envPath, "utf-8");
  const tokenKey = TOKEN_KEYS[channel] ?? `${channel.toUpperCase()}_BOT_TOKEN`;
  const stateDirKey = STATE_DIR_KEYS[channel] ?? `${channel.toUpperCase()}_STATE_DIR`;

  let token: string | undefined;
  let stateDir: string | undefined;

  for (const line of content.split("\n")) {
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const k = line.slice(0, eqIndex);
    const v = line.slice(eqIndex + 1);
    if (k === tokenKey) token = v;
    if (k === stateDirKey) stateDir = v;
  }

  if (!token) return null;
  return { token, stateDir };
}

/** List all configured profiles */
export function listProfiles(
  channel: string,
  baseDir?: string,
): string[] {
  const base = baseDir ?? path.join(os.homedir(), ".claude");
  const channelsDir = path.join(base, "channels");

  if (!fs.existsSync(channelsDir)) return [];

  const entries = fs.readdirSync(channelsDir);
  const profiles: string[] = [];

  for (const entry of entries) {
    const envPath = path.join(channelsDir, entry, ".env");
    if (!fs.existsSync(envPath)) continue;

    if (entry === channel) {
      profiles.push("default");
    } else if (entry.startsWith(`${channel}-`)) {
      profiles.push(entry.slice(channel.length + 1));
    }
  }

  return profiles;
}

/** Get the environment variable prefix needed at launch time */
export function getProfileLaunchEnv(
  channel: string,
  profile: string | undefined,
  baseDir?: string,
): string {
  if (!profile) return "";

  const dir = getProfileDir(channel, profile, baseDir);
  const stateDirKey = STATE_DIR_KEYS[channel] ?? `${channel.toUpperCase()}_STATE_DIR`;
  return `${stateDirKey}=${dir}`;
}
