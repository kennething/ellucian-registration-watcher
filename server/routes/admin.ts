import { Router } from "express";
import path from "path";

const router = Router();

router.get("/admin/get-db/:password", async (req, res) => {
  const password = decodeURIComponent(req.params.password);
  if (password !== process.env.ADMIN_PASSWORD) return res.sendStatus(404);

  console.log(process.cwd());
  res.sendFile("prod.sqlite3", { root: path.join(process.cwd(), "server") });
});

export default router;
