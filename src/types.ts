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
  lastMessageTime: Date; // Display time (first user message or leafUuid message)
  actualLastMessageTime: Date; // Actual last message time (for tiebreaking)
  messageCount: number;
  fileSize: number;
  isArchived: boolean;
  hasRealMessages: boolean; // Whether conversation has real user messages (not just warmup)
  isHidden: boolean; // Whether conversation is hidden in Claude Code (linked to another conversation)
}

export interface ConversationMetadata {
  title?: string;
  tags?: string[];
  archived?: boolean;
  bookmarked?: boolean;
  lastModified?: string;
}
