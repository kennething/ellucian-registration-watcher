import { startServer } from "./server/app";
import { startBot } from "./bot/src/index";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, ".env") });

(function main() {
  try {
    if (process.env.DISCORD_TOKEN) startBot();
    startServer();
  } catch (error) {
    console.error("error in index.ts: ", error);
  }
})();
