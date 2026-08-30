import { Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

interface ClientMessage {
  type: string;
  drawingId?: string;
  element?: unknown;
  elementId?: string;
}

export const setupWebSocket = (server: HTTPServer) => {
  const wss = new WebSocketServer({
    server,
    path: "/ws"
  });

  wss.on("connection", (socket) => {
    console.log("WebSocket client connected");

    socket.send(
      JSON.stringify({
        type: "connection:success"
      })
    );

    socket.on("message", (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString()) as ClientMessage;

        console.log("WebSocket message:", message);

        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        }
      } catch (error) {
        console.error("Invalid WebSocket message:", error);

        socket.send(
          JSON.stringify({
            type: "error",
            message: "Invalid WebSocket message"
          })
        );
      }
    });

    socket.on("close", () => {
      console.log("WebSocket client disconnected");
    });

    socket.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  console.log("WebSocket server initialized");
};
