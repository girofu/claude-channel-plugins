import type { BotInfo, ChannelInfo, GuildInfo } from "./types";

const DISCORD_API = "https://discord.com/api/v10";

// ==================== 型別定義 ====================

export interface ValidateTokenResult {
  valid: true;
  botName: string;
  botId: string;
}

export interface ValidateTokenError {
  valid: false;
  error: "invalid_token" | "rate_limited" | "network_error";
}

export type TokenValidationResult = ValidateTokenResult | ValidateTokenError;

export interface ValidateTokensResult {
  valid: BotInfo[];
  invalid: Array<{ index: number; token: string; error: string }>;
}

// ==================== 輔助函式 ====================

/**
 * 根據 bot 名稱產生 profile 名稱
 * 格式：discord-<botName 小寫，非英數字元換成 ->，移除首尾 ->
 * 若與現有名稱衝突，附加 -2、-3...
 */
export function generateProfileName(botName: string, existingNames: string[]): string {
  const base =
    "discord-" +
    botName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  if (!existingNames.includes(base)) {
    return base;
  }

  let counter = 2;
  while (existingNames.includes(`${base}-${counter}`)) {
    counter++;
  }
  return `${base}-${counter}`;
}

// ==================== API 函式 ====================

/**
 * 驗證 Discord Bot Token
 * - 200 → 回傳 { valid: true, botName, botId }
 * - 401 → 回傳 { valid: false, error: "invalid_token" }
 * - 429 → 等待 retry_after 秒後重試，超過 maxRetries → { valid: false, error: "rate_limited" }
 * - 網路錯誤 → { valid: false, error: "network_error" }
 */
export async function validateToken(
  token: string,
  maxRetries: number = 3
): Promise<TokenValidationResult> {
  let retries = 0;

  while (true) {
    try {
      const response = await fetch(`${DISCORD_API}/users/@me`, {
        headers: {
          Authorization: `Bot ${token}`,
        },
      });

      if (response.status === 200) {
        const data = await response.json();
        return {
          valid: true,
          botName: data.username as string,
          botId: data.id as string,
        };
      }

      if (response.status === 401) {
        return { valid: false, error: "invalid_token" };
      }

      if (response.status === 429) {
        if (retries >= maxRetries - 1) {
          return { valid: false, error: "rate_limited" };
        }
        const data = await response.json();
        const retryAfter = (data.retry_after as number) ?? 1;
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        retries++;
        continue;
      }

      // 其他狀態碼視為網路/未知錯誤
      return { valid: false, error: "network_error" };
    } catch {
      return { valid: false, error: "network_error" };
    }
  }
}

/**
 * 取得 Bot 所在的所有 guild 列表
 * 失敗時回傳空陣列
 */
export async function fetchGuilds(token: string): Promise<GuildInfo[]> {
  try {
    const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: {
        Authorization: `Bot ${token}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data as Array<{ id: string; name: string }>).map((g) => ({
      id: g.id,
      name: g.name,
    }));
  } catch {
    return [];
  }
}

/**
 * 取得特定 guild 的所有頻道（不過濾頻道類型）
 * 失敗時回傳空陣列
 */
export async function fetchGuildChannels(
  token: string,
  guildId: string,
  guildName: string
): Promise<ChannelInfo[]> {
  try {
    const response = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: {
        Authorization: `Bot ${token}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data as Array<{ id: string; name: string; type: number }>).map((ch) => ({
      id: ch.id,
      name: ch.name,
      serverId: guildId,
      serverName: guildName,
      type: ch.type,
      source: "api" as const,
    }));
  } catch {
    return [];
  }
}

/**
 * 平行驗證多個 token
 * - 有效 token：同時取得 guild 列表，自動產生 profileName
 * - 無效 token：記錄 index、token、error
 */
export async function validateTokens(tokens: string[]): Promise<ValidateTokensResult> {
  const results = await Promise.all(
    tokens.map(async (token, index) => {
      const validation = await validateToken(token);
      return { index, token, validation };
    })
  );

  const valid: BotInfo[] = [];
  const invalid: Array<{ index: number; token: string; error: string }> = [];
  const usedNames: string[] = [];

  // 先收集所有 valid 結果的基本資料
  const validResults = results.filter(
    (r): r is { index: number; token: string; validation: ValidateTokenResult } =>
      r.validation.valid === true
  );

  // 平行取得所有 valid token 的 guild 列表
  const guildsPerBot = await Promise.all(
    validResults.map(({ token }) => fetchGuilds(token))
  );

  // 組合 BotInfo
  for (let i = 0; i < validResults.length; i++) {
    const { token, validation } = validResults[i];
    const guilds = guildsPerBot[i];
    const profileName = generateProfileName(validation.botName, usedNames);
    usedNames.push(profileName);

    valid.push({
      token,
      botName: validation.botName,
      botId: validation.botId,
      profileName,
      guilds,
    });
  }

  // 收集 invalid 結果
  for (const { index, token, validation } of results) {
    if (!validation.valid) {
      invalid.push({ index, token, error: validation.error });
    }
  }

  return { valid, invalid };
}
