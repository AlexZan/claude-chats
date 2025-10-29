import * as vscode from 'vscode';
import { FileOperations } from './fileOperations';
import { ConversationMessage } from './types';
import { ConversationTreeItem } from './conversationTree';
import { MessageContentExtractor } from './utils/messageContentExtractor';

/**
 * Manages the conversation viewer webview panel
 */
export class ConversationViewer {
  private static currentPanel: ConversationViewer | undefined;
  private readonly panel: vscode.WebviewPanel;
  private conversationPath: string;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, conversationPath: string) {
    this.panel = panel;
    this.conversationPath = conversationPath;

    // Set the webview's initial html content
    this.update();

    // Listen for when the panel is disposed
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'saveAsMarkdown':
            this.saveAsMarkdown();
            break;
        }
      },
      null,
      this.disposables
    );
  }

  /**
   * Show the conversation viewer for a given conversation file
   */
  public static show(extensionUri: vscode.Uri, conversationPath: string) {
    const column = vscode.ViewColumn.One;
    const panelTitle = this.getPanelTitle(conversationPath);

    // If we already have a panel, reuse it
    if (ConversationViewer.currentPanel) {
      ConversationViewer.currentPanel.conversationPath = conversationPath;
      ConversationViewer.currentPanel.panel.title = panelTitle;
      ConversationViewer.currentPanel.panel.reveal(column);
      ConversationViewer.currentPanel.update();
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'claudeConversationViewer',
      panelTitle,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    ConversationViewer.currentPanel = new ConversationViewer(panel, conversationPath);
  }

  /**
   * Get the formatted panel title for a conversation
   */
  private static getPanelTitle(conversationPath: string): string {
    const title = FileOperations.getConversationTitle(conversationPath);
    const truncatedTitle = ConversationTreeItem.truncateTitle(title, 24);
    return `📖 ${truncatedTitle}`;
  }

  /**
   * Save the conversation as markdown
   */
  private async saveAsMarkdown() {
    const markdown = FileOperations.exportToMarkdown(this.conversationPath);
    const title = FileOperations.getConversationTitle(this.conversationPath);

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${title}.md`),
      filters: {
        'Markdown': ['md']
      }
    });

    if (!uri) {
      return;
    }

    await vscode.workspace.fs.writeFile(uri, Buffer.from(markdown, 'utf-8'));
    vscode.window.showInformationMessage(`Saved to: ${uri.fsPath}`);
  }

  /**
   * Update the webview content
   */
  private update() {
    this.panel.webview.html = this.getHtmlForWebview();
  }

  /**
   * Generate the HTML content for the webview
   */
  private getHtmlForWebview(): string {
    // Parse conversation
    const messages = FileOperations.parseConversation(this.conversationPath);
    const title = FileOperations.getConversationTitle(this.conversationPath);

    // Filter out sidechain/warmup messages
    const conversationMessages = messages.filter(msg => {
      if ('_metadata' in msg) return false;
      if (msg.type !== 'user' && msg.type !== 'assistant') return false;
      if (msg.isSidechain) return false;
      return true;
    }) as ConversationMessage[];

    // Generate message HTML
    const messagesHtml = conversationMessages.map(msg => this.renderMessage(msg)).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 0;
      margin: 0;
      line-height: 1.6;
    }

    .header {
      position: sticky;
      top: 0;
      background-color: var(--vscode-editorGroupHeader-tabsBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      z-index: 100;
    }

    .header-title {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .readonly-badge {
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .save-button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 14px;
      border-radius: 2px;
      cursor: pointer;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      flex-shrink: 0;
      white-space: nowrap;
    }

    .save-button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    .save-button:active {
      background-color: var(--vscode-button-hoverBackground);
      transform: translateY(1px);
    }

    @media (max-width: 600px) {
      .header {
        padding: 12px 16px;
      }

      .header-title {
        font-size: 14px;
        flex-basis: 100%;
      }

      .save-button {
        padding: 4px 10px;
        font-size: 12px;
      }

      .readonly-badge {
        font-size: 10px;
        padding: 1px 6px;
      }
    }

    .messages-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px;
    }

    .message {
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .message-role {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .message-role.user {
      color: var(--vscode-textLink-foreground);
    }

    .message-role.assistant {
      color: var(--vscode-notebookStatusSuccessIcon-foreground);
    }

    .message-content {
      background-color: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 6px;
      padding: 16px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .message.user .message-content {
      border-left: 3px solid var(--vscode-textLink-foreground);
    }

    .message.assistant .message-content {
      border-left: 3px solid var(--vscode-notebookStatusSuccessIcon-foreground);
    }

    code {
      background-color: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 3px;
      padding: 2px 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }

    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">
      <span>📖 ${this.escapeHtml(title)}</span>
      <span class="readonly-badge">Read Only</span>
    </div>
    <button class="save-button" onclick="saveAsMarkdown()">💾 Save as Markdown</button>
  </div>

  <div class="messages-container">
    ${messagesHtml || '<div class="empty-state">No messages in this conversation</div>'}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function saveAsMarkdown() {
      vscode.postMessage({
        command: 'saveAsMarkdown'
      });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Render a single message
   */
  private renderMessage(message: ConversationMessage): string {
    const role = message.type;
    const roleLabel = role === 'user' ? '👤 User' : '🤖 Assistant';
    const content = this.extractContent(message);

    return `
      <div class="message ${role}">
        <div class="message-role ${role}">${roleLabel}</div>
        <div class="message-content">${this.escapeHtml(content)}</div>
      </div>
    `;
  }

  /**
   * Extract text content from a message
   */
  private extractContent(message: ConversationMessage): string {
    // Use centralized content extractor
    // Show all content including tool_use, joined with double newlines
    return MessageContentExtractor.extractText(message, {
      filterSystemMetadata: false,  // Show all content in viewer
      includeToolUse: true,          // Show tool blocks
      joinWith: '\n\n'               // Join with double newlines
    });
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Dispose of the panel
   */
  public dispose() {
    ConversationViewer.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
