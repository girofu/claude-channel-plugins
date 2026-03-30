import { mkdir, rename, chmod, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * 產生單一 bot 的啟動腳本內容
 */
export function generateStartScript(profileName: string): string {
  return `#!/bin/bash
DISCORD_STATE_DIR=~/.claude/channels/${profileName} \\
  claude --channels plugin:discord@claude-plugins-official \\
  --dangerously-skip-permissions
`;
}

/**
 * 產生啟動所有 bot 的腳本內容
 * 在 macOS 上為每個 bot 開啟獨立的 Terminal 視窗
 */
export function generateStartAllScript(profileNames: string[], scriptsDir: string): string {
  const botLines = profileNames
    .map(
      (name) =>
        `osascript -e "tell application \\"Terminal\\" to do script \\"bash '$SCRIPTS_DIR/start-${name}.sh'\\""`
    )
    .join("\n");

  return `#!/bin/bash
# 為每個 bot 開啟獨立的 Terminal 視窗
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"

${botLines}

echo "已為每個 bot 開啟獨立的 Terminal 視窗"
`;
}

/**
 * 將所有腳本寫入指定目錄，若檔案已存在則先備份為 .bak
 */
export async function writeAllScripts(profileNames: string[], scriptsDir: string): Promise<void> {
  // 建立目錄（若不存在）
  await mkdir(scriptsDir, { recursive: true });

  // 為每個 profile 建立啟動腳本
  for (const profileName of profileNames) {
    const filePath = join(scriptsDir, `start-${profileName}.sh`);
    await backupIfExists(filePath);
    await writeFile(filePath, generateStartScript(profileName), "utf-8");
    await chmod(filePath, 0o755);
  }

  // 建立啟動所有 bot 的腳本
  const startAllPath = join(scriptsDir, "start-all.sh");
  await backupIfExists(startAllPath);
  await writeFile(startAllPath, generateStartAllScript(profileNames, scriptsDir), "utf-8");
  await chmod(startAllPath, 0o755);
}

/**
 * 若檔案存在則重新命名為 .bak
 */
async function backupIfExists(filePath: string): Promise<void> {
  try {
    if (existsSync(filePath)) {
      await rename(filePath, `${filePath}.bak`);
    }
  } catch {
    // 檔案不存在，忽略錯誤
  }
}
