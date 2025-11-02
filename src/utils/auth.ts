import type { AuthInfo } from "../types";

/**
 * 从 curl 命令中提取鉴权信息
 * @param curlCommand - 用户粘贴的 curl 命令
 * @returns AuthInfo 对象，包含 authorization 和 cookie
 */
export function parseCurlCommand(curlCommand: string): AuthInfo {
  let authorization = "";
  let cookie = "";

  // 处理多行 curl 命令：移除续行符 \ 和多余的空白
  let normalizedCommand = curlCommand
    .replace(/\\\s*\n\s*/g, " ") // 移除 \ 和换行符
    .replace(/\\\n/g, " ") // 移除单独的 \n
    .replace(/\s+/g, " ") // 将多个空格替换为单个空格
    .trim();

  // 提取 Authorization - 使用多个模式匹配
  let authPatterns = [
    /-H\s+'authorization:\s*Bearer\s+([^']+)'/i,
    /-H\s+"authorization:\s*Bearer\s+([^"]+)"/i,
    /--header\s+'authorization:\s*Bearer\s+([^']+)'/i,
    /--header\s+"authorization:\s*Bearer\s+([^"]+)"/i,
  ];

  for (const pattern of authPatterns) {
    const match = normalizedCommand.match(pattern);
    if (match && match[1]) {
      authorization = `Bearer ${match[1].trim()}`;
      break;
    }
  }

  // 提取 Cookie - 使用多个模式匹配
  let cookiePatterns = [
    /-b\s+'([^']+)'/,
    /-b\s+"([^"]+)"/,
    /--cookie\s+'([^']+)'/,
    /--cookie\s+"([^"]+)"/,
    /-H\s+'cookie:\s*([^']+)'/i,
    /-H\s+"cookie:\s*([^"]+)"/i,
    /--header\s+'cookie:\s*([^']+)'/i,
    /--header\s+"cookie:\s*([^"]+)"/i,
  ];

  for (const pattern of cookiePatterns) {
    const match = normalizedCommand.match(pattern);
    if (match && match[1]) {
      cookie = match[1].trim();
      break;
    }
  }

  if (!authorization || !cookie) {
    const missing = [];
    if (!authorization) missing.push("Authorization");
    if (!cookie) missing.push("Cookie");

    throw new Error(
      `无法提取 ${missing.join(" 和 ")} 信息。\n\n` +
      `提示：\n` +
      `1. 确保 curl 命令包含 -H 'authorization: Bearer xxx'\n` +
      `2. 确保包含 -b 'cookie...' 或 -H 'cookie: xxx'\n` +
      `3. 如果粘贴有问题，请选择"手动输入"方式`
    );
  }

  return {
    authorization,
    cookie,
  };
}

/**
 * 验证鉴权信息是否有效
 */
export function validateAuthInfo(authInfo: AuthInfo): boolean {
  return (
    authInfo.authorization.startsWith("Bearer ") &&
    authInfo.cookie.length > 0
  );
}

/**
 * 保存鉴权信息到本地文件
 */
export async function saveAuthInfo(authInfo: AuthInfo): Promise<void> {
  const authFile = Bun.file(".pku-cli-auth.json");
  await Bun.write(authFile, JSON.stringify(authInfo, null, 2));
}

/**
 * 从本地文件加载鉴权信息
 */
export async function loadAuthInfo(): Promise<AuthInfo | null> {
  const authFile = Bun.file(".pku-cli-auth.json");

  if (await authFile.exists()) {
    try {
      const content = await authFile.text();
      const authInfo = JSON.parse(content) as AuthInfo;
      if (validateAuthInfo(authInfo)) {
        return authInfo;
      }
    } catch (error) {
      // 文件损坏，删除它
      await deleteAuthInfo();
    }
  }

  return null;
}

/**
 * 删除保存的鉴权信息
 */
export async function deleteAuthInfo(): Promise<void> {
  const authPath = ".pku-cli-auth.json";
  try {
    await Bun.write(authPath, ""); // 清空文件
  } catch (error) {
    // 忽略错误
  }
}


