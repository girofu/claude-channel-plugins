import type {
  BatchImportSchema,
  BatchBotEntry,
  BotInfo,
  ChannelInfo,
  WizardConfig,
} from "./types";
import { ALL_TOOL_PERMISSIONS } from "./types";

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateBatchSchema(data: unknown): {
  valid: boolean;
  errors?: string[];
} {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null) {
    return { valid: false, errors: ["Input must be an object"] };
  }

  const obj = data as Record<string, unknown>;

  // bots must exist and be a non-empty array
  if (!Array.isArray(obj.bots)) {
    errors.push("bots must be an array");
  } else if ((obj.bots as unknown[]).length === 0) {
    errors.push("bots must not be empty");
  } else {
    // Validate each bot entry
    const bots = obj.bots as unknown[];
    bots.forEach((bot, index) => {
      if (typeof bot !== "object" || bot === null) {
        errors.push(`bots[${index}] must be an object`);
        return;
      }
      const b = bot as Record<string, unknown>;
      if (typeof b.token !== "string" || b.token === "") {
        errors.push(`bots[${index}] must have a valid token (string)`);
      }
      if (!Array.isArray(b.channels)) {
        errors.push(`bots[${index}] must have channels (array)`);
      }
    });
  }

  // globalAllowFrom validation
  const globalAllowFrom = obj.globalAllowFrom;
  if (!Array.isArray(globalAllowFrom)) {
    errors.push("globalAllowFrom must be an array");
  } else if ((globalAllowFrom as unknown[]).length === 0) {
    // Empty globalAllowFrom is only OK if every bot has its own allowFrom with at least one entry
    if (Array.isArray(obj.bots) && (obj.bots as unknown[]).length > 0) {
      const bots = obj.bots as Array<Record<string, unknown>>;
      const allBotsHaveAllowFrom = bots.every(
        (bot) =>
          typeof bot === "object" &&
          bot !== null &&
          Array.isArray(bot.allowFrom) &&
          (bot.allowFrom as unknown[]).length > 0
      );
      if (!allBotsHaveAllowFrom) {
        errors.push(
          "globalAllowFrom must have at least one user ID, or every bot must have its own allowFrom with at least one entry"
        );
      }
    } else {
      errors.push(
        "globalAllowFrom must have at least one user ID, or every bot must have its own allowFrom with at least one entry"
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

// ─── File Parsing ─────────────────────────────────────────────────────────────

export async function parseBatchFile(filePath: string): Promise<{
  valid: boolean;
  data?: unknown;
  errors?: string[];
}> {
  // Check existence using Bun.file
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    return { valid: false, errors: [`File not found: ${filePath}`] };
  }

  let parsed: unknown;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    return { valid: false, errors: ["Invalid JSON in file"] };
  }

  const validation = validateBatchSchema(parsed);
  if (!validation.valid) {
    return { valid: false, errors: validation.errors };
  }

  return { valid: true, data: parsed };
}

// ─── Config Resolution ────────────────────────────────────────────────────────

export function resolveBatchConfig(
  schema: BatchImportSchema,
  botInfos: BotInfo[]
): WizardConfig {
  // Build a lookup map from token → BotInfo
  const botInfoByToken = new Map<string, BotInfo>();
  for (const info of botInfos) {
    botInfoByToken.set(info.token, info);
  }

  const resolvedBots: BotInfo[] = [];
  const channelPool = new Map<string, ChannelInfo>();
  const mappings = new Map<string, string[]>();
  const perBotAllowFrom = new Map<string, string[]>();
  const requireMention = new Map<string, boolean>();

  for (const entry of schema.bots) {
    const info = botInfoByToken.get(entry.token);

    // Merge globalAllowFrom + bot's own allowFrom (deduplicate via Set)
    const merged = Array.from(
      new Set([...schema.globalAllowFrom, ...(entry.allowFrom ?? [])])
    );
    perBotAllowFrom.set(entry.token, merged);

    // requireMention defaults to true
    requireMention.set(entry.token, entry.requireMention ?? true);

    // Build resolved BotInfo — use profileName from schema entry if provided
    const baseInfo: BotInfo = info ?? {
      token: entry.token,
      botName: "",
      botId: "",
      profileName: entry.profileName ?? entry.token,
      guilds: [],
    };

    resolvedBots.push({
      ...baseInfo,
      profileName: entry.profileName ?? baseInfo.profileName,
    });

    // Build channelPool (manual entries since we only have IDs from schema)
    for (const channelId of entry.channels) {
      if (!channelPool.has(channelId)) {
        channelPool.set(channelId, {
          id: channelId,
          name: channelId,
          serverId: "",
          serverName: "",
          type: 0,
          source: "manual",
        });
      }
    }

    // Build mappings
    mappings.set(entry.token, [...entry.channels]);
  }

  // toolPermissions: default to ALL_TOOL_PERMISSIONS if not specified
  const toolPermissions: string[] =
    schema.toolPermissions != null
      ? schema.toolPermissions
      : [...ALL_TOOL_PERMISSIONS];

  // scriptsDir default
  const scriptsDir = schema.scriptsDir ?? "~/.claude/channels/scripts/";

  return {
    bots: resolvedBots,
    channelPool,
    mappings,
    globalAllowFrom: schema.globalAllowFrom,
    perBotAllowFrom,
    requireMention,
    toolPermissions,
    scriptsDir,
  };
}
