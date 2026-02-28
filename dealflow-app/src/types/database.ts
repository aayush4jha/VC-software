// Dholakia Ventures — Deal Flow Management Types

export type UserRole = 'analyst' | 'partner' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  organizationId?: string | null;
}

export type CompanyRound =
  | 'Pre-Seed'
  | 'Seed'
  | 'Pre-Series A'
  | 'Series A'
  | 'Pre-Series B'
  | 'Series B'
  | 'Growth Stage'
  | 'Pre-IPO'
  | 'IPO';

export type PriorityLevel = 'Low' | 'Medium' | 'High';

export type DealSourceType =
  | 'Founder Network'
  | 'Investment Banker'
  | 'Friends & Family'
  | 'VC & PE';

export type ShareType = 'Primary' | 'Secondary';

export type CommunicationMethod =
  | 'Email'
  | 'Verbal'
  | 'WhatsApp'
  | 'Call'
  | 'Not Yet Communicated';

export type TerminalStatus =
  | 'Portfolio'
  | 'Rejected'
  | 'Awaiting Response'
  | 'Blocker'
  | 'Next Round Analysis';

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color: string;
  description: string;
}

export interface Industry {
  id: string;
  name: string;
}

export interface SubIndustry {
  id: string;
  name: string;
  industryId: string;
}

export interface DealSourceName {
  id: string;
  name: string;
}

export interface RejectionReasonCategory {
  id: string;
  name: string;
  subReasons: RejectionSubReason[];
}

export interface RejectionSubReason {
  id: string;
  name: string;
  categoryId: string;
}

export interface Company {
  id: string;
  companyName: string;
  founderName: string;
  founderEmail: string;
  analystId: string | null;
  companyRound: CompanyRound;
  pipelineStageId: string;
  priorityLevel: PriorityLevel;
  dealSourceType: DealSourceType;
  dealSourceNameId: string;
  industryId: string;
  subIndustry: string;
  shareType: ShareType;
  totalFundRaise: number | null;
  valuation: number | null;
  googleDriveLink: string;
  customTags: string[];
  linkedPreviousEntryId: string | null;
  terminalStatus: TerminalStatus | null;
  createdAt: string;
  updatedAt: string;
  slaDeadline: string | null;
  isOverdue: boolean;
  // AI fields
  quickSummary: string | null;
  deckAnalysis: DeckAnalysis | null;
  kpiData: KPIData | null;
  callTranscript: CallTranscript | null;
  filterBrief: string | null;
  icMemo: string | null;
}

export interface DeckAnalysis {
  summary: string;
  problem: string;
  solution: string;
  market: string;
  businessModel: string;
  traction: string;
  team: string;
  strengths: string[];
  redFlags: string[];
  suggestedQuestions: string[];
}

export interface KPIData {
  businessModel: string;
  kpis: { name: string; value: string; benchmark: string; status: 'above' | 'below' | 'on-par' }[];
}

export interface CallTranscript {
  recordingUrl: string;
  date: string;
  duration: string;
  platform: string;
  keyPoints: string[];
  actionItems: string[];
  concerns: string[];
  redFlags: string[];
}

export interface RejectionRecord {
  id: string;
  companyId: string;
  reasons: { categoryId: string; subReasonIds: string[] }[];
  rejectionStageId: string;
  communicationMethod: CommunicationMethod;
  rejectionEmailRecipient: string;
  rejectionEmailDraft: string;
  rejectionEmailSent: boolean;
  createdAt: string;
}

export interface Comment {
  id: string;
  companyId: string;
  authorId: string;
  text: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  companyId: string;
  userId: string;
  action: string;
  details: string;
  fromStageId?: string;
  toStageId?: string;
  createdAt: string;
}

export type NotificationType =
  | 'assignment'
  | 'overdue'
  | 'stage_change'
  | 'new_company'
  | 'comment';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  companyId: string;
  read: boolean;
  createdAt: string;
}
