import * as vscode from 'vscode';

/**
 * Utilities for detecting and working with Claude Code chat tabs
 */

/**
 * Check if a tab is a Claude Code chat tab
 * @param tab The tab to check
 * @returns true if this is a Claude Code chat (not the main panel)
 */
export function isClaudeCodeChatTab(tab: vscode.Tab | undefined): boolean {
  if (!tab) {
    return false;
  }

  // Check if it's a webview with Claude Code's viewType
  if (!(tab.input instanceof vscode.TabInputWebview)) {
    return false;
  }

  if (tab.input.viewType !== 'mainThreadWebview-claudeVSCodePanel') {
    return false;
  }

  // Exclude the main "Claude Code" panel - we only want actual chats
  if (tab.label === 'Claude Code') {
    return false;
  }

  return true;
}

/**
 * Get the currently active Claude Code chat tab, if any
 * @returns The active Claude Code chat tab, or undefined
 */
export function getActiveClaudeCodeChatTab(): vscode.Tab | undefined {
  const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;

  if (isClaudeCodeChatTab(activeTab)) {
    return activeTab;
  }

  return undefined;
}

/**
 * Get the chat title from a Claude Code tab
 * @param tab The tab
 * @returns The chat title (may be truncated)
 */
export function getChatTitleFromTab(tab: vscode.Tab): string {
  return tab.label;
}
