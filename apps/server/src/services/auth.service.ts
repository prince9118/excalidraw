import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";

interface RegisterInput {
  email: string;
  password: string;
}

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
