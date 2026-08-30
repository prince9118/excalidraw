import { z } from "zod";

export const createDrawingSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name is too long")
    .optional(),

  elements: z.array(z.record(z.string(), z.unknown()))
});

export const updateDrawingSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),

  elements: z.array(z.record(z.string(), z.unknown())).optional()
});

export type CreateDrawingInput = z.infer<typeof createDrawingSchema>;

export type UpdateDrawingInput = z.infer<typeof updateDrawingSchema>;
