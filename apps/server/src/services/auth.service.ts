import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import { generateToken } from "../lib/jwt.js";
import type { RegisterInput, LoginInput } from "../types/auth.js";

export const registerUser = async ({ email, password }: RegisterInput) => {
  const existingUser = await prisma.user.findUnique({
    where: {
      email
    }
  });

  if (existingUser) {
    throw new Error("USER_ALREADY_EXISTS");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash
    }
  });

  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt
  };
};

export const loginUser = async ({ email, password }: LoginInput) => {
  const user = await prisma.user.findUnique({
    where: {
      email
    }
  });

  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const token = generateToken(user.id);
  return {
    token,
    user: {
      id: user.id,
      email: user.email
    }
  };
};
