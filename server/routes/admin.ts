import { Router } from "express";

const router = Router();

router.get("/admin/get-db/:password", async (req, res) => {
  const password = decodeURIComponent(req.params.password);
  if (password !== process.env.ADMIN_PASSWORD) return res.sendStatus(404);

  res.sendFile("server/prod.sqlite3", { root: process.cwd() });
});

export default router;
