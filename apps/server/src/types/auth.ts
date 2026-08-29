import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email("Invalid email address"),

  password: z.string().min(8, "Password must be at least 8 characters")
});

export type RegisterInput = z.infer<typeof registerSchema>;
