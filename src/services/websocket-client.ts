import * as vscode from "vscode";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { AnalysisResult, Position } from "../types";

enum MessageType {
  GetAnalysisRequest = "getAnalysisRequest",
  GetAnalysisResponse = "getAnalysisResponse",

  Error = "error",
}

export interface AnalyzerMatch {
  filePath: string;
  analyzerName: string;
  value: string;
  start: Position;
  end: Position;
}

export type WebsocketError = {
  message: string;
};

export type WebsocketMessage = {
  type: MessageType;
  id: string;
  payload: any;
  error?: WebsocketError;
};

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private messageCallbacks: Map<
    string,
    {
      resolve: (result: AnalysisResult) => void;
      reject: (error: Error) => void;
    }
  > = new Map();
  private analysisCache: Map<string, AnalysisResult> = new Map();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private readonly reconnectDelay = 5000; // 5 seconds
  private serverUrl: string;
  private readyPromise: Promise<void> | null = null;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  onReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = new Promise((resolve) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          resolve();
        } else {
          this.ws?.once("open", () => resolve());
        }
      });
    }
    return this.readyPromise;
  }

  updateServerUrl(newServerUrl: string): void {
    this.serverUrl = newServerUrl;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.on("open", () => {
          console.log("Connected to jxscout WebSocket server");
          resolve();
        });

        this.ws.on("message", (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        });

        this.ws.on("close", () => {
          console.log("WebSocket connection closed");
          this.scheduleReconnect();
        });

        this.ws.on("error", (error: Error) => {
          console.error("WebSocket error:", error);
          reject(error);
        });
      } catch (error) {
        console.error("Error creating WebSocket connection:", error);
        reject(error);
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      console.log("Attempting to reconnect...");
      this.connect().catch((error: Error) => {
        console.error("Reconnection failed:", error);
        this.scheduleReconnect();
      });
    }, this.reconnectDelay);
  }

  private handleMessage(message: WebsocketMessage) {
    const { type, id, payload, error } = message;

    switch (type) {
      case MessageType.GetAnalysisResponse:
        const callback = this.messageCallbacks.get(id);
        if (callback) {
          if (error) {
            callback.reject(new Error(error.message));
          } else {
            callback.resolve(payload);
          }
          this.messageCallbacks.delete(id);
        }
        break;
      case MessageType.Error:
        console.error("Server error:", error?.message);
        vscode.window.showErrorMessage(`jxscout error: ${error?.message}`);
        break;
      default:
        console.warn("Unknown message type:", type);
    }
  }

  async getAnalysis(filePath: string): Promise<AnalysisResult> {
    if (this.analysisCache.has(filePath)) {
      return Promise.resolve(this.analysisCache.get(filePath)!);
    }

    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket is not connected"));
        return;
      }

      const messageId = uuidv4();
      const message = {
        type: MessageType.GetAnalysisRequest,
        id: messageId,
        payload: {
          filePath: filePath,
        },
      };

      this.messageCallbacks.set(messageId, {
        resolve: (result: AnalysisResult) => {
          this.analysisCache.set(filePath, result);
          resolve(result);
        },
        reject,
      });
      this.ws.send(JSON.stringify(message));
    });
  }

  clearCache(): void {
    this.analysisCache.clear();
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}
