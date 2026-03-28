import { mkdir, rename, chmod } from "node:fs/promises";
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
 */
export function generateStartAllScript(profileNames: string[], scriptsDir: string): string {
  const botLines = profileNames
    .map((name) => `  bash "${scriptsDir}/start-${name}.sh" &`)
    .join("\n");

  return `#!/bin/bash
# 在背景啟動所有 bot
${botLines}
echo "所有 bot 已啟動"
wait
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
    await Bun.write(filePath, generateStartScript(profileName));
    await chmod(filePath, 0o755);
  }

  // 建立啟動所有 bot 的腳本
  const startAllPath = join(scriptsDir, "start-all.sh");
  await backupIfExists(startAllPath);
  await Bun.write(startAllPath, generateStartAllScript(profileNames, scriptsDir));
  await chmod(startAllPath, 0o755);
}

/**
 * 若檔案存在則重新命名為 .bak
 */
async function backupIfExists(filePath: string): Promise<void> {
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (exists) {
      await rename(filePath, `${filePath}.bak`);
    }
  } catch {
    // 檔案不存在，忽略錯誤
  }
}
