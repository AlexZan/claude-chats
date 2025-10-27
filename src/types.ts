/**
 * Type definitions for Claude Code conversations
 */

export interface ConversationMessage {
  type: 'user' | 'assistant';
  message: {
    role: 'user' | 'assistant';
    content: string | MessageContent[];
  };
  uuid: string;
  parentUuid: string | null;
  isSidechain: boolean;
  timestamp: string;
  sessionId: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  userType?: string;
}

export interface SummaryMessage {
  type: 'summary';
  summary: string;
  leafUuid: string;
}

export type ConversationLine = ConversationMessage | SummaryMessage;

export interface MessageContent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface Conversation {
  id: string;
  title: string;
  filePath: string;
  project: string;
  lastModified: Date;
  messageCount: number;
  fileSize: number;
  isArchived: boolean;
}

export interface ConversationMetadata {
  title?: string;
  tags?: string[];
  archived?: boolean;
  bookmarked?: boolean;
  lastModified?: string;
}
