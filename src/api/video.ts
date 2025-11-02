import type { AuthInfo, VideoResponse, VideoContent } from "../types";
import { httpGet } from "../utils/http";

/**
 * 获取视频详情
 * @param authInfo - 鉴权信息
 * @param courseId - 课程 ID
 * @param subId - 子课程 ID
 * @returns 视频响应
 */
export async function getVideoInfo(
  authInfo: AuthInfo,
  courseId: string,
  subId: string
): Promise<VideoResponse> {
  const url = `https://yjapise.pku.edu.cn/courseapi/v2/schedule/search-live-course-list?all=1&course_id=${courseId}&sub_id=${subId}&with_sub_data=1&with_room_data=1&show_all=1&show_delete=2`;
  return await httpGet<VideoResponse>(url, authInfo);
}

/**
 * 从视频响应中提取视频地址
 * @param videoResponse - 视频响应
 * @returns 视频地址（m3u8 或 mp4）
 */
export function extractVideoUrl(videoResponse: VideoResponse): string | null {
  if (
    !videoResponse.list ||
    videoResponse.list.length === 0 ||
    !videoResponse.list[0]?.sub_content
  ) {
    return null;
  }

  try {
    const subContentStr = videoResponse.list[0].sub_content;
    if (!subContentStr) return null;

    const subContent = JSON.parse(subContentStr);
    const savePlayback = subContent.save_playback;

    if (savePlayback && savePlayback.contents) {
      return savePlayback.contents;
    }
  } catch (error) {
    console.error("解析视频内容失败:", error);
  }

  return null;
}
