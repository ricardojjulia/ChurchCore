export type GroupCategory =
  | "general"
  | "life_stage"
  | "geographic"
  | "interest"
  | "discipleship"
  | "support"
  | "service"
  | "youth"
  | "seniors";

export type GroupMemberRole = "leader" | "co_leader" | "member";
export type GroupMemberStatus = "active" | "inactive" | "pending";
export type AttendanceStatus = "present" | "absent" | "excused";

export type Group = {
  id: string;
  churchId: string;
  name: string;
  description: string | null;
  category: GroupCategory;
  leaderProfileId: string | null;
  leaderName: string | null;
  meetingDay: string | null;
  meetingTime: string | null;
  meetingLocation: string | null;
  capacity: number | null;
  memberCount: number;
  isOpen: boolean;
  isActive: boolean;
  createdAt: string;
};

export type GroupMember = {
  id: string;
  groupId: string;
  profileId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: GroupMemberRole;
  status: GroupMemberStatus;
  joinedAt: string;
};

export type GroupMeeting = {
  id: string;
  groupId: string;
  scheduledAt: string;
  location: string | null;
  notes: string | null;
  attendanceCount: number;
  createdAt: string;
};

export type GroupAttendanceRecord = {
  meetingId: string;
  profileId: string;
  fullName: string;
  status: AttendanceStatus;
};

export type GroupResource = {
  id: string;
  groupId: string;
  title: string;
  url: string | null;
  resourceType: "link" | "file" | "note" | "video";
  addedByName: string | null;
  createdAt: string;
};

export type GroupDetail = {
  group: Group;
  members: GroupMember[];
  upcomingMeetings: GroupMeeting[];
  pastMeetings: GroupMeeting[];
  resources: GroupResource[];
};

export type GroupsListData = {
  groups: Group[];
  totalCount: number;
};

export type ServiceAttendanceEntry = {
  id: string;
  serviceDate: string;
  serviceType: string;
  headcount: number | null;
  notes: string | null;
  createdAt: string;
};

export type FirstTimeVisitor = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  visitDate: string;
  referredBy: string | null;
  howDidHear: string | null;
  workflowStage: string;
  workflowNotes: string | null;
  convertedAt: string | null;
  createdAt: string;
};

export const GROUP_CATEGORIES: { value: GroupCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "life_stage", label: "Life Stage" },
  { value: "geographic", label: "Geographic" },
  { value: "interest", label: "Interest" },
  { value: "discipleship", label: "Discipleship" },
  { value: "support", label: "Support" },
  { value: "service", label: "Service" },
  { value: "youth", label: "Youth" },
  { value: "seniors", label: "Seniors" },
];

export const MEETING_DAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];
