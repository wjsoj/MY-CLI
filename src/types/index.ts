// 鉴权信息
export interface AuthInfo {
  authorization: string;
  cookie: string;
}

// 教学楼
export interface Building {
  building_id: number;
  building_name: string;
}

// 校区
export interface Campus {
  campus_id: number;
  campus_name: string;
  building_list: Building[];
}

// 教学楼列表响应
export interface BuildingsResponse {
  code: number;
  msg: string;
  total: string;
  list: Campus[];
}

// 课程信息
export interface Course {
  id: string;
  title: string;
  realname: string;
  course_begin: string;
  course_over: string;
  room_name: string;
  sub_id: string;
  sub_title: string;
  sub_status: string;
  course_student_type: string;
  lecturer_name: string;
}

// 时间段
export interface TimeSlot {
  id: number;
  name: string;
  class_begin: number;
  class_end: number;
  class_begin_time: string;
  class_end_time: string;
  list: Course[];
}

// 课程列表响应
export interface CoursesResponse {
  code: number;
  msg: string;
  total: number;
  list: TimeSlot[];
}

// 视频内容
export interface VideoContent {
  contents: string;
  contents_duration: string;
  is_m3u8: string;
}

// 视频课程详情
export interface VideoCourse {
  id: string;
  title: string;
  realname: string;
  sub_id: string;
  sub_title: string;
  sub_content: string;
  course_begin: string;
  course_over: string;
  room_name: string;
  lecturer_name: string;
  sub_duration: string;
}

// 视频响应
export interface VideoResponse {
  code: number;
  msg: string;
  total: string;
  list: VideoCourse[];
}
