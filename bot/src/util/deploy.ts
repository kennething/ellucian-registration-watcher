import { API } from "@discordjs/core/http-only";
import { loadCommands } from "./loaders.ts";
import process from "node:process";
import { REST } from "discord.js";
import { URL } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const commands = await loadCommands(new URL("../commands/", import.meta.url));
const commandData = [...commands.values()].map((command) => command.data);

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);
const api = new API(rest);

const result = await api.applicationCommands.bulkOverwriteGlobalCommands(process.env.APPLICATION_ID!, commandData);

console.log(`Successfully registered ${result.length} commands.`);
