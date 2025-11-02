import type { AuthInfo } from "../types";

/**
 * 通用 HTTP GET 请求函数
 * @param url - 请求 URL
 * @param authInfo - 鉴权信息（可选）
 * @returns 响应的 JSON 数据
 */
export async function httpGet<T = any>(
  url: string,
  authInfo?: AuthInfo
): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "user-agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  };

  // 如果提供了鉴权信息，添加到请求头
  if (authInfo) {
    headers.authorization = authInfo.authorization;
    headers.cookie = authInfo.cookie;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    console.error("HTTP request failed:", error);
    throw error;
  }
}

/**
 * 下载文件到本地
 * @param url - 文件 URL
 * @param savePath - 保存路径
 * @param authInfo - 鉴权信息（可选）
 * @param onProgress - 进度回调
 */
export async function downloadFile(
  url: string,
  savePath: string,
  authInfo?: AuthInfo,
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  const headers: Record<string, string> = {
    "user-agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  };

  // 如果提供了鉴权信息，添加到请求头
  if (authInfo) {
    headers.authorization = authInfo.authorization;
    headers.cookie = authInfo.cookie;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const totalSize = parseInt(response.headers.get("content-length") || "0");
  const body = response.body;

  if (!body) {
    throw new Error("响应体为空");
  }

  // 使用 Bun.file 写入文件
  const file = Bun.file(savePath);
  const writer = file.writer();

  let downloaded = 0;
  const reader = body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      writer.write(value);
      downloaded += value.length;

      if (onProgress && totalSize > 0) {
        onProgress(downloaded, totalSize);
      }
    }

    await writer.end();
  } catch (error) {
    await writer.end();
    throw error;
  }
}

/**
 * 格式化日期为 YYYY-MM-DD 格式
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 将时间戳转换为可读时间
 */
export function formatTimestamp(timestamp: string): string {
  const date = new Date(parseInt(timestamp) * 1000);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 清理文件名中的非法字符
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, "_") // 替换非法字符
    .replace(/\s+/g, "_") // 替换空格
    .replace(/_+/g, "_") // 合并多个下划线
    .substring(0, 200); // 限制长度
}

/**
 * 生成视频文件名
 * @param date - 日期字符串
 * @param courseName - 课程名称
 * @param teacherName - 教师名称
 * @param extension - 文件扩展名（mp4 或 m3u8）
 */
export function generateVideoFilename(
  date: string,
  courseName: string,
  teacherName: string,
  extension: string
): string {
  // 只取日期部分并替换所有斜杠为短横线
  const dateStr = date.split(" ")[0].replace(/\//g, "-"); // 2025/09/26 -> 2025-09-26
  const cleanCourseName = sanitizeFilename(courseName);
  const cleanTeacherName = sanitizeFilename(teacherName);

  return `${dateStr}_${cleanCourseName}_${cleanTeacherName}.${extension}`;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
