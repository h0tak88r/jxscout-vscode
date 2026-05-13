import * as vscode from "vscode";
import { AstAnalysisTreeProvider } from "../providers/ast-analysis-tree-provider";
import { FileExplorerTreeProvider } from "../providers/file-explorer-tree-provider";
import { ViewScope, GroupMode } from "../types";

export function registerCommands(
  context: vscode.ExtensionContext,
  analysisTreeProvider: AstAnalysisTreeProvider,
  explorerTreeProvider: FileExplorerTreeProvider | null,
  astView: vscode.TreeView<any>,
  fileView: vscode.TreeView<any> | null
) {
  // Set initial scope context
  vscode.commands.executeCommand("setContext", "scope", "file");

  // Toggle scope command
  const toggleScopeDisposable = vscode.commands.registerCommand(
    "jxscout.toggleScope",
    () => {
      const newScope =
        analysisTreeProvider.getScope() === "project" ? "file" : "project";

      vscode.commands.executeCommand("setContext", "scope", newScope);
      analysisTreeProvider.setScope(newScope);
      if (explorerTreeProvider) {
        explorerTreeProvider.setScope(newScope);
      }
      updateViewTitles(newScope);
      analysisTreeProvider.refresh();
      if (explorerTreeProvider) {
        explorerTreeProvider.refresh();
      }
    }
  );

  // Toggle sort mode command
  const toggleSortModeDisposable = vscode.commands.registerCommand(
    "jxscout.toggleSortMode",
    () => {
      const newSortMode =
        analysisTreeProvider.getSortMode() === "alphabetical"
          ? "occurrence"
          : "alphabetical";
      analysisTreeProvider.setSortMode(newSortMode);
      astView.title = `Descriptors (${analysisTreeProvider.getScope()}) - ${
        newSortMode === "alphabetical" ? "A-Z" : "By Occurrence"
      }`;
    }
  );

  // Toggle group mode command
  const toggleGroupModeDisposable = vscode.commands.registerCommand(
    "jxscout.toggleGroupMode",
    () => {
      const newMode: GroupMode =
        analysisTreeProvider.getGroupMode() === "file"
          ? "matchType"
          : "file";
      analysisTreeProvider.setGroupMode(newMode);
      astView.title = `Descriptors (${analysisTreeProvider.getScope()}) - ${
        newMode === "file" ? "By File" : "By Match"
      }`;
    }
  );

  // Navigate to match command
  const navigateToMatchDisposable = vscode.commands.registerCommand(
    "jxscout.navigateToMatch",
    async (data: any) => {
      let editor = vscode.window.activeTextEditor;

      if (data.filePath) {
        if (!editor || editor.document.uri.fsPath !== data.filePath) {
          try {
            const doc = await vscode.workspace.openTextDocument(data.filePath);
            editor = await vscode.window.showTextDocument(doc);
          } catch (err) {
            vscode.window.showErrorMessage(
              `Failed to open file: ${data.filePath}`
            );
            return;
          }
        }
      }

      if (!editor) {
        return;
      }

      const startPosition = new vscode.Position(
        data.start.line - 1,
        data.start.column
      );
      const endPosition = new vscode.Position(
        data.end.line - 1,
        data.end.column
      );

      const range = new vscode.Range(startPosition, endPosition);
      editor.selection = new vscode.Selection(startPosition, endPosition);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }
  );

  // Copy values command
  const copyValuesDisposable = vscode.commands.registerCommand(
    "jxscout.copyValues",
    async () => {
      const selectedItems = astView.selection;
      if (!selectedItems || selectedItems.length === 0) {
        return;
      }

      const values = selectedItems
        .filter((item: any) => item.node.type === "match")
        .map((item: any) => item.node.data.value);

      const uniqueValues = new Set(values);

      if (uniqueValues.size > 0) {
        await vscode.env.clipboard.writeText([...uniqueValues].join("\n"));
        vscode.window.showInformationMessage(
          `Copied ${uniqueValues.size} values to clipboard`
        );
      }
    }
  );

  // Copy paths for bruteforcing
  const copyPathsDisposable = vscode.commands.registerCommand(
    "jxscout.copyPaths",
    async () => {
      const selectedItems = astView.selection;
      if (!selectedItems || selectedItems.length === 0) {
        return;
      }

      const values = selectedItems
        .filter((item: any) => item.node.type === "match")
        .filter(
          (item: any) => item.node.data.extra && item.node.data.extra.pathname
        )
        .map((item: any) => item.node.data.extra.pathname);

      const uniqueValues = new Set(values);

      if (uniqueValues.size > 0) {
        await vscode.env.clipboard.writeText([...uniqueValues].join("\n"));
        vscode.window.showInformationMessage(
          `Copied ${uniqueValues.size} values to clipboard`
        );
      } else {
        vscode.window.showInformationMessage("No paths found");
      }
    }
  );

  // Copy hostnames command
  const copyHostnamesDisposable = vscode.commands.registerCommand(
    "jxscout.copyHostnames",
    async () => {
      const selectedItems = astView.selection;
      if (!selectedItems || selectedItems.length === 0) {
        return;
      }

      const values = selectedItems
        .filter((item: any) => item.node.type === "match")
        .filter(
          (item: any) =>
            item.node.data.extra && item.node.data.extra.hostname
        )
        .map((item: any) => item.node.data.extra.hostname);

      const uniqueValues = new Set(values);

      if (uniqueValues.size > 0) {
        await vscode.env.clipboard.writeText([...uniqueValues].join("\n"));
        vscode.window.showInformationMessage(
          `Copied ${uniqueValues.size} values to clipboard`
        );
      } else {
        vscode.window.showInformationMessage("No hostnames found");
      }
    }
  );

  // Copy query params command
  const copyQueryParamsDisposable = vscode.commands.registerCommand(
    "jxscout.copyQueryParams",
    async () => {
      const selectedItems = astView.selection;
      if (!selectedItems || selectedItems.length === 0) {
        return;
      }

      const allQueryParams = new Set<string>();

      selectedItems
        .filter((item: any) => item.node.type === "match")
        .filter(
          (item: any) =>
            item.node.data.extra && item.node.data.extra["query-params"]
        )
        .map(
          (item: any) =>
            new URLSearchParams(item.node.data.extra["query-params"])
        )
        .forEach((params: URLSearchParams) => {
          for (const [key] of params.entries()) {
            allQueryParams.add(key);
          }
        });

      if (allQueryParams.size > 0) {
        await vscode.env.clipboard.writeText([...allQueryParams].join("\n"));
        vscode.window.showInformationMessage(
          `Copied ${allQueryParams.size} query params to clipboard`
        );
      } else {
        vscode.window.showInformationMessage("No query params found");
      }
    }
  );

  context.subscriptions.push(
    toggleScopeDisposable,
    toggleSortModeDisposable,
    toggleGroupModeDisposable,
    navigateToMatchDisposable,
    copyValuesDisposable,
    copyPathsDisposable,
    copyHostnamesDisposable,
    copyQueryParamsDisposable
  );

  function updateViewTitles(scope: ViewScope) {
    astView.title = `Descriptors (${scope})`;
    if (fileView) {
      fileView.title = `File Explorer (${scope})`;
    }
  }
}
