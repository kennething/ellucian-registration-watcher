import { botClient } from "../common.ts";
import type { Event } from "./index.ts";
import { Events } from "discord.js";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    botClient.client = client;
  }
} satisfies Event<Events.ClientReady>;
