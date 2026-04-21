import type { Event } from "./index.ts";
import { CLIENT } from "../common.ts";
import { Events } from "discord.js";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    CLIENT.client = client;
  }
} satisfies Event<Events.ClientReady>;
