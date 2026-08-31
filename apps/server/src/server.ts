import http from "http";
import app from "./app.js";
import { setupWebSocket } from "./websocket/server.js";

const PORT = Number(process.env.PORT) || 4000;

const httpServer = http.createServer(app);

setupWebSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`HTTP server running on http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);
});
