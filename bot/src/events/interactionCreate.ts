import { Events, InteractionReplyOptions, MessageFlags } from "discord.js";
import { generateResponse, getClassData } from "../commands/search.ts";
import { ErrorCodes, getErrorResponse } from "../util/responses.ts";
import { getTermString } from "../../../server/utils/functions.ts";
import { db } from "../../../server/utils/sqlite.ts";
import { loadCommands } from "../util/loaders.ts";
import { paginationState } from "../common.ts";
import type { Event } from "./index.ts";
import ENV from "../../../env.ts";
import { URL } from "node:url";

const commands = await loadCommands(new URL("../commands/", import.meta.url));

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) throw new Error(`Command '${interaction.commandName}' not found.`);

      await command.execute(interaction);
    } // isCommand
    else if (interaction.isAutocomplete()) {
      const command = commands.get(interaction.commandName);
      if (!command) throw new Error(`Command '${interaction.commandName}' not found.`);

      await command.autocomplete?.(interaction);
    } // isAutocomplete
    else if (interaction.isButton()) {
      await interaction.deferUpdate();

      const [command, type, paginationId] = interaction.customId.split(":") as ["search", "first" | "prev" | "next" | "last", string];

      if (command === "search") {
        const state = paginationState.get(paginationId);
        if (!state)
          return void interaction.followUp({
            ...(getErrorResponse(ErrorCodes.SEARCH_EXPIRED, "This search has expired.") as InteractionReplyOptions),
            flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
          });
        if (state.userId !== interaction.user.id) return;

        const maxPages = Math.ceil(state.total / ENV.SEARCH_PAGE_SIZE);

        if (type === "first") state.page = 1;
        else if (type === "prev") state.page = Math.max(1, state.page - 1);
        else if (type === "next") state.page = Math.min(maxPages, state.page + 1);
        else if (type === "last") state.page = maxPages;

        const offset = (state.page - 1) * ENV.SEARCH_PAGE_SIZE;
        const [parsedClasses, total] = await getClassData(state.params.term, state.params, offset);

        await interaction.editReply(await generateResponse(state.params.term, state.page, total, parsedClasses, paginationId));
      } // search
    } // isButton
    else if (interaction.isStringSelectMenu()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const command = interaction.customId as "alert";

      if (command === "alert") {
        try {
          const [term, crn, subject, courseNumber, sequenceNumber] = interaction.values[0].split(":");

          db.prepare("UPDATE watchers SET is_active = 0 WHERE owner_uuid = (SELECT uuid FROM users WHERE discord_id = ?) AND term_id = ? AND crn = ?").run(interaction.user.id, term, crn);

          await interaction.followUp({
            content: `Watcher for (${getTermString(term)}) ${subject} ${courseNumber} - ${sequenceNumber} has been disabled.`,
            ephemeral: true
          });
        } catch (error) {
          await interaction.followUp({
            components: getErrorResponse(ErrorCodes.WATCHER_DB_UPDATE_FAIL)["components"]!,
            flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
          });
        }
      } // alert
    } // string select
  }
} satisfies Event<Events.InteractionCreate>;
