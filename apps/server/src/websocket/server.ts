import { Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

import { URL } from "url";

import { authenticateWebSocket } from "./auth.js";

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

  wss.on("connection", (socket, request) => {
    const requestUrl = new URL(
      request.url || "",
      `http://${request.headers.host}`
    );

    const token = requestUrl.searchParams.get("token");

    if (!token) {
      socket.close(1008, "Authentication required");

      return;
    }

    const userId = authenticateWebSocket(token);

    if (!userId) {
      socket.close(1008, "Invalid token");

      return;
    }

    console.log(`WebSocket authenticated: ${userId}`);

    socket.send(
      JSON.stringify({
        type: "connection:success"
      })
    );

    socket.on("message", (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString()) as ClientMessage;

        console.log("WS message:", message);

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
            message: "Invalid message"
          })
        );
      }
    });

    socket.on("close", () => {
      console.log(`WebSocket disconnected: ${userId}`);
    });

    socket.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  console.log("WebSocket server initialized");
};
