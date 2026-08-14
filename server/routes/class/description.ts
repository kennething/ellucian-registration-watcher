import { fetchClassDescription, tryCatch } from "../../utils/fetch";
import { authController } from "../../controllers/auth";
import { Router } from "express";

const router = Router();

router.get("/:term/:crn", authController, async (req, res) => {
  const { term, crn } = req.params;
  if (!term || typeof term !== "string" || !crn || typeof crn !== "string") return res.status(400).json({ error: "Missing term or crn" });

  const [data, error] = tryCatch(() => fetchClassDescription(term, crn));
  if (error) {
    if (error.message === "Course description not found") return res.status(404).json({ error: "Course description not found" });
    return res.sendStatus(500);
  }

  return res.status(200).json({ description: await data });
});

export default router;
