import type { AuthInfo, CoursesResponse } from "../types";
import { httpGet, formatDate } from "../utils/http";

/**
 * 获取课程列表
 * @param authInfo - 鉴权信息
 * @param date - 日期
 * @param buildingId - 教学楼 ID（可选）
 * @returns 课程列表响应
 */
export async function getCourses(
  authInfo: AuthInfo,
  date: Date,
  buildingId?: number
): Promise<CoursesResponse> {
  const dateStr = formatDate(date);
  let url = `https://onlineroomse.pku.edu.cn/courseapi/v2/course-live/search-live-course-list?need_time_quantum=1&unique_course=1&with_sub_duration=1&search_time=${dateStr}&tenant=226&course_student_type=&sub_live_status=&with_sub_data=1`;

  if (buildingId) {
    url += `&building_in=${buildingId}`;
  }

  return await httpGet<CoursesResponse>(url, authInfo);
}
