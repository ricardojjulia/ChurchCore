export type ChurchDocumentType =
  | 'vision_mission'
  | 'faith_stance'
  | 'policy'
  | 'general'
  | 'elder_council_notes';

export type ChurchDocument = {
  id: string; churchId: string; title: string; docType: ChurchDocumentType;
  body: string; // always plaintext at app boundary
  createdBy: string | null; updatedBy: string | null; createdAt: string; updatedAt: string;
};
export type ChurchDocumentListItem = Omit<ChurchDocument, 'body'>;

export type OnboardingTemplate = {
  id: string; churchId: string; name: string; createdBy: string | null;
  deletedAt: string | null; createdAt: string; updatedAt: string;
};
export type OnboardingTemplateStep = {
  id: string; churchId: string; templateId: string; sortOrder: number;
  title: string; description: string | null; assigneeType: 'staff' | 'new_member';
  createdAt: string; updatedAt: string;
};
export type OnboardingInstance = {
  id: string; churchId: string; templateId: string | null; profileId: string;
  startedBy: string | null; status: 'open' | 'closed'; closeReason: string | null;
  closedAt: string | null; createdAt: string; updatedAt: string;
};
export type OnboardingInstanceStep = {
  id: string; churchId: string; instanceId: string; sortOrder: number;
  title: string; description: string | null; assigneeType: 'staff' | 'new_member';
  isComplete: boolean; completedAt: string | null; completedBy: string | null;
  createdAt: string; updatedAt: string;
};
export type OnboardingInstanceSummary = OnboardingInstance & {
  profileName: string; templateName: string | null; totalSteps: number; completedSteps: number;
};
export type OnboardingInstanceDetail = OnboardingInstance & {
  profileName: string; templateName: string | null; steps: OnboardingInstanceStep[];
};
