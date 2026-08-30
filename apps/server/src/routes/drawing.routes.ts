import { Router } from "express";

import {
  create,
  list,
  getOne,
  update,
  remove
} from "../controllers/drawing.controller.js";

import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth);

router.post("/", create);

router.get("/", list);

router.get("/:id", getOne);

router.patch("/:id", update);

router.delete("/:id", remove);

export default router;
