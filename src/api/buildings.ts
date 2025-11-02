import type { AuthInfo, BuildingsResponse } from "../types";
import { httpGet } from "../utils/http";

const BUILDINGS_API =
  "https://onlineroomse.pku.edu.cn/courseapi/v2/schedule/search-building?need_format=1&tenant=1";

/**
 * 获取教学楼列表
 * @param authInfo - 鉴权信息
 * @returns 教学楼列表响应
 */
export async function getBuildings(
  authInfo: AuthInfo
): Promise<BuildingsResponse> {
  return await httpGet<BuildingsResponse>(BUILDINGS_API, authInfo);
}
