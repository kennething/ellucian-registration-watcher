import { startServer } from "./server/app";
import { startBot } from "./bot/src/index";
import ENV from "./env";

if (ENV.DISCORD_TOKEN) await startBot();
startServer();
