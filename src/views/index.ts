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
  const explorerTreeProvider = new FileExplorerTreeProvider(workspaceRoot);

  // Register the views
  const astView = vscode.window.createTreeView("jxscoutAstView", {
    treeDataProvider: analysisTreeProvider,
    showCollapseAll: true,
    canSelectMany: true,
  });

  const fileView = vscode.window.createTreeView("jxscoutFileView", {
    treeDataProvider: explorerTreeProvider,
    showCollapseAll: true,
  });

  // Initial titles
  astView.title = "Descriptors (File)";
  fileView.title = "File Explorer (Project)";

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
    fileView,
    editorChangeDisposable,
    scopeChangeDisposable
  );

  return {
    astView,
    fileView,
    analysisTreeProvider,
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
      analysisTreeProvider.setGroupData([], []);
      analysisTreeProvider.setState("success");
      return;
    }

    const matchGroupedData = buildMatchGroupedData(projectNodes);
    analysisTreeProvider.setGroupData(projectNodes, matchGroupedData);
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

function buildMatchGroupedData(fileGroupedNodes: ASTAnalyzerTreeNode[]): ASTAnalyzerTreeNode[] {
  const categoryMap = new Map<string, { matches: ASTAnalyzerTreeNode[]; totalCount: number }>();

  for (const fileNode of fileGroupedNodes) {
    const filePath = fileNode.description || fileNode.label || "";
    const fileName = fileNode.label || "unknown";
    for (const categoryNode of fileNode.children || []) {
      const rawLabel = categoryNode.label || "";
      const baseName = rawLabel.replace(/\s*\[\d+\]\s*$/, "");
      const countMatch = rawLabel.match(/\[(\d+)\]\s*$/);
      const fileCount = countMatch ? parseInt(countMatch[1], 10) : 0;

      if (!categoryMap.has(baseName)) {
        categoryMap.set(baseName, { matches: [], totalCount: 0 });
      }

      const entry = categoryMap.get(baseName)!;
      for (const match of categoryNode.children || []) {
        entry.matches.push({
          ...match,
          description: fileName,
          tooltip: filePath,
        });
      }
      entry.totalCount += fileCount;
    }
  }

  return Array.from(categoryMap.entries()).map(([name, entry]) => ({
    type: "navigation" as const,
    label: `${name} [${entry.totalCount}]`,
    children: entry.matches,
    iconName: "symbol-method",
  }));
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
