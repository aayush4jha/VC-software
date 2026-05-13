// Dholakia Ventures — Deal Flow Management Types

export type UserRole = 'analyst' | 'partner' | 'admin' | string;

export type PagePermission =
  | 'dashboard'
  | 'dealflow'
  | 'portfolio'
  | 'legal'
  | 'analytics'
  | 'pipeline-analytics'
  | 'audit-trail'
  | 'contacts'
  | 'emails'
  | 'news'
  | 'admin'
  | 'settings';

export const ALL_PAGE_PERMISSIONS: { key: PagePermission; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'dealflow', label: 'Deal Flow' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'legal', label: 'Legal' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'pipeline-analytics', label: 'Pipeline Analytics' },
  { key: 'audit-trail', label: 'Audit Trail' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'emails', label: 'Email Workspace' },
  { key: 'news', label: 'News' },
  { key: 'admin', label: 'Admin' },
  { key: 'settings', label: 'Settings' },
];

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  organizationId?: string | null;
  permissions: PagePermission[];
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

export interface RejectionRecord {
  id: string;
  companyId: string;
  reasons: { categoryId: string; subReasonIds: string[] }[];
  rejectionStageId: string;
  communicationMethod: string;
  rejectionEmailRecipient: string;
  rejectionEmailDraft: string;
  rejectionEmailSent: boolean;
  createdAt: string;
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
  stageDeadlines: Record<string, string>; // { stageId: ISO date }
  needsReview: boolean;
  ingestionSource: string | null;
  // AI fields
  quickSummary: string | null;
  deckAnalysis: DeckAnalysis | null;
  kpiData: KPIData | null;
  callTranscript: CallTranscript | null;
  filterBrief: string | null;
  icMemo: string | null;
  deckEmailLink: string | null;
  meetEventTitle: string | null;
  meetEventDate: string | null;
  // Portfolio-specific fields
  initialInvestment: number | null;
  entryValuation: number | null;
  entryOwnership: number | null;
  currentOwnership: number | null;
  latestValuation: number | null;
  portfolioStatus: PortfolioStatus;
  exitValue: number | null;
  exitDate: string | null;
  hqLocation: string;
  notes: string;
  // Entry round detail (Portfolio)
  sharePrice: number | null;
  numShares: number | null;
  entryPreMoneyValuation: number | null;
  entryPostMoneyValuation: number | null;
}

export type PortfolioStatus = 'Active' | 'Exited' | 'Written Off';

export interface FollowOnRound {
  id: string;
  companyId: string;
  organizationId: string;
  roundName: string;
  roundDate: string;
  totalRaised: number | null;
  ourInvestment: number | null;
  didWeInvest: boolean;
  // Legacy alias for post_money_valuation (kept for backwards compat).
  roundValuation: number | null;
  ownershipAfter: number | null;
  investorNames: string;
  notes: string;
  // Follow-on round breakdown
  sharePrice: number | null;
  numShares: number | null;
  preMoneyValuation: number | null;
  postMoneyValuation: number | null;
  ownershipSought: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeckAnalysis {
  summary: string;
  problem: string;
  solution: string;
  market: string;
  businessModel: string;
  traction: string;
  team: string;
  competitiveLandscape?: string;
  financialProjection?: string;
  investmentThesis?: string;
  strengths: string[];
  risks?: string[];
  redFlags: string[];
  suggestedQuestions?: string[];
  dueDiligenceQuestions?: string[];
  verdict?: string;
  confidenceScore?: number;
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
  // Full transcript and analysis
  transcript?: string;
  facialAnalysis?: string;
  sentimentSummary?: string;
  participantBehavior?: string[];
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

export interface AuditLog {
  id: string;
  companyId: string;
  userId: string;
  action: string;       // 'field_update' | 'stage_change' | 'created' | 'deleted' | 'rejected' | etc.
  entity: string;       // 'company' | 'score' | 'feedback' | etc.
  field: string | null;  // specific field changed
  oldValue: string | null;
  newValue: string | null;
  details: string;
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

export interface SavedView {
  id: string;
  name: string;
  filters: Record<string, string[]>;
  createdAt: string;
}

export interface IngestedEmail {
  id: string;
  organizationId: string;
  gmailMessageId: string;
  gmailThreadId: string | null;
  senderName: string;
  senderEmail: string;
  subject: string;
  receivedAt: string | null;
  hasAttachments: boolean;
  attachmentNames: string[];
  companyId: string | null;
  status: 'processed' | 'skipped' | 'error';
  errorMessage: string | null;
  relevanceLabel: string | null;
  createdAt: string;
}

export interface CompanyScore {
  id: string;
  companyId: string;
  scorerType: 'ai' | 'analyst';
  scorerId: string | null;  // user ID for analyst, null for AI
  score: number;            // percentage 0-100
  createdAt: string;
}

export const FEEDBACK_RATING_CATEGORIES = ['Market', 'Team', 'Product', 'Traction', 'Risk'] as const;
export type FeedbackRatingCategory = typeof FEEDBACK_RATING_CATEGORIES[number];

export const FEEDBACK_TAGS = [
    'Strong Team', 'Weak Team', 'Large Market', 'Niche Market',
    'High Risk', 'Low Risk', 'Follow-up Required', 'Strong Traction',
    'No Traction', 'Good Unit Economics', 'Needs Data', 'Competitive Moat',
    'Crowded Space', 'Capital Intensive', 'Scalable',
] as const;

export interface CompanyFeedback {
    id: string;
    companyId: string;
    userId: string;
    stageId: string;
    ratings: Record<FeedbackRatingCategory, number>; // 1-5 for each
    comment: string;
    tags: string[];
    status: 'active' | 'addressed' | 'resolved';
    createdAt: string;
}

export interface EmailLog {
  id: string;
  companyId: string | null;
  senderId: string | null;
  recipientEmail: string;
  subject: string;
  body: string;
  emailType: string;
  createdAt: string;
}
