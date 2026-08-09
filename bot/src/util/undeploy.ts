import { API } from "@discordjs/core/http-only";
import process from "node:process";
import { REST } from "discord.js";
import ENV from "../../../env.ts";

if (!ENV.DISCORD_TOKEN || !ENV.APPLICATION_ID) {
  console.error("DISCORD_TOKEN and APPLICATION_ID must be set in the environment variables.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(ENV.DISCORD_TOKEN);
const api = new API(rest);

const commands = await api.applicationCommands.getGlobalCommands(ENV.APPLICATION_ID);
for (const command of commands) await api.applicationCommands.deleteGlobalCommand(ENV.APPLICATION_ID, command.id);

console.log(`Successfully deleted ${commands.length} commands.`);
