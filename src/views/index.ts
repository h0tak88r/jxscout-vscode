import * as vscode from "vscode";
import * as path from "path";
import {
  AstAnalysisTreeProvider,
} from "../providers/ast-analysis-tree-provider";
import { FileExplorerTreeProvider } from "../providers/file-explorer-tree-provider";
import { WebSocketClient } from "../services/websocket-client";
import { ASTAnalyzerTreeNode } from "../types";

export function createViews(
  context: vscode.ExtensionContext,
  workspaceRoot: string | undefined,
  wsClient: WebSocketClient
) {
  const analysisTreeProvider = new AstAnalysisTreeProvider();
  const workspaceTreeProvider = new AstAnalysisTreeProvider();
  const explorerTreeProvider = new FileExplorerTreeProvider(workspaceRoot);

  // Register the views
  const astView = vscode.window.createTreeView("jxscoutAstView", {
    treeDataProvider: analysisTreeProvider,
    showCollapseAll: true,
    canSelectMany: true,
  });

  const workspaceView = vscode.window.createTreeView("jxscoutWorkspaceView", {
    treeDataProvider: workspaceTreeProvider,
    showCollapseAll: true,
    canSelectMany: true,
  });

  const fileView = vscode.window.createTreeView("jxscoutFileView", {
    treeDataProvider: explorerTreeProvider,
    showCollapseAll: true,
  });

  // Initial titles
  astView.title = "Descriptors (File)";
  workspaceView.title = "Workspace Matchers";
  fileView.title = "File Explorer (Project)";

  workspaceTreeProvider.setState("loading");

  // Register active editor change handler
  const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(
    async (editor) => {
      if (analysisTreeProvider.getScope() === "file") {
        await updateASTAnalysis(editor, analysisTreeProvider, wsClient);
      }
    }
  );

  // Register scope change handler
  const scopeChangeDisposable = analysisTreeProvider.onDidChangeScope(
    async (scope) => {
      if (scope === "project") {
        await loadProjectAnalysis(analysisTreeProvider, wsClient);
      } else {
        const activeEditor = vscode.window.activeTextEditor;
        await updateASTAnalysis(activeEditor, analysisTreeProvider, wsClient);
      }
    }
  );

  context.subscriptions.push(
    astView,
    workspaceView,
    fileView,
    editorChangeDisposable,
    scopeChangeDisposable
  );

  return {
    astView,
    workspaceView,
    fileView,
    analysisTreeProvider,
    workspaceTreeProvider,
    explorerTreeProvider,
  };
}

export async function updateASTAnalysis(
  editor: vscode.TextEditor | undefined,
  analysisTreeProvider: AstAnalysisTreeProvider,
  wsClient: WebSocketClient
) {
  if (!editor) {
    analysisTreeProvider.setState("empty");
    return;
  }

  const document = editor.document;
  if (!document) {
    analysisTreeProvider.setState("empty");
    return;
  }

  analysisTreeProvider.setState("loading");

  try {
    const analysis = await wsClient.getAnalysis(document.uri.fsPath);
    analysisTreeProvider.setAnalysisData(analysis.results);
    analysisTreeProvider.setState("success");
  } catch (error: any) {
    if (error?.message?.includes("asset not found")) {
      analysisTreeProvider.setState("asset-not-found");
    } else {
      vscode.window.showErrorMessage(
        `Failed to get descriptors: ${error.message}`
      );
      analysisTreeProvider.setState("empty");
    }
  }
}

export async function loadProjectAnalysis(
  analysisTreeProvider: AstAnalysisTreeProvider,
  wsClient: WebSocketClient
) {
  console.log("loadProjectAnalysis: starting");
  analysisTreeProvider.setState("loading");

  try {
    console.log("loadProjectAnalysis: calling findFiles");
    let files: vscode.Uri[];
    try {
      files = await vscode.workspace.findFiles(
        "**/*.{js,jsx,ts,tsx,html}",
        "**/{node_modules,.git,dist,build,out}/**"
      );
      console.log(`loadProjectAnalysis: findFiles returned ${files.length} files`);
    } catch (findErr: any) {
      console.error("loadProjectAnalysis: findFiles threw:", findErr);
      analysisTreeProvider.setAnalysisData([]);
      analysisTreeProvider.setState("success");
      return;
    }

    if (files.length === 0) {
      console.log("loadProjectAnalysis: no files found");
      analysisTreeProvider.setAnalysisData([]);
      analysisTreeProvider.setState("success");
      return;
    }

    const projectNodes: ASTAnalyzerTreeNode[] = [];
    const batchSize = 10;
    const totalFiles = files.length;

    console.log("loadProjectAnalysis: starting withProgress, totalFiles=" + totalFiles);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Loading project descriptors",
        cancellable: false,
      },
      async (progress) => {
        for (let i = 0; i < totalFiles; i += batchSize) {
          const batch = files.slice(i, i + batchSize);
          console.log(`loadProjectAnalysis: batch ${i}-${Math.min(i+batchSize, totalFiles)}/${totalFiles}`);
          const results = await Promise.allSettled(
            batch.map(async (file) => {
              const analysis = await wsClient.getAnalysis(file.fsPath);
              return { analysis, fsPath: file.fsPath };
            })
          );

          results.forEach((result) => {
            if (result.status === "fulfilled") {
              try {
                const { analysis, fsPath } = result.value;
                if (analysis.results?.length) {
                  const filePath = analysis.filePath || fsPath;
                  const fileName = path.basename(filePath);
                  projectNodes.push({
                    type: "navigation",
                    label: fileName,
                    description: filePath,
                    tooltip: filePath,
                    iconName: getFileIcon(fileName),
                    children: injectFilePath(analysis.results, filePath),
                  });
                }
              } catch (innerErr: any) {
                console.error("loadProjectAnalysis: skipping file due to:", innerErr);
              }
            }
          });

          const increment = (batch.length / totalFiles) * 100;
          progress.report({
            increment,
            message: `${Math.min(i + batch.length, totalFiles)}/${totalFiles} files`,
          });
        }
      }
    );

    console.log(`loadProjectAnalysis: built ${projectNodes.length} project nodes`);
    if (projectNodes.length === 0) {
      analysisTreeProvider.setAnalysisData([]);
      analysisTreeProvider.setState("success");
      return;
    }

    analysisTreeProvider.setAnalysisData(projectNodes);
    analysisTreeProvider.setState("success");
    console.log("loadProjectAnalysis: completed successfully");
  } catch (error: any) {
    console.error("loadProjectAnalysis: UNHANDLED error:", error);
    vscode.window.showErrorMessage(
      `Failed to load project descriptors: ${error.message}`
    );
    analysisTreeProvider.setState("empty");
  }
}

function injectFilePath(
  nodes: ASTAnalyzerTreeNode[],
  filePath: string
): ASTAnalyzerTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    data:
      node.type === "match"
        ? { ...(node.data || {}), filePath }
        : node.data,
    children: node.children
      ? injectFilePath(node.children, filePath)
      : undefined,
  }));
}

function getFileIcon(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".js":
    case ".jsx":
      return "javascript";
    case ".ts":
    case ".tsx":
      return "typescript";
    case ".json":
      return "json";
    case ".html":
      return "html";
    case ".css":
      return "css";
    case ".md":
      return "markdown";
    default:
      return "file-code";
  }
}
