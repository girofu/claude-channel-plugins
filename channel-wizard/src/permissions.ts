import { copyFile } from "node:fs/promises";
import type { ToolPermission } from "./types";

export interface SettingsJson {
  permissions: { allow: string[] };
  [key: string]: unknown;
}

export async function readSettingsJson(
  settingsPath: string
): Promise<SettingsJson> {
  const file = Bun.file(settingsPath);
  const exists = await file.exists();

  if (!exists) {
    return { permissions: { allow: [] } };
  }

  const parsed = (await file.json()) as Record<string, unknown>;
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
  const file = Bun.file(settingsPath);
  const exists = await file.exists();

  if (exists) {
    await copyFile(settingsPath, settingsPath + ".bak");
  }

  const current = await readSettingsJson(settingsPath);
  const updated = addToolPermissions(current, tools);

  await Bun.write(settingsPath, JSON.stringify(updated, null, 2) + "\n");
}
