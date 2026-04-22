
export enum CaseStatus {
  NEW = 'New',
  DRAFTING = 'Drafting',
  PENDING_APPROVAL = 'Pending Approval',
  APPROVED = 'Approved',
  SENT = 'Sent'
}

export enum Urgency {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical'
}

export type UserRole = 'resident' | 'writer' | 'admin' | 'mp';

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
  attachments?: string[]; // Base64 strings
}

export interface CaseDocument {
  id: string;
  name: string;
  type: string;
  content: string; // Base64
  summary?: string;
}

export interface CaseHistoryEvent {
  timestamp: Date;
  action: string;
  user: string; // e.g., "System", "WriterA", "MP", "AI Agent"
}

export interface CaseNote {
  id: string;
  content: string;
  author: string;
  timestamp: Date;
}

export interface Case {
  id: string;
  residentName: string;
  nricMasked: string; // e.g., S****123A
  constituency: string; // e.g., "Ang Mo Kio GRC"
  division?: string; // e.g., "Teck Ghee"
  mpName: string; // e.g., "Mr. Lee Hsien Loong"
  
  // Assigned based on postal code
  assignedConstituency?: string;
  assignedDivision?: string;
  assignedMPName?: string;

  category: string;
  subCategory: string;
  summary: string;
  keyFacts?: string[]; // Extracted facts
  coreRequest?: string; // Specific ask
  urgency: Urgency;
  status: CaseStatus;
  messages: Message[];
  documents: CaseDocument[];
  generatedLetter?: string;
  suggestedAgencies?: string[];
  createdAt: Date;
  assignedTo?: string;
  approvals: string[]; // List of admin IDs who approved
  history: CaseHistoryEvent[];
  internalNotes: CaseNote[];
}

export interface CategorizationResult {
  category: string;
  subCategory: string;
  urgency: Urgency;
  summary: string;
  keyFacts: string[];
  coreRequest: string;
  suggestedAgencies: string[];
}
