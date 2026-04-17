import { ApplicationIntegrationType, InteractionContextType } from "discord.js";
import type { Command } from "./index.ts";

export default {
  data: {
    name: "ping",
    description: "Ping!",
    contexts: [InteractionContextType.PrivateChannel, InteractionContextType.BotDM],
    integration_types: [ApplicationIntegrationType.UserInstall]
  },
  async execute(interaction) {
    await interaction.reply("Pong!");
  }
} satisfies Command;
