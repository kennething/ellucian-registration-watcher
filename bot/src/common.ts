import { Client } from "discord.js";

/** The Discord client instance, taken from the `clientReady` event */
export const CLIENT = {
  client: null as Client<true> | null
};
