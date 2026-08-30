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
    throw new Error("user already exist");
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
    throw new Error("invalid credentials");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new Error("invalid creds");
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
