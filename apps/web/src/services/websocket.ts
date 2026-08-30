export type WebSocketMessage = {
  type: string;
  drawingId?: string;
  element?: unknown;
  elementId?: string;
};

export class DrawingWebSocket {
  private socket: WebSocket | null = null;

  private listeners = new Set<(message: WebSocketMessage) => void>();

  connect() {
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

    const wsUrl = apiUrl.replace(/^http/, "ws").concat("/ws");

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log("WebSocket connected");
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
    this.socket?.close();
    this.socket = null;
  }
}
