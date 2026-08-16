import express, { Router, Express } from "express";
import * as events from "./events/index";
import cookieParser from "cookie-parser";
import { Cookie } from "./utils/cookie";
import ENV from "../env";
import cors from "cors";
import path from "path";
import fs from "fs";

async function registerRoutes(app: Express, dir: string, basePath: string = ""): Promise<void> {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) await registerRoutes(app, fullPath, `${basePath}/${file}`);
    if (!file.endsWith(".ts")) continue;

    const routeModule = await import(fullPath);
    const router: Router = routeModule.default ?? routeModule.router;
    if (!router) continue;

    let routeName = file.replace(/\.ts$/, "");
    if (routeName === "index") routeName = "";

    let routePath = `${basePath}/${routeName}`;
    routePath = routePath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    app.use(routePath, router);
  }
}

export async function startServer() {
  const app = express()
    .use(cors({ origin: ENV.FRONTEND_URL, optionsSuccessStatus: 200, credentials: true }))
    .use(cookieParser())
    .use(express.json());

  await Cookie.refreshCookie();

  const projectRoot = process.cwd();
  const routesDir = path.join(projectRoot, "server", "routes");
  await registerRoutes(app, routesDir);

  app.listen(ENV.PORT, "0.0.0.0", () => console.log(`Server is up on port ${ENV.PORT}`));

  if (ENV.CLASS_FETCH_INTERVAL > 0) events.watchClassesLoop();
  if (ENV.OUTDATED_PURGE_INTERVAL > 0) events.purgeOutdatedLoop();
  if (ENV.RMP_FETCH_INTERVAL > 0 && ENV.RMP_SCHOOL_ID) events.fetchProfessorsLoop();
  if (ENV.MATH_FETCH_INTERVAL > 0 && ENV.MATH_SCHEDULE_URL) events.fetchMathScheduleLoop();
  if (ENV.SEARCH_FETCH_INTERVAL > 0) events.fetchSearchData();
}
