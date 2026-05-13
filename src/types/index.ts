import * as vscode from "vscode";

export interface Position {
  column: number;
  line: number;
}

export interface AnalyzerMatch {
  filePath: string;
  analyzerName: string;
  value: string;
  start: Position;
  end: Position;
}

type ASTAnalyzerTreeNodeType = "navigation" | "match";

export interface ASTAnalyzerTreeNode {
  id?: string;
  type: ASTAnalyzerTreeNodeType;
  data?: any;
  label?: string;
  description?: string;
  iconName?: string;
  tooltip?: string;
  children?: ASTAnalyzerTreeNode[];
}

export interface AnalysisResult {
  filePath: string;
  results: ASTAnalyzerTreeNode[];
}

export type ViewScope = "project" | "file";
export type GroupMode = "file" | "matchType";
export type SortMode = "alphabetical" | "occurrence";
export type TreeState = "loading" | "asset-not-found" | "success" | "empty";

export interface TreeItemOptions {
  label: string;
  collapsibleState: vscode.TreeItemCollapsibleState;
  iconName?: string;
  node: ASTAnalyzerTreeNode;
  description?: string;
  tooltip?: string;
}
