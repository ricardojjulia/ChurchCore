export type CommunicationChannel = 'email' | 'sms';

export type SegmentFilter = {
  role?: string;
  ministryIds?: string[];
  membershipStatus?: string;
  attendedWithinDays?: number;
};

export type CommunicationTemplate = {
  id: string;
  churchId: string;
  name: string;
  channel: CommunicationChannel;
  subject: string | null;
  body: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ComposeMessageInput = {
  channel: CommunicationChannel;
  subject: string | null;
  body: string;
  segment: SegmentFilter;
  scheduledFor: string | null;
  templateId?: string;
};

export type RecipientPreviewResult = {
  count: number;
  sample: Array<{ profileId: string; name: string; contact: string }>;
};

export type MessageAnalytics = {
  logId: string;
  sentCount: number;
  deliveredCount: number;
  bouncedCount: number;
  failedCount: number;
  openRate: number | null;
  suppressedCount: number;
};

export type CommunicationLogSummary = {
  id: string;
  channel: CommunicationChannel;
  subject: string | null;
  bodyPreview: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
  retryCount: number;
  segmentCriteria: SegmentFilter | null;
  sentByName: string | null;
};

export type CommunicationLogDetail = CommunicationLogSummary & {
  sentBy: string | null;
  recipientId: string | null;
  provider: string | null;
  externalId: string | null;
};
