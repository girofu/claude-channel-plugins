// 共用 script helpers — JSON output + error handling wrapper

export interface ScriptResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 執行 script 主邏輯，統一處理 JSON output 和 error
 * 所有 scripts 應使用此 wrapper
 */
export async function runScript<T>(
  fn: () => Promise<T>,
): Promise<never> {
  try {
    const data = await fn();
    const result: ScriptResult<T> = { success: true, data };
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result: ScriptResult = { success: false, error: message };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }
}

/**
 * 從環境變數取得必要的值，不存在則拋出 error
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * 從 CLI 參數取得必要的值
 */
export function requireArg(index: number, name: string): string {
  const value = process.argv[2 + index];
  if (!value) {
    throw new Error(`Missing required argument: ${name} (position ${index})`);
  }
  return value;
}

/**
 * 取得可選的 CLI 參數
 */
export function optionalArg(index: number): string | undefined {
  return process.argv[2 + index];
}
