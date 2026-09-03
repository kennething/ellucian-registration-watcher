import { Log } from "../../../server/utils/log.ts";
import { botClient } from "../common.ts";
import type { Event } from "./index.ts";
import { Events } from "discord.js";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    Log.info(`Bot logged in as ${client.user.tag}`);
    botClient.client = client;
  }
} satisfies Event<Events.ClientReady>;
