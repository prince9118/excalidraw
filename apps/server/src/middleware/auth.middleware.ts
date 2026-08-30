import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt.js";

export interface AuthRequest extends Request {
  userId?: string;
}

export const requireAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      res.status(401).json({
        success: false,
        message: "Authentication required"
      });

      return;
    }

    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      res.status(401).json({
        success: false,
        message: "Invalid authorization header"
      });

      return;
    }

    const payload = verifyToken(token);

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("userId" in payload)
    ) {
      res.status(401).json({
        success: false,
        message: "Invalid token"
      });

      return;
    }

    req.userId = payload.userId as string;

    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
};
