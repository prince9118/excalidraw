import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";

import { createDrawingSchema, updateDrawingSchema } from "../types/drawing.js";

import {
  createDrawing,
  getUserDrawings,
  getDrawing,
  updateDrawing,
  deleteDrawing
} from "../services/drawing.service.js";

export const create = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required"
      });
      return;
    }

    const result = createDrawingSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten().fieldErrors
      });
      return;
    }

    const drawing = await createDrawing(userId, result.data);

    res.status(201).json({
      success: true,
      data: drawing
    });
  } catch (error) {
    console.error("Create drawing error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const list = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required"
      });
      return;
    }

    const drawings = await getUserDrawings(userId);

    res.json({
      success: true,
      data: drawings
    });
  } catch (error) {
    console.error("List drawings error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const getOne = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required"
      });
      return;
    }

    const drawing = await getDrawing(userId, req.params.id as string);

    if (!drawing) {
      res.status(404).json({
        success: false,
        message: "Drawing not found"
      });
      return;
    }

    res.json({
      success: true,
      data: drawing
    });
  } catch (error) {
    console.error("Get drawing error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const update = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required"
      });
      return;
    }

    const result = updateDrawingSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten().fieldErrors
      });
      return;
    }

    const drawing = await updateDrawing(
      userId,
      req.params.id as string,
      result.data
    );

    res.json({
      success: true,
      data: drawing
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DRAWING_NOT_FOUND") {
      res.status(404).json({
        success: false,
        message: "Drawing not found"
      });
      return;
    }

    console.error("Update drawing error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const remove = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required"
      });
      return;
    }

    await deleteDrawing(userId, req.params.id as string);

    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === "DRAWING_NOT_FOUND") {
      res.status(404).json({
        success: false,
        message: "Drawing not found"
      });
      return;
    }

    console.error("Delete drawing error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
