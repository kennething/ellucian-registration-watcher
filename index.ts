import { startServer } from "./server/app";
import { startBot } from "./bot/src/index";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

if (process.env.DISCORD_TOKEN) startBot();
startServer();
