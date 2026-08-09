import express, { Router } from "express";
import cookieParser from "cookie-parser";
import { Cookie } from "./utils/cookie";
import * as loops from "./utils/loops";
import { pathToFileURL } from "url";
import ENV from "../env";
import cors from "cors";
import path from "path";
import fs from "fs";

export async function startServer() {
  const app = express()
    .use(cors({ origin: ENV.FRONTEND_URL, optionsSuccessStatus: 200, credentials: true }))
    .use(cookieParser())
    .use(express.json());

  const projectRoot = process.cwd();
  const routesDir = path.join(projectRoot, "server", "routes");
  fs.readdirSync(routesDir).forEach(async (file) => {
    if (!file.endsWith(".ts")) return;

    const routePath = path.join(routesDir, file);
    const router = (await import(pathToFileURL(routePath).href)).default as Router;
    app.use("/", router);
  });

  await Cookie.refreshCookie();

  app.listen(ENV.PORT, "0.0.0.0", () => console.log(`Server is up on port ${ENV.PORT}`));

  if (ENV.CLASS_FETCH_INTERVAL > 0) loops.watchClassesLoop();
  if (ENV.WATCHER_PURGE_INTERVAL > 0) loops.purgeWatchersLoop();
  if (ENV.RMP_FETCH_INTERVAL > 0 && ENV.RMP_SCHOOL_ID) loops.fetchProfessorsLoop();
  if (ENV.MATH_FETCH_INTERVAL > 0 && ENV.MATH_SCHEDULE_URL) loops.fetchMathScheduleLoop();
}
