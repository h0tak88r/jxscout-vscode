import * as vscode from "vscode";
import {
  ASTAnalyzerTreeNode,
  TreeItemOptions,
  TreeState,
  ViewScope,
  GroupMode,
  SortMode,
} from "../types";
import * as path from "path";

export class AstAnalysisTreeItem extends vscode.TreeItem {
  public readonly node: ASTAnalyzerTreeNode;

  constructor({
    label,
    collapsibleState,
    iconName,
    node,
    description,
    tooltip,
  }: TreeItemOptions) {
    super(label, collapsibleState);
    this.description = description || "";
    this.tooltip = tooltip;
    this.node = node;

    if (node.type === "match") {
      this.command = {
        command: "jxscout.navigateToMatch",
        title: "Navigate to match",
        arguments: [node.data],
      };
      this.contextValue = "match";
    }

    if (iconName) {
      if (iconName.startsWith("resources:")) {
        const iconPath = iconName.replace("resources:", "");

        const iconUri = path.join(
          __filename,
          "..",
          "..",
          "resources",
          "icons",
          `${iconPath}.svg`
        );
        this.iconPath = {
          light: vscode.Uri.file(iconUri),
          dark: vscode.Uri.file(iconUri),
        };
      } else {
        this.iconPath = new vscode.ThemeIcon(iconName);
      }
    }
  }
}

export class AstAnalysisTreeProvider
  implements vscode.TreeDataProvider<AstAnalysisTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    AstAnalysisTreeItem | undefined | null | void
  > = new vscode.EventEmitter<AstAnalysisTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    AstAnalysisTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private _onDidChangeScope: vscode.EventEmitter<ViewScope> =
    new vscode.EventEmitter<ViewScope>();
  readonly onDidChangeScope: vscode.Event<ViewScope> =
    this._onDidChangeScope.event;

  private _onDidChangeGroupMode: vscode.EventEmitter<GroupMode> =
    new vscode.EventEmitter<GroupMode>();
  readonly onDidChangeGroupMode: vscode.Event<GroupMode> =
    this._onDidChangeGroupMode.event;

  private _scope: ViewScope = "file";
  private _groupMode: GroupMode = "file";
  private _fileGroupedData?: ASTAnalyzerTreeNode[];
  private _matchGroupedData?: ASTAnalyzerTreeNode[];
  private _analysisData?: ASTAnalyzerTreeNode[];
  private _state: TreeState = "empty";
  private _sortMode: SortMode = "occurrence";

  getScope(): ViewScope {
    return this._scope;
  }

  getSortMode(): SortMode {
    return this._sortMode;
  }

  setSortMode(mode: SortMode) {
    this._sortMode = mode;
    this.refresh();
  }

  setScope(scope: ViewScope) {
    this._scope = scope;
    this._onDidChangeScope.fire(scope);
    this.refresh();
  }

  getGroupMode(): GroupMode {
    return this._groupMode;
  }

  setGroupMode(mode: GroupMode) {
    this._groupMode = mode;
    this._applyGroupMode();
    this._onDidChangeGroupMode.fire(mode);
  }

  setGroupData(fileGrouped: ASTAnalyzerTreeNode[], matchGrouped: ASTAnalyzerTreeNode[]) {
    this._fileGroupedData = fileGrouped;
    this._matchGroupedData = matchGrouped;
    this._applyGroupMode();
  }

  private _applyGroupMode() {
    this._analysisData =
      this._groupMode === "file" ? this._fileGroupedData : this._matchGroupedData;
    this.refresh();
  }

  setState(state: TreeState) {
    this._state = state;
    if (state !== "success") {
      this._analysisData = undefined;
    }
    this.refresh();
  }

  setAnalysisData(data: ASTAnalyzerTreeNode[] | undefined) {
    this._analysisData = data;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AstAnalysisTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AstAnalysisTreeItem): Thenable<AstAnalysisTreeItem[]> {
    if (this._state === "empty") {
      return Promise.resolve([
        new AstAnalysisTreeItem({
          label: "Select a file tracked by jxscout.",
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          iconName: "info",
          node: {
            type: "navigation",
            label: "Select a file tracked by jxscout.",
          },
        }),
      ]);
    }

    if (this._state === "loading") {
      return Promise.resolve([
        new AstAnalysisTreeItem({
          label: "Loading analysis...",
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          iconName: "loading~spin",
          node: {
            type: "navigation",
            label: "Loading analysis...",
          },
        }),
      ]);
    }

    if (this._state === "asset-not-found") {
      return Promise.resolve([
        new AstAnalysisTreeItem({
          label:
            "This file is not tracked by the current project or is not supported by jxscout",
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          iconName: "info",
          node: {
            type: "navigation",
            label:
              "This file is not tracked by the current project or is not supported by jxscout",
          },
        }),
      ]);
    }

    if (!this._analysisData?.length) {
      return Promise.resolve([
        new AstAnalysisTreeItem({
          label: "No descriptors found",
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          iconName: "info",
          node: {
            type: "navigation",
            label: "No descriptors found",
          },
        }),
      ]);
    }

    if (!element) {
      const sortedNodes =
        this._sortMode === "alphabetical"
          ? [...this._analysisData].sort(
              (a: ASTAnalyzerTreeNode, b: ASTAnalyzerTreeNode) =>
                (a.label || "").localeCompare(b.label || "")
            )
          : this._analysisData;

      return Promise.resolve(
        sortedNodes.map(
          (node: ASTAnalyzerTreeNode) =>
            new AstAnalysisTreeItem({
              label: node.label || "Root",
              collapsibleState: node.children?.length
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None,
              iconName: node.iconName,
              node: node,
              description: node.description,
            })
        )
      );
    }

    if (element.node.children) {
      const sortedChildren =
        this._sortMode === "alphabetical"
          ? [...element.node.children].sort(
              (a: ASTAnalyzerTreeNode, b: ASTAnalyzerTreeNode) =>
                (a.label || "").localeCompare(b.label || "")
            )
          : element.node.children;

      return Promise.resolve(
        sortedChildren.map(
          (child: ASTAnalyzerTreeNode) =>
            new AstAnalysisTreeItem({
              label: child.label || "Node",
              collapsibleState: child.children?.length
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None,
              iconName: child.iconName,
              node: child,
              description: child.description,
            })
        )
      );
    }

    return Promise.resolve([]);
  }
}
