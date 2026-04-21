import express, { Router } from "express";
import { Cookie } from "./utils/cookie";
import * as loops from "./utils/loops";
import { pathToFileURL } from "url";
import cors from "cors";
import path from "path";
import fs from "fs";

export async function startServer() {
  const app = express();
  app.use(cors()).use(express.json());

  const projectRoot = process.cwd();
  const routesDir = path.join(projectRoot, "server", "routes");
  fs.readdirSync(routesDir).forEach(async (file) => {
    if (!file.endsWith(".ts")) return;

    const routePath = path.join(routesDir, file);
    const router = (await import(pathToFileURL(routePath).href)).default as Router;
    app.use("/", router);
  });

  const port = Number(process.env.PORT) || 6969;
  app.listen(port, "0.0.0.0", () => console.log(`Server is up on port ${port}`));

  await Cookie.refreshCookie();

  loops.watchClassesLoop();
  loops.purgeWatchersLoop();
}
