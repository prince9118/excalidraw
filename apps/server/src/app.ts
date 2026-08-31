import express from "express";
import cors from "cors";
import { prisma } from "./lib/prisma.js";
import authRoutes from "./routes/auth.routes.js";
import drawingRoutes from "./routes/drawing.routes.js";
const app = express();

// app.use(cors());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Server is running"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/drawings", drawingRoutes);

export default app;
