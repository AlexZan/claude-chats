/**
 * Unified message content extraction utility
 * Handles various content formats and extraction options
 */

import { ConversationMessage } from '../types';

export interface ContentExtractionOptions {
  /**
   * Filter out system metadata tags like <ide_selection>, <system-info>, etc.
   * Default: false (show all content)
   */
  filterSystemMetadata?: boolean;

  /**
   * Include tool_use blocks in extracted content
   * Default: false (text only)
   */
  includeToolUse?: boolean;

  /**
   * String to use when joining multiple content items
   * Default: ' ' (single space)
   */
  joinWith?: string;

  /**
   * Return only the first non-empty text item instead of all items
   * Default: false (return all)
   */
  returnFirstOnly?: boolean;
}

/**
 * Centralized message content extraction
 * Single source of truth for extracting text from conversation messages
 */
export class MessageContentExtractor {
  /**
   * Regex pattern for system metadata tags that should be filtered
   */
  private static readonly SYSTEM_METADATA_PATTERN = /^<(ide_|system-|user-|command-)/;

  /**
   * Check if text content is system metadata
   */
  private static isSystemMetadata(text: string): boolean {
    return this.SYSTEM_METADATA_PATTERN.test(text.trim());
  }

  /**
   * Extract text content from a conversation message with configurable options
   *
   * @param message - The conversation message to extract content from
   * @param options - Extraction configuration options
   * @returns Extracted text content as a single string
   *
   * @example
   * // For title extraction (first text only, no metadata):
   * MessageContentExtractor.extractText(msg, {
   *   filterSystemMetadata: true,
   *   returnFirstOnly: true
   * })
   *
   * @example
   * // For viewer display (all text with tools, joined with newlines):
   * MessageContentExtractor.extractText(msg, {
   *   includeToolUse: true,
   *   joinWith: '\n\n'
   * })
   */
  static extractText(
    message: ConversationMessage,
    options: ContentExtractionOptions = {}
  ): string {
    // Default options
    const {
      filterSystemMetadata = false,
      includeToolUse = false,
      joinWith = ' ',
      returnFirstOnly = false
    } = options;

    // Validate message structure
    if (!message.message || !message.message.content) {
      return '';
    }

    const { content } = message.message;

    // Handle string content
    if (typeof content === 'string') {
      if (filterSystemMetadata && this.isSystemMetadata(content)) {
        return '';
      }
      return content;
    }

    // Handle array content
    if (Array.isArray(content)) {
      const extractedItems: string[] = [];

      for (const item of content) {
        // Handle text items
        if (item.type === 'text' && item.text) {
          // Filter system metadata if requested
          if (filterSystemMetadata && this.isSystemMetadata(item.text)) {
            continue;
          }
          extractedItems.push(item.text);

          // Return first match if requested
          if (returnFirstOnly) {
            return item.text;
          }
        }

        // Handle tool_use items if requested
        if (includeToolUse && item.type === 'tool_use') {
          const toolText = `[Tool: ${item.name}]\n${JSON.stringify(item.input, null, 2)}`;
          extractedItems.push(toolText);
        }
      }

      // Join all extracted items
      return extractedItems.filter(text => text.length > 0).join(joinWith);
    }

    return '';
  }

  /**
   * Extract text from raw content (without message wrapper)
   * Used internally by FileOperations for direct content processing
   *
   * @param content - Raw message content (string or array)
   * @param options - Extraction configuration options
   * @returns Extracted text content
   */
  static extractTextFromContent(
    content: string | Array<{ type: string; text?: string; name?: string; input?: any }>,
    options: ContentExtractionOptions = {}
  ): string {
    // Create a minimal message wrapper for the unified extractor
    const wrappedMessage: ConversationMessage = {
      type: 'user',
      message: {
        role: 'user',
        content
      },
      isSidechain: false,
      uuid: '',
      parentUuid: '',
      timestamp: '',
      sessionId: ''
    };

    return this.extractText(wrappedMessage, options);
  }
}
