"use strict";
// Debug utility to discover Claude Code's tab characteristics
// This can be added as a temporary command to extension.ts for research
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugActiveTab = debugActiveTab;
exports.startTabMonitoring = startTabMonitoring;
const vscode = __importStar(require("vscode"));
/**
 * Debug command to inspect active tab properties
 * Usage: Add to package.json commands and register in activate()
 *
 * Example registration:
 * ```
 * context.subscriptions.push(
 *   vscode.commands.registerCommand('claudeCodeConversationManager.debugTabInfo', debugActiveTab)
 * );
 * ```
 */
function debugActiveTab() {
    const tabGroups = vscode.window.tabGroups;
    const activeGroup = tabGroups.activeTabGroup;
    if (!activeGroup) {
        vscode.window.showInformationMessage('No active tab group');
        return;
    }
    const activeTab = activeGroup.activeTab;
    if (!activeTab) {
        vscode.window.showInformationMessage('No active tab');
        return;
    }
    // Collect tab information
    const info = [];
    info.push('=== ACTIVE TAB INFO ===');
    info.push(`Label: "${activeTab.label}"`);
    info.push(`Is Active: ${activeTab.isActive}`);
    info.push(`Is Dirty: ${activeTab.isDirty}`);
    info.push(`Is Pinned: ${activeTab.isPinned}`);
    info.push(`Is Preview: ${activeTab.isPreview}`);
    info.push('');
    // Inspect the input type
    const input = activeTab.input;
    info.push('=== INPUT INFO ===');
    if (input instanceof vscode.TabInputText) {
        info.push('Type: TabInputText (regular text file)');
        info.push(`URI: ${input.uri.toString()}`);
    }
    else if (input instanceof vscode.TabInputTextDiff) {
        info.push('Type: TabInputTextDiff (diff viewer)');
    }
    else if (input instanceof vscode.TabInputCustom) {
        info.push('Type: TabInputCustom (custom editor)');
        info.push(`URI: ${input.uri.toString()}`);
        info.push(`View Type: "${input.viewType}"`);
    }
    else if (input instanceof vscode.TabInputWebview) {
        info.push('Type: TabInputWebview (webview panel)');
        info.push(`View Type: "${input.viewType}"`);
    }
    else if (input instanceof vscode.TabInputNotebook) {
        info.push('Type: TabInputNotebook (notebook)');
        info.push(`URI: ${input.uri.toString()}`);
    }
    else if (input instanceof vscode.TabInputTerminal) {
        info.push('Type: TabInputTerminal (terminal)');
    }
    else {
        info.push('Type: Unknown');
        info.push(`Input: ${JSON.stringify(input, null, 2)}`);
    }
    info.push('');
    info.push('=== ALL TABS IN GROUP ===');
    activeGroup.tabs.forEach((tab, index) => {
        info.push(`${index + 1}. "${tab.label}" (${tab.isActive ? 'ACTIVE' : 'inactive'})`);
        if (tab.input instanceof vscode.TabInputWebview) {
            info.push(`   -> Webview: ${tab.input.viewType}`);
        }
        else if (tab.input instanceof vscode.TabInputCustom) {
            info.push(`   -> Custom: ${tab.input.viewType} | ${tab.input.uri.toString()}`);
        }
    });
    // Log to console
    const fullLog = info.join('\n');
    console.log('\n' + fullLog + '\n');
    // Show in output channel for easy viewing
    const outputChannel = vscode.window.createOutputChannel('Tab Debug Info');
    outputChannel.clear();
    outputChannel.appendLine(fullLog);
    outputChannel.show();
    vscode.window.showInformationMessage('Tab info logged to "Tab Debug Info" output channel');
}
/**
 * Monitor tab changes and log when Claude Code tabs are detected
 * This helps discover patterns without manual testing
 */
function startTabMonitoring(context) {
    const outputChannel = vscode.window.createOutputChannel('Claude Code Tab Monitor');
    outputChannel.appendLine('=== Monitoring for Claude Code tabs ===');
    outputChannel.appendLine('Looking for webviews or custom editors that might be Claude Code...\n');
    const disposable = vscode.window.tabGroups.onDidChangeTabs((event) => {
        // Check opened tabs
        event.opened.forEach(tab => {
            if (tab.input instanceof vscode.TabInputWebview) {
                outputChannel.appendLine(`[OPENED] Webview tab: "${tab.label}"`);
                outputChannel.appendLine(`  viewType: "${tab.input.viewType}"`);
                // Check if this looks like Claude Code
                if (tab.input.viewType.includes('claude') ||
                    tab.input.viewType.includes('anthropic') ||
                    tab.label.toLowerCase().includes('claude')) {
                    outputChannel.appendLine(`  ⚠️ POTENTIAL CLAUDE CODE TAB DETECTED!`);
                }
                outputChannel.appendLine('');
            }
            else if (tab.input instanceof vscode.TabInputCustom) {
                outputChannel.appendLine(`[OPENED] Custom tab: "${tab.label}"`);
                outputChannel.appendLine(`  viewType: "${tab.input.viewType}"`);
                outputChannel.appendLine(`  uri: ${tab.input.uri.toString()}`);
                if (tab.input.viewType.includes('claude') ||
                    tab.input.viewType.includes('anthropic') ||
                    tab.label.toLowerCase().includes('claude')) {
                    outputChannel.appendLine(`  ⚠️ POTENTIAL CLAUDE CODE TAB DETECTED!`);
                }
                outputChannel.appendLine('');
            }
        });
        // Check changed tabs (became active)
        event.changed.forEach(tab => {
            if (tab.isActive) {
                if (tab.input instanceof vscode.TabInputWebview) {
                    outputChannel.appendLine(`[ACTIVATED] Webview: "${tab.label}" | viewType: "${tab.input.viewType}"`);
                }
                else if (tab.input instanceof vscode.TabInputCustom) {
                    outputChannel.appendLine(`[ACTIVATED] Custom: "${tab.label}" | viewType: "${tab.input.viewType}"`);
                }
            }
        });
    });
    context.subscriptions.push(disposable);
    outputChannel.show();
    vscode.window.showInformationMessage('Tab monitoring started - check "Claude Code Tab Monitor" output');
}
//# sourceMappingURL=debug-tab-info.js.map