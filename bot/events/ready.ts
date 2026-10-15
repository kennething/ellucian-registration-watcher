import { botClient } from "../common";
import type { Event } from "./index";
import { Events } from "discord.js";
import { Log } from "~/utils/log";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    Log.info(`Bot logged in as ${client.user.tag}`);
    botClient.client = client;
  }
} satisfies Event<Events.ClientReady>;
