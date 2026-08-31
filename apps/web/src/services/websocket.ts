export type WebSocketMessage =
  | {
      type: "connection:success";
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "drawing:join";
      drawingId: string;
    }
  | {
      type: "element:create";
      drawingId: string;
      element: unknown;
    }
  | {
      type: "element:update";
      drawingId: string;
      elementId: string;
      element?: unknown;
    }
  | {
      type: "element:delete";
      drawingId: string;
      elementId: string;
    };

export class DrawingWebSocket {
  private socket: WebSocket | null = null;

  private listeners = new Set<(message: WebSocketMessage) => void>();

  private pendingMessages: WebSocketMessage[] = [];

  connect() {
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

    const token = localStorage.getItem("token");

    const wsUrl = apiUrl.replace(/^http/, "ws").concat("/ws");

    const authenticatedUrl = token
      ? `${wsUrl}?token=${encodeURIComponent(token)}`
      : wsUrl;

    this.socket = new WebSocket(authenticatedUrl);

    this.socket.onopen = () => {
      console.log("WebSocket connected");

      for (const message of this.pendingMessages) {
        this.socket?.send(JSON.stringify(message));
      }

      this.pendingMessages = [];
    };

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;

        for (const listener of this.listeners) {
          listener(message);
        }
      } catch (error) {
        console.error("Invalid WebSocket message", error);
      }
    };

    this.socket.onclose = () => {
      console.log("WebSocket disconnected");

      this.socket = null;
    };

    this.socket.onerror = (error) => {
      console.error("WebSocket error", error);
    };
  }

  send(message: WebSocketMessage) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.pendingMessages.push(message);
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  subscribe(listener: (message: WebSocketMessage) => void) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  disconnect() {
    this.pendingMessages = [];

    this.socket?.close();

    this.socket = null;
  }
}
