import { Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket, type RawData } from "ws";

import { URL } from "url";

import { authenticateWebSocket } from "./auth.js";
import { prisma } from "../lib/prisma.js";

interface ClientMessage {
  type: string;
  drawingId?: string;
  element?: unknown;
  elementId?: string;
}

const RELAYED_TYPES = new Set([
  "element:create",
  "element:update",
  "element:delete",
  "elements:replace"
]);

export const setupWebSocket = (server: HTTPServer) => {
  const wss = new WebSocketServer({
    server,
    path: "/ws"
  });

  // drawingId -> sockets currently viewing that drawing
  const rooms = new Map<string, Set<WebSocket>>();

  const leaveRoom = (socket: WebSocket, drawingId: string | null) => {
    if (!drawingId) return;

    const room = rooms.get(drawingId);

    if (!room) return;

    room.delete(socket);

    if (room.size === 0) {
      rooms.delete(drawingId);
    }
  };

  const sendError = (socket: WebSocket, message: string) => {
    socket.send(
      JSON.stringify({
        type: "error",
        message
      })
    );
  };

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

    let joinedDrawingId: string | null = null;

    socket.send(
      JSON.stringify({
        type: "connection:success"
      })
    );

    const handleMessage = async (rawMessage: RawData) => {
      let message: ClientMessage;

      try {
        message = JSON.parse(rawMessage.toString()) as ClientMessage;
      } catch {
        sendError(socket, "Invalid message");

        return;
      }

      if (message.type === "drawing:join") {
        if (typeof message.drawingId !== "string") {
          sendError(socket, "drawingId is required");

          return;
        }

        try {
          const drawing = await prisma.drawing.findFirst({
            where: {
              id: message.drawingId,
              userId
            },
            select: {
              id: true
            }
          });

          if (!drawing) {
            sendError(socket, "Drawing not found");

            return;
          }
        } catch (error) {
          console.error("WebSocket join error:", error);

          sendError(socket, "Could not join drawing");

          return;
        }

        leaveRoom(socket, joinedDrawingId);

        joinedDrawingId = message.drawingId;

        let room = rooms.get(joinedDrawingId);

        if (!room) {
          room = new Set();
          rooms.set(joinedDrawingId, room);
        }

        room.add(socket);

        return;
      }

      if (!RELAYED_TYPES.has(message.type)) {
        sendError(socket, "Unknown message type");

        return;
      }

      if (!joinedDrawingId || message.drawingId !== joinedDrawingId) {
        sendError(socket, "Join the drawing before sending changes");

        return;
      }

      const payload = JSON.stringify(message);

      for (const client of rooms.get(joinedDrawingId) ?? []) {
        if (client !== socket && client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }
    };

    // Handle messages one at a time so edits sent right after
    // "drawing:join" aren't rejected while the join is still awaiting
    // the database.
    let messageQueue = Promise.resolve();

    socket.on("message", (rawMessage) => {
      messageQueue = messageQueue
        .then(() => handleMessage(rawMessage))
        .catch((error) => {
          console.error("WebSocket message error:", error);
        });
    });

    socket.on("close", () => {
      leaveRoom(socket, joinedDrawingId);
    });

    socket.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  console.log("WebSocket server initialized");
};
