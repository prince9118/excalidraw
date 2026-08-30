import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import type {
  CreateDrawingInput,
  UpdateDrawingInput
} from "../types/drawing.js";

export const createDrawing = async (
  userId: string,
  input: CreateDrawingInput
) => {
  return prisma.drawing.create({
    data: {
      userId,
      name: input.name ?? "Untitled",
      elements: input.elements as Prisma.InputJsonValue
    }
  });
};

export const getUserDrawings = async (userId: string) => {
  return prisma.drawing.findMany({
    where: {
      userId
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true
    }
  });
};

export const getDrawing = async (userId: string, drawingId: string) => {
  return prisma.drawing.findFirst({
    where: {
      id: drawingId,
      userId
    }
  });
};

export const updateDrawing = async (
  userId: string,
  drawingId: string,
  input: UpdateDrawingInput
) => {
  // First make sure this drawing belongs to the user
  const drawing = await prisma.drawing.findFirst({
    where: {
      id: drawingId,
      userId
    }
  });

  if (!drawing) {
    throw new Error("DRAWING_NOT_FOUND");
  }

  return prisma.drawing.update({
    where: {
      id: drawingId
    },
    data: {
      ...(input.name !== undefined && {
        name: input.name
      }),

      ...(input.elements !== undefined && {
        elements: input.elements as Prisma.InputJsonValue
      })
    }
  });
};

export const deleteDrawing = async (userId: string, drawingId: string) => {
  const drawing = await prisma.drawing.findFirst({
    where: {
      id: drawingId,
      userId
    }
  });

  if (!drawing) {
    throw new Error("DRAWING_NOT_FOUND");
  }

  await prisma.drawing.delete({
    where: {
      id: drawingId
    }
  });
};
