/**
 * Configuration utilities
 * Type-safe access to VS Code extension settings
 */

import * as vscode from 'vscode';

/**
 * Configuration namespace for this extension
 */
const CONFIG_NAMESPACE = 'claudeCodeConversationManager';

/**
 * Configuration keys and their types
 */
interface ExtensionConfig {
  showEmptyConversations: boolean;
  confirmArchive: boolean;
  showStatusBarButton: boolean;
}

/**
 * Get extension configuration
 *
 * @returns Configuration object for this extension
 *
 * @example
 * const config = getConfig();
 * const showEmpty = config.get('showEmptyConversations', false);
 */
export function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
}

/**
 * Get a typed configuration value
 *
 * @param key - Configuration key
 * @param defaultValue - Default value if not set
 * @returns Configuration value
 *
 * @example
 * const showEmpty = getConfigValue('showEmptyConversations', false);
 */
export function getConfigValue<K extends keyof ExtensionConfig>(
  key: K,
  defaultValue: ExtensionConfig[K]
): ExtensionConfig[K] {
  const config = getConfig();
  return config.get<ExtensionConfig[K]>(key, defaultValue);
}

/**
 * Set a configuration value
 *
 * @param key - Configuration key
 * @param value - Value to set
 * @param global - Whether to set globally (default: false, workspace-level)
 *
 * @example
 * await setConfigValue('showEmptyConversations', true);
 */
export async function setConfigValue<K extends keyof ExtensionConfig>(
  key: K,
  value: ExtensionConfig[K],
  global: boolean = false
): Promise<void> {
  const config = getConfig();
  await config.update(key, value, global);
}

/**
 * Check if empty conversations should be shown
 *
 * @returns True if empty conversations should be displayed
 */
export function shouldShowEmptyConversations(): boolean {
  return getConfigValue('showEmptyConversations', false);
}

/**
 * Check if archive confirmation is enabled
 *
 * @returns True if archive confirmation prompt should be shown
 */
export function shouldConfirmArchive(): boolean {
  return getConfigValue('confirmArchive', true);
}

/**
 * Check if status bar button should be shown
 *
 * @returns True if status bar button should be visible
 */
export function shouldShowStatusBarButton(): boolean {
  return getConfigValue('showStatusBarButton', true);
}

/**
 * Legacy configuration support for 'claudeChats' namespace
 * Used for backward compatibility with older versions
 */
export function getLegacyConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('claudeChats');
}
