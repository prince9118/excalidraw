import jwt from "jsonwebtoken";

interface JwtPayload {
  userId: string;
}

export function authenticateWebSocket(token: string): string | null {
  try {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT_SECRET is not configured");
    }

    const payload = jwt.verify(token, secret) as JwtPayload;

    return payload.userId;
  } catch {
    return null;
  }
}
