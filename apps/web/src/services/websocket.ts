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
    }
  | {
      type: "elements:replace";
      drawingId: string;
      elements: unknown[];
    };

// Close code the server uses for auth failures; retrying won't help.
const POLICY_VIOLATION = 1008;

const RECONNECT_DELAY_MS = 2000;

export class DrawingWebSocket {
  private socket: WebSocket | null = null;

  private listeners = new Set<(message: WebSocketMessage) => void>();

  private pendingMessages: WebSocketMessage[] = [];

  // Re-sent after every reconnect so the server puts us back in the room.
  private joinMessage: WebSocketMessage | null = null;

  private reconnectTimeout: number | null = null;

  private closedByClient = false;

  connect() {
    this.closedByClient = false;

    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

    const token = localStorage.getItem("token");

    const wsUrl = apiUrl.replace(/^http/, "ws").concat("/ws");

    const authenticatedUrl = token
      ? `${wsUrl}?token=${encodeURIComponent(token)}`
      : wsUrl;

    const socket = new WebSocket(authenticatedUrl);

    this.socket = socket;

    socket.onopen = () => {
      if (this.joinMessage) {
        socket.send(JSON.stringify(this.joinMessage));
      }

      for (const message of this.pendingMessages) {
        socket.send(JSON.stringify(message));
      }

      this.pendingMessages = [];
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;

        for (const listener of this.listeners) {
          listener(message);
        }
      } catch (error) {
        console.error("Invalid WebSocket message", error);
      }
    };

    socket.onclose = (event) => {
      if (this.socket === socket) {
        this.socket = null;
      }

      if (this.closedByClient || event.code === POLICY_VIOLATION) {
        return;
      }

      this.reconnectTimeout = window.setTimeout(() => {
        this.reconnectTimeout = null;
        this.connect();
      }, RECONNECT_DELAY_MS);
    };

    socket.onerror = (error) => {
      console.error("WebSocket error", error);
    };
  }

  send(message: WebSocketMessage) {
    if (message.type === "drawing:join") {
      this.joinMessage = message;
    }

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      // The join is replayed on open, so don't queue it twice.
      if (message.type !== "drawing:join") {
        this.pendingMessages.push(message);
      }

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
    this.closedByClient = true;

    if (this.reconnectTimeout !== null) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.pendingMessages = [];

    this.joinMessage = null;

    this.socket?.close();

    this.socket = null;
  }
}
