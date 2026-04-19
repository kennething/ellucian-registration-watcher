import { startServer } from "./server/app";
import { startBot } from "./bot/src/index";

if (process.env.DISCORD_TOKEN) startBot();
startServer();
