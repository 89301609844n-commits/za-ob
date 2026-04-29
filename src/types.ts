
export enum AppealStatus {
  NEW = 'NEW',
  PROCESSING = 'PROCESSING',
  ANALYZED = 'ANALYZED',
  REPLIED = 'REPLIED',
}

export interface Appeal {
  id: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  content: string;
  receivedAt: string;
  status: AppealStatus;
  category?: string;
  summary?: string;
  suggestedResponse?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface AnalysisResult {
  category: string;
  summary: string;
  suggestedResponse: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}
