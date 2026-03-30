import { readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { ToolPermission } from "./types";

export interface SettingsJson {
  permissions: { allow: string[] };
  [key: string]: unknown;
}

export async function readSettingsJson(
  settingsPath: string
): Promise<SettingsJson> {
  if (!existsSync(settingsPath)) {
    return { permissions: { allow: [] } };
  }

  const content = await readFile(settingsPath, "utf-8");
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const permissions = (parsed["permissions"] ?? {}) as Record<string, unknown>;
  const allow = Array.isArray(permissions["allow"])
    ? (permissions["allow"] as string[])
    : [];

  return {
    ...parsed,
    permissions: { ...permissions, allow },
  } as SettingsJson;
}

export function addToolPermissions(
  settings: SettingsJson,
  tools: ToolPermission[]
): SettingsJson {
  const existing = new Set(settings.permissions.allow);

  for (const tool of tools) {
    const permission = `mcp__plugin_discord_discord__${tool}`;
    existing.add(permission);
  }

  return {
    ...settings,
    permissions: {
      ...settings.permissions,
      allow: Array.from(existing),
    },
  };
}

export async function updateSettingsJson(
  settingsPath: string,
  tools: ToolPermission[]
): Promise<void> {
  if (existsSync(settingsPath)) {
    await copyFile(settingsPath, settingsPath + ".bak");
  }

  const current = await readSettingsJson(settingsPath);
  const updated = addToolPermissions(current, tools);

  await writeFile(settingsPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
}
