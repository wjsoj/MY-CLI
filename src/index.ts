#!/usr/bin/env bun

import * as p from "@clack/prompts";
import {
  parseCurlCommand,
  validateAuthInfo,
  saveAuthInfo,
  loadAuthInfo,
  deleteAuthInfo,
} from "./utils/auth";
import { getBuildings } from "./api/buildings";
import { getCourses } from "./api/courses";
import { getVideoInfo, extractVideoUrl } from "./api/video";
import {
  formatTimestamp,
  downloadFile,
  generateVideoFilename,
  formatFileSize,
} from "./utils/http";
import type { AuthInfo, Campus, Building, Course } from "./types";

/**
 * 创建可视化进度条
 * @param percentage - 进度百分比 (0-100)
 * @param width - 进度条宽度（字符数）
 * @returns 进度条字符串，例如 "[████████░░░░] 80%"
 */
function createProgressBar(percentage: number, width: number = 20): string {
  const filled = Math.floor((width * percentage) / 100);
  const empty = width - filled;
  return `[${"\u2588".repeat(filled)}${"\u2591".repeat(empty)}] ${percentage}%`;
}

/**
 * 获取或请求鉴权信息
 */
async function getAuthInfo(): Promise<AuthInfo> {
  // 尝试加载保存的鉴权信息
  const savedAuth = await loadAuthInfo();

  if (savedAuth) {
    const useExisting = await p.confirm({
      message: "检测到已保存的鉴权信息，是否使用？",
      initialValue: true,
    });

    if (p.isCancel(useExisting)) {
      p.cancel("操作已取消");
      process.exit(0);
    }

    if (useExisting) {
      return savedAuth;
    }
  }

  // 请求新的鉴权信息
  const inputMethod = await p.select({
    message: "选择鉴权信息输入方式:",
    options: [
      { value: "curl", label: "粘贴 curl 命令" },
      { value: "manual", label: "手动输入 Authorization 和 Cookie" },
    ],
  });

  if (p.isCancel(inputMethod)) {
    p.cancel("操作已取消");
    process.exit(0);
  }

  let authInfo: AuthInfo;

  if (inputMethod === "curl") {
    // 方式 1: 粘贴 curl 命令
    const curlCommand = await p.text({
      message: "请粘贴 curl 命令:",
      placeholder: "curl 'https://onlineroomse.pku.edu.cn/...' ...",
      validate: (value) => {
        if (!value || value.length === 0) {
          return "请输入 curl 命令";
        }
      },
    });

    if (p.isCancel(curlCommand)) {
      p.cancel("操作已取消");
      process.exit(0);
    }

    try {
      authInfo = parseCurlCommand(curlCommand as string);
      if (!validateAuthInfo(authInfo)) {
        throw new Error("鉴权信息格式不正确");
      }
    } catch (error) {
      p.cancel(`解析失败: ${(error as Error).message}`);
      process.exit(1);
    }
  } else {
    // 方式 2: 手动输入
    const authorization = await p.text({
      message: "请输入 Authorization (Bearer token):",
      placeholder: "Bearer eyJhbGci...",
      validate: (value) => {
        if (!value || !value.startsWith("Bearer ")) {
          return "请输入完整的 Bearer token";
        }
      },
    });

    if (p.isCancel(authorization)) {
      p.cancel("操作已取消");
      process.exit(0);
    }

    const cookie = await p.text({
      message: "请输入 Cookie:",
      placeholder: "JWTUser=...; login_cmc_id=...",
      validate: (value) => {
        if (!value || value.length === 0) {
          return "请输入 Cookie";
        }
      },
    });

    if (p.isCancel(cookie)) {
      p.cancel("操作已取消");
      process.exit(0);
    }

    authInfo = {
      authorization: authorization as string,
      cookie: cookie as string,
    };
  }

  return authInfo;
}

/**
 * 处理 API 错误，如果是鉴权错误则删除保存的凭证
 */
async function handleApiError(error: any): Promise<void> {
  const errorMsg = error.message || String(error);

  // 检查是否是鉴权错误
  if (
    errorMsg.includes("401") ||
    errorMsg.includes("403") ||
    errorMsg.includes("Unauthorized") ||
    errorMsg.includes("Forbidden")
  ) {
    p.log.warn("鉴权已过期，请重新输入");
    await deleteAuthInfo();
  }

  p.cancel(`请求失败: ${errorMsg}`);
  process.exit(1);
}

/**
 * 筛选课程列表
 */
function filterCourses(
  courses: Course[],
  searchTerm: string
): Course[] {
  if (!searchTerm) {
    return courses;
  }

  const term = searchTerm.toLowerCase().trim();
  return courses.filter(
    (course) =>
      course.title.toLowerCase().includes(term) ||
      course.lecturer_name.toLowerCase().includes(term) ||
      course.room_name.toLowerCase().includes(term)
  );
}

async function main() {
  console.clear();

  p.intro("视频链接获取工具");

  try {
    // 步骤 1: 获取鉴权信息
    let authInfo = await getAuthInfo();

    // 步骤 2: 获取教学楼列表
    const s = p.spinner();
    s.start("获取教学楼列表...");

    let buildingsResponse;
    try {
      buildingsResponse = await getBuildings(authInfo);
      s.stop("教学楼列表获取成功");
    } catch (error) {
      s.stop("获取教学楼列表失败");
      await handleApiError(error);
      return;
    }

    if (buildingsResponse.code !== 0) {
      s.stop("获取教学楼列表失败");
      await handleApiError(new Error(buildingsResponse.msg));
      return;
    }

    // 保存鉴权信息（首次成功请求后）
    await saveAuthInfo(authInfo);

    // 准备教学楼选项
    const buildingOptions: Array<{
      value: string;
      label: string;
      hint?: string;
    }> = [];
    buildingsResponse.list.forEach((campus: Campus) => {
      campus.building_list.forEach((building: Building) => {
        buildingOptions.push({
          value: `${campus.campus_id}-${building.building_id}`,
          label: `${building.building_name}`,
          hint: campus.campus_name,
        });
      });
    });

    // 添加"全部教学楼"选项
    buildingOptions.unshift({
      value: "all",
      label: "全部教学楼",
    });

    // 步骤 3: 选择教学楼
    const selectedBuilding = await p.select({
      message: "请选择教学楼:",
      options: buildingOptions,
    });

    if (p.isCancel(selectedBuilding)) {
      p.cancel("操作已取消");
      process.exit(0);
    }

    const buildingId =
      selectedBuilding === "all"
        ? undefined
        : parseInt((selectedBuilding as string).split("-")[1] || "0");

    // 步骤 4: 输入日期
    const dateInput = await p.text({
      message: "请输入日期:",
      placeholder: new Date().toISOString().split("T")[0],
      defaultValue: new Date().toISOString().split("T")[0],
      validate: (value) => {
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return "日期格式不正确，请使用 YYYY-MM-DD 格式";
        }
      },
    });

    if (p.isCancel(dateInput)) {
      p.cancel("操作已取消");
      process.exit(0);
    }

    const date = new Date(dateInput as string);

    // 步骤 5: 获取课程列表
    s.start("获取课程列表...");

    let coursesResponse;
    try {
      coursesResponse = await getCourses(authInfo, date, buildingId);
      s.stop("课程列表获取成功");
    } catch (error) {
      s.stop("获取课程列表失败");
      await handleApiError(error);
      return;
    }

    if (coursesResponse.code !== 0) {
      s.stop("获取课程列表失败");
      p.cancel(`错误: ${coursesResponse.msg}`);
      process.exit(1);
    }

    // 收集所有课程
    const allCourses: Course[] = [];
    coursesResponse.list.forEach((timeSlot) => {
      allCourses.push(...timeSlot.list);
    });

    if (allCourses.length === 0) {
      p.cancel("没有找到符合条件的课程");
      process.exit(0);
    }

    p.note(
      `共找到 ${allCourses.length} 门课程\n如果课程较多，建议使用搜索功能`,
      "课程列表"
    );

    // 步骤 6: 搜索课程（可选）
    const searchTerm = await p.text({
      message: "输入关键词搜索课程 (课程名/教师/教室):",
      placeholder: "留空显示全部课程",
      defaultValue: "",
    });

    if (p.isCancel(searchTerm)) {
      p.cancel("操作已取消");
      process.exit(0);
    }

    // 筛选课程
    const filteredCourses = filterCourses(
      allCourses,
      searchTerm as string
    );

    if (filteredCourses.length === 0) {
      p.cancel(`没有找到包含 "${searchTerm}" 的课程`);
      process.exit(0);
    }

    // 准备课程选项
    const courseOptions: Array<{
      value: string;
      label: string;
      hint?: string;
    }> = filteredCourses.map((course: Course) => {
      const startTime = formatTimestamp(course.course_begin);
      const endTime = formatTimestamp(course.course_over);
      return {
        value: `${course.id}-${course.sub_id}`,
        label: `${course.title} - ${course.lecturer_name}`,
        hint: `${startTime} ~ ${endTime} | ${course.room_name}`,
      };
    });

    // 步骤 7: 选择课程
    const selectedCourse = await p.select({
      message: `选择课程 (${filteredCourses.length} 门):`,
      options: courseOptions,
      maxItems: 10,
    });

    if (p.isCancel(selectedCourse)) {
      p.cancel("操作已取消");
      process.exit(0);
    }

    const [courseId = "", subId = ""] = (selectedCourse as string).split("-");

    // 步骤 8: 获取视频地址
    s.start("获取视频地址...");

    let videoResponse;
    try {
      videoResponse = await getVideoInfo(authInfo, courseId, subId);
      s.stop("视频信息获取成功");
    } catch (error) {
      s.stop("获取视频信息失败");
      await handleApiError(error);
      return;
    }

    if (videoResponse.code !== 0) {
      s.stop("获取视频信息失败");
      p.cancel(`错误: ${videoResponse.msg}`);
      process.exit(1);
    }

    const videoUrl = extractVideoUrl(videoResponse);

    if (!videoUrl) {
      p.cancel("未找到视频地址，可能该课程没有回放");
      process.exit(1);
    }

    // 显示结果
    const courseInfo = videoResponse.list[0];
    if (!courseInfo) {
      p.cancel("未找到课程信息");
      process.exit(1);
    }

    const videoType = videoUrl.includes(".m3u8") ? "m3u8" : "mp4";

    p.note(videoUrl, "视频地址");

    console.log("");
    p.log.success(`课程名称: ${courseInfo.title}`);
    p.log.success(`授课教师: ${courseInfo.lecturer_name}`);
    p.log.success(`授课时间: ${formatTimestamp(courseInfo.course_begin)}`);
    p.log.success(`教室: ${courseInfo.room_name}`);
    p.log.success(`视频类型: ${videoType.toUpperCase()}`);

    // 生成友好的文件名
    const dateStr = formatTimestamp(courseInfo.course_begin);
    const filename = generateVideoFilename(
      dateStr,
      courseInfo.title,
      courseInfo.lecturer_name,
      videoType === "m3u8" ? "mp4" : "mp4"
    );

    // 询问是否下载
    const shouldDownload = await p.confirm({
      message: "是否下载视频到本地？",
      initialValue: false,
    });

    if (p.isCancel(shouldDownload)) {
      p.outro("操作完成");
      process.exit(0);
    }

    if (!shouldDownload) {
      // 用户选择不下载，显示相关信息
      console.log("");

      if (videoType === "mp4") {
        // MP4: 直接显示下载链接
        p.note(
          `你可以使用以下链接下载视频：\n${videoUrl}\n\n或使用命令行工具下载：\ncurl -o "${filename}" "${videoUrl}"`,
          "视频下载链接"
        );
      } else {
        // M3U8: 显示带鉴权的 ffmpeg 命令
        const downloadDir = "pku-download";
        const fullPath = `${downloadDir}/${filename}`;
        const ffmpegCommand = `ffmpeg -headers "Authorization: ${authInfo.authorization}" -headers "Cookie: ${authInfo.cookie}" -i "${videoUrl}" -c copy "${fullPath}"`;

        p.note(
          `${ffmpegCommand}\n\n` +
          `提示：\n` +
          `1. 确保已安装 ffmpeg\n` +
          `2. -headers 参数会自动携带鉴权信息下载所有分段和密钥\n` +
          `3. 下载前请确保 ${downloadDir} 目录存在：mkdir -p ${downloadDir}`,
          "FFmpeg 下载命令"
        );
      }

      p.outro("操作完成！");
      process.exit(0);
    }

    if (shouldDownload) {
      // 确保下载文件夹存在
      const downloadDir = "pku-download";

      // 使用 mkdir 命令确保目录存在
      try {
        await Bun.spawn(["mkdir", "-p", downloadDir], {
          stdout: "ignore",
          stderr: "ignore",
        }).exited;
      } catch (error) {
        // 忽略错误，可能目录已存在
      }

      // 更新文件路径，添加文件夹前缀
      const fullPath = `${downloadDir}/${filename}`;

      if (videoType === "m3u8") {
        // m3u8 类型：提供两种下载方式
        const downloadMethod = await p.select({
          message: "选择下载方式:",
          options: [
            {
              value: "ffmpeg",
              label: "使用 ffmpeg 下载（推荐）",
              hint: "自动合并分段并转换为 mp4",
            },
            {
              value: "direct",
              label: "直接下载 m3u8 文件",
              hint: "需要手动处理",
            },
          ],
        });

        if (p.isCancel(downloadMethod)) {
          p.outro("操作完成");
          process.exit(0);
        }

        if (downloadMethod === "ffmpeg") {
          // 使用 ffmpeg 下载
          const ffmpegCommand = `ffmpeg -headers "Authorization: ${authInfo.authorization}" -headers "Cookie: ${authInfo.cookie}" -i "${videoUrl}" -c copy "${fullPath}"`;

          p.note(
            `${ffmpegCommand}\n` +
            `提示：ffmpeg 会自动下载所有分段和密钥文件`,
            "FFmpeg 命令"
          );

          // 询问是否直接执行
          const executeNow = await p.confirm({
            message: "是否现在执行下载？（需要安装 ffmpeg）",
            initialValue: false,
          });

          if (!p.isCancel(executeNow) && executeNow) {
            s.start(`正在下载: ${filename}`);

            try {
              const proc = Bun.spawn([
                "ffmpeg",
                "-headers",
                `Authorization: ${authInfo.authorization}`,
                "-headers",
                `Cookie: ${authInfo.cookie}`,
                "-i",
                videoUrl,
                "-c",
                "copy",
                fullPath,
              ], {
                stdout: "ignore",  // 忽略标准输出，避免污染界面
                stderr: "ignore",  // 忽略标准错误
              });

              const exitCode = await proc.exited;

              if (exitCode === 0) {
                s.stop("下载完成");
                p.log.success(`文件已保存: ${fullPath}`);
              } else {
                s.stop("下载失败");
                p.log.error("请检查 ffmpeg 是否已安装或视频地址是否有效");
              }
            } catch (error) {
              s.stop("下载失败");
              p.log.error(
                `错误: ${(error as Error).message}\n提示: 请确保已安装 ffmpeg`
              );
            }
          }
        } else {
          // 直接下载 m3u8 文件
          const m3u8Filename = fullPath.replace(".mp4", ".m3u8");

          s.start(`正在下载: ${filename.replace(".mp4", ".m3u8")}`);

          try {
            await downloadFile(videoUrl, m3u8Filename, authInfo, (downloaded, total) => {
              const progressPercent = Math.floor((downloaded / total) * 100);
              const progressBar = createProgressBar(progressPercent);
              s.message(
                `正在下载: ${progressBar}\n${formatFileSize(downloaded)} / ${formatFileSize(total)}`
              );
            });

            s.stop("下载完成");
            p.log.success(`文件已保存: ${m3u8Filename}`);
            p.log.info(
              `提示: m3u8 文件需要使用播放器打开，或使用 ffmpeg 转换为 mp4`
            );
          } catch (error) {
            s.stop("下载失败");
            p.log.error(`错误: ${(error as Error).message}`);
          }
        }
      } else {
        // mp4 类型：直接下载
        s.start(`正在下载: ${filename}`);

        try {
          await downloadFile(videoUrl, fullPath, authInfo, (downloaded, total) => {
            const progressPercent = Math.floor((downloaded / total) * 100);
            const progressBar = createProgressBar(progressPercent);
            s.message(
              `正在下载: ${progressBar}\n${formatFileSize(downloaded)} / ${formatFileSize(total)}`
            );
          });

          s.stop("下载完成");
          p.log.success(`文件已保存: ${fullPath}`);

          // 获取文件大小
          const file = Bun.file(fullPath);
          const size = file.size;
          p.log.info(`文件大小: ${formatFileSize(size)}`);
        } catch (error) {
          s.stop("下载失败");
          p.log.error(`错误: ${(error as Error).message}`);
        }
      }
    }

    p.outro("操作完成！");
  } catch (error) {
    p.cancel(`发生错误: ${(error as Error).message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
