"use strict";
/**
 * Test script to investigate Claude Code command capabilities
 *
 * This script tests if Claude Code commands can be invoked with parameters
 * to open specific conversations.
 */
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
exports.testClaudeCodeCommands = testClaudeCodeCommands;
const vscode = __importStar(require("vscode"));
async function testClaudeCodeCommands() {
    const outputChannel = vscode.window.createOutputChannel('Claude Code Command Test');
    outputChannel.show();
    // Test 1: List all available commands
    outputChannel.appendLine('=== Test 1: Available Commands ===');
    const commands = await vscode.commands.getCommands(true);
    const claudeCommands = commands.filter(cmd => cmd.includes('claude'));
    claudeCommands.forEach(cmd => {
        outputChannel.appendLine(`  - ${cmd}`);
    });
    // Test 2: Try to execute claude-vscode.editor.open with no args
    outputChannel.appendLine('\n=== Test 2: Execute claude-vscode.editor.open (no args) ===');
    try {
        await vscode.commands.executeCommand('claude-vscode.editor.open');
        outputChannel.appendLine('  ✓ Command executed successfully');
    }
    catch (error) {
        outputChannel.appendLine(`  ✗ Error: ${error}`);
    }
    // Test 3: Try to execute claude-vscode.editor.open with conversation ID
    outputChannel.appendLine('\n=== Test 3: Execute claude-vscode.editor.open with UUID ===');
    try {
        // Example UUID from a conversation file
        const testUuid = '12345678-1234-1234-1234-123456789abc';
        await vscode.commands.executeCommand('claude-vscode.editor.open', testUuid);
        outputChannel.appendLine('  ✓ Command accepted UUID argument');
    }
    catch (error) {
        outputChannel.appendLine(`  ✗ Error: ${error}`);
    }
    // Test 4: Try to execute claude-vscode.editor.open with file path
    outputChannel.appendLine('\n=== Test 4: Execute claude-vscode.editor.open with file path ===');
    try {
        const testPath = 'C:/Users/Test/.claude/projects/test/conversations/test.jsonl';
        await vscode.commands.executeCommand('claude-vscode.editor.open', testPath);
        outputChannel.appendLine('  ✓ Command accepted file path argument');
    }
    catch (error) {
        outputChannel.appendLine(`  ✗ Error: ${error}`);
    }
    // Test 5: Try claude-vscode.editor.openLast
    outputChannel.appendLine('\n=== Test 5: Execute claude-vscode.editor.openLast ===');
    try {
        await vscode.commands.executeCommand('claude-vscode.editor.openLast');
        outputChannel.appendLine('  ✓ openLast executed successfully');
    }
    catch (error) {
        outputChannel.appendLine(`  ✗ Error: ${error}`);
    }
    // Test 6: Check for URI handlers
    outputChannel.appendLine('\n=== Test 6: URI Handler Test ===');
    try {
        // Try opening with claude:// URI scheme
        const testUri = vscode.Uri.parse('claude://conversation/12345678-1234-1234-1234-123456789abc');
        await vscode.commands.executeCommand('vscode.open', testUri);
        outputChannel.appendLine('  ✓ URI handler test completed');
    }
    catch (error) {
        outputChannel.appendLine(`  ✗ Error: ${error}`);
    }
    outputChannel.appendLine('\n=== Tests Complete ===');
}
//# sourceMappingURL=test-claude-commands.js.map