import { generateActionRow, generateEmbed, getClassData } from "../commands/search.ts";
import { paginationState } from "../common.ts";
import { loadCommands } from "../util/loaders.ts";
import type { Event } from "./index.ts";
import { Events } from "discord.js";
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

      const [type, paginationId] = interaction.customId.split(":") as ["first" | "prev" | "next" | "last", string];
      const state = paginationState.get(paginationId);
      if (!state) return void interaction.followUp({ content: "Something went wrong.", ephemeral: true });
      if (state.userId !== interaction.user.id) return;

      if (type === "first") state.page = 1;
      else if (type === "prev") state.page = Math.max(1, state.page - 1);
      else if (type === "next") state.page = Math.min(Math.ceil(state.total / 6), state.page + 1);
      else if (type === "last") state.page = Math.ceil(state.total / 6);

      const offset = (state.page - 1) * 6;
      const [parsedClasses, total] = await getClassData(state.params.term, state.params, offset);

      await interaction.editReply({
        embeds: generateEmbed(state.page, total, parsedClasses),
        components: generateActionRow(state.page, total, paginationId)
      });
    } // isButton
  }
} satisfies Event<Events.InteractionCreate>;
