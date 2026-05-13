import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ViewScope } from "../types";

export class FileExplorerTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly iconName?: string,
    public readonly resourceUri?: vscode.Uri
  ) {
    super(label, collapsibleState);
    if (iconName) {
      this.iconPath = new vscode.ThemeIcon(iconName);
    }
    if (resourceUri) {
      this.resourceUri = resourceUri;
    }
  }
}

export class FileExplorerTreeProvider
  implements vscode.TreeDataProvider<FileExplorerTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    FileExplorerTreeItem | undefined | null | void
  > = new vscode.EventEmitter<FileExplorerTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    FileExplorerTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private _scope: ViewScope = "file";
  private _workspaceRoot?: string;

  constructor(workspaceRoot?: string) {
    this._workspaceRoot = workspaceRoot;
  }

  getScope(): ViewScope {
    return this._scope;
  }

  setScope(scope: ViewScope) {
    this._scope = scope;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileExplorerTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: FileExplorerTreeItem
  ): Thenable<FileExplorerTreeItem[]> {
    if (!this._workspaceRoot) {
      return Promise.resolve([]);
    }

    if (!element) {
      return this.getProjectRootItems();
    }

    const fsPath = element.resourceUri?.fsPath;
    if (!fsPath || !fs.existsSync(fsPath) || !fs.statSync(fsPath).isDirectory()) {
      return Promise.resolve([]);
    }

    return this.getDirectoryItems(fsPath);
  }

  private getProjectRootItems(): Thenable<FileExplorerTreeItem[]> {
    if (!this._workspaceRoot) {
      return Promise.resolve([]);
    }

    return Promise.resolve(
      fs
        .readdirSync(this._workspaceRoot)
        .filter((name) => !name.startsWith("."))
        .map((name) => {
          const fullPath = path.join(this._workspaceRoot!, name);
          const isDirectory = fs.statSync(fullPath).isDirectory();
          return new FileExplorerTreeItem(
            name,
            isDirectory
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None,
            isDirectory ? "directory" : "file",
            isDirectory ? "folder" : this.getFileIcon(name),
            vscode.Uri.file(fullPath)
          );
        })
    );
  }

  private getDirectoryItems(
    dirPath?: string
  ): Thenable<FileExplorerTreeItem[]> {
    if (!dirPath) {
      return Promise.resolve([]);
    }

    return Promise.resolve(
      fs
        .readdirSync(dirPath)
        .filter((name) => !name.startsWith("."))
        .map((name) => {
          const fullPath = path.join(dirPath, name);
          const isDirectory = fs.statSync(fullPath).isDirectory();
          return new FileExplorerTreeItem(
            name,
            isDirectory
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None,
            isDirectory ? "directory" : "file",
            isDirectory ? "folder" : this.getFileIcon(name),
            vscode.Uri.file(fullPath)
          );
        })
    );
  }

  private getFileIcon(fileName: string): string {
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
        return "file";
    }
  }
}
