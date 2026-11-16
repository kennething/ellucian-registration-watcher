import { searchClassDb, tryCatch } from "~/utils/fetch";
import { authController } from "../../controllers/auth";
import { truncateClassData } from "~/utils/functions";
import { ClassSearchSchema } from "~/utils/types";
import { Router } from "express";

const router = Router();

/** /class/search?filters=&offset=&limit= */
router.get("/", authController, async (req, res) => {
  const [{ data: filters, error: parseError }, jsonError] = tryCatch(() => ClassSearchSchema.safeParse(JSON.parse(decodeURIComponent(req.query.filters as string))));
  if (parseError || jsonError) return res.status(400).json({ error: "Invalid request parameters" });

  const offset = parseInt(req.query.offset as string) || 0;
  const limit = parseInt(req.query.limit as string) || 20;
  if (limit > 499) return res.sendStatus(400);

  const results = await searchClassDb(filters.term, filters, offset, limit);
  const [classes, total] = results;

  return res.status(200).json({ classes: Array.from(truncateClassData(classes).values()), total });
});

export default router;
