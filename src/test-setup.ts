// Mock vscode module for all tests
jest.mock('vscode', () => ({
  workspace: {
    workspaceFolders: undefined
  },
  Uri: {
    file: (path: string) => ({ fsPath: path })
  },
  window: {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn()
  }
}), { virtual: true });
