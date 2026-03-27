// Claude Code Telegram channel setup module

export interface TelegramBotInfo {
  id: number;
  firstName: string;
  username: string;
}

export type TelegramTokenResult =
  | { valid: true; bot: TelegramBotInfo }
  | { valid: false; error: string };

/** Validate token via the Telegram Bot API */
export async function validateTelegramToken(
  token: string,
): Promise<TelegramTokenResult> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getMe`,
    );

    if (!response.ok) {
      return {
        valid: false,
        error: `Invalid token (${response.status} ${response.statusText})`,
      };
    }

    const data = (await response.json()) as {
      ok: boolean;
      description?: string;
      result?: { id: number; first_name: string; username: string };
    };

    if (!data.ok) {
      return {
        valid: false,
        error: `Telegram API error: ${data.description ?? "Unknown error"}`,
      };
    }

    const bot = data.result!;
    return {
      valid: true,
      bot: { id: bot.id, firstName: bot.first_name, username: bot.username },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Unable to connect to Telegram API: ${message}` };
  }
}

// --- 自動偵測相關類型與函式 ---

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: TelegramChat;
    from?: { id: number; first_name: string; username?: string };
    date: number;
  };
}

export type WebhookInfoResult =
  | { hasWebhook: false; error?: string }
  | { hasWebhook: true; url: string };

/** 從 updates 中提取不重複的 chat（以 chat.id 去重） */
export function extractUniqueChats(updates: TelegramUpdate[]): TelegramChat[] {
  const seen = new Set<number>();
  const chats: TelegramChat[] = [];

  for (const update of updates) {
    if (!update.message) continue;
    const { chat } = update.message;
    if (seen.has(chat.id)) continue;
    seen.add(chat.id);

    const entry: TelegramChat = { id: chat.id, type: chat.type };
    if (chat.title) entry.title = chat.title;
    if (chat.username) entry.username = chat.username;
    chats.push(entry);
  }

  return chats;
}

/** 查詢 webhook 狀態 */
export async function getWebhookInfo(token: string): Promise<WebhookInfoResult> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`,
    );

    if (!response.ok) {
      return { hasWebhook: false, error: `API error: ${response.status} ${response.statusText}` };
    }

    const data = (await response.json()) as {
      ok: boolean;
      result?: { url: string; pending_update_count: number };
    };

    if (!data.ok || !data.result) {
      return { hasWebhook: false };
    }

    const url = data.result.url;
    if (!url) {
      return { hasWebhook: false };
    }

    return { hasWebhook: true, url };
  } catch {
    return { hasWebhook: false };
  }
}

/** 呼叫 getUpdates 取得最近的 chat 列表 */
export async function pollForChats(token: string): Promise<TelegramChat[]> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates`,
    );

    if (!response.ok) return [];

    const data = (await response.json()) as {
      ok: boolean;
      result?: TelegramUpdate[];
    };

    if (!data.ok || !data.result) return [];

    return extractUniqueChats(data.result);
  } catch {
    return [];
  }
}
