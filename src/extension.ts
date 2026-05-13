import * as vscode from "vscode";
import { WebSocketClient } from "./services/websocket-client";
import { createViews, updateASTAnalysis } from "./views";
import { registerCommands } from "./commands";
import { VersionCheckService } from "./services/versionCheck";

export function activate(context: vscode.ExtensionContext) {
  // Initialize version check service
  const versionCheckService = VersionCheckService.getInstance();
  versionCheckService.start();
  context.subscriptions.push({
    dispose: () => {
      versionCheckService.stop();
    },
  });

  // Initialize WebSocket client
  const config = vscode.workspace.getConfiguration("jxscout");
  const host = config.get<string>("serverHost") || "localhost";
  const port = config.get<number>("serverPort") || 3333;
  const wsClient = new WebSocketClient(`ws://${host}:${port}/ws`);

  const connectionStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right
  );
  connectionStatusBarItem.text = "jxscout $(sync~spin)";
  connectionStatusBarItem.tooltip = "Connecting to jxscout server...";
  connectionStatusBarItem.show();

  // Create views and get providers
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const { astView, fileView, analysisTreeProvider, explorerTreeProvider } =
    createViews(context, workspaceRoot, wsClient);

  // Register commands
  registerCommands(
    context,
    analysisTreeProvider,
    explorerTreeProvider,
    astView,
    fileView
  );

  // Connect to WebSocket and load file-level data
  wsClient
    .connect()
    .then(() => {
      connectionStatusBarItem.text = "jxscout $(check)";
      connectionStatusBarItem.tooltip = "Connected to jxscout server";

      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && analysisTreeProvider.getScope() === "file") {
        updateASTAnalysis(activeEditor, analysisTreeProvider, wsClient);
      }
    })
    .catch((error) => {
      connectionStatusBarItem.text = "jxscout $(error)";
      connectionStatusBarItem.tooltip = `Failed to connect: ${error.message}`;
      vscode.window.showErrorMessage(
        `Failed to connect to jxscout server: ${error.message}`
      );
    });

  // Add status bar items to subscriptions
  context.subscriptions.push(connectionStatusBarItem);

  // Clean up WebSocket connection and providers on deactivation
  context.subscriptions.push({
    dispose: () => {
      wsClient.disconnect();
    },
  });
}

export function deactivate() {}
