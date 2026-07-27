import { API } from "@discordjs/core/http-only";
import process from "node:process";
import { REST } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);
const api = new API(rest);

const commands = await api.applicationCommands.getGlobalCommands(process.env.APPLICATION_ID!);
for (const command of commands) await api.applicationCommands.deleteGlobalCommand(process.env.APPLICATION_ID!, command.id);

console.log(`Successfully deleted ${commands.length} commands.`);
