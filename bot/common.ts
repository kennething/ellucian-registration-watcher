import { ClassSearchParams } from "~/utils/types";
import { Client } from "discord.js";

/** The Discord client instance, taken from the `clientReady` event */
export const botClient = {
  client: null as Client<true> | null
};

/** `Map<paginationId, { state }>` */
export const paginationState = new Map<string, { page: number; total: number; params: ClassSearchParams; expirationTimeout: NodeJS.Timeout }>();
