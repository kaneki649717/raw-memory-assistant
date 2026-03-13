export type ChatType = "direct" | "group" | "channel" | "unknown";

export interface WorkingMemoryEvent {
  id: string;
  timestamp: string;
  sessionId: string;
  chatType: ChatType;
  topic?: string;
  actionType: string;
  entities: string[];
  summaryShort: string;
  resultTag?: string;
  importance?: number;
  sourceMessageCount?: number;
  sourceRefs?: string[];
}

export interface WorkingMemoryDecision {
  id: string;
  eventId: string;
  sessionId: string;
  title: string;
  decisionText: string;
  whyText?: string;
  outcomeText?: string;
  files: string[];
  entities: string[];
  configKeys: string[];
  commands: string[];
  confidence?: number;
  createdAt: string;
}

export interface WorkingMemoryStore {
  version: number;
  events: WorkingMemoryEvent[];
  decisions: WorkingMemoryDecision[];
}

export interface RecallBundle {
  timelineItems: WorkingMemoryEvent[];
  decisionItems: WorkingMemoryDecision[];
  snippetItems: Array<{ source: string; text: string }>;
  rawEvidenceItems: Array<{ source: string; text: string }>;
}
