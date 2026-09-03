import { Log } from "../../../server/utils/log.ts";
import { API } from "@discordjs/core/http-only";
import { loadCommands } from "./loaders.ts";
import { REST } from "discord.js";
import ENV from "../../../env.ts";
import { URL } from "node:url";

if (!ENV.DISCORD_TOKEN || !ENV.APPLICATION_ID) {
  Log.error("DISCORD_TOKEN and APPLICATION_ID must be set in the environment variables.");
  process.exit(1);
}

const commands = await loadCommands(new URL("../commands/", import.meta.url));
const commandData = [...commands.values()].map((command) => command.data);

const rest = new REST({ version: "10" }).setToken(ENV.DISCORD_TOKEN);
const api = new API(rest);

const result = await api.applicationCommands.bulkOverwriteGlobalCommands(ENV.APPLICATION_ID, commandData);

Log.info(`Successfully registered ${result.length} commands.`);
