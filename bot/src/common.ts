import { ClassSearchParams } from "../../server/utils/types.ts";
import { Client } from "discord.js";

/** The Discord client instance, taken from the `clientReady` event */
export const CLIENT = {
  client: null as Client<true> | null
};

export const paginationState = new Map<string, { userId: string; page: number; total: number; params: ClassSearchParams }>();
