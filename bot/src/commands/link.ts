import { ApplicationIntegrationType, ComponentType, InteractionContextType, MessageFlags } from "discord.js";
import type { Command } from "./index.ts";

export default {
  data: {
    name: "link",
    description: "Generate a new pairing code to link your Discord account to the Bad Scheduler web interface",
    contexts: [InteractionContextType.PrivateChannel, InteractionContextType.BotDM, InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.UserInstall]
  },
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const res = await fetch(`${process.env.BACKEND_URL}/link/${interaction.user.id}`, { method: "POST" });
    const data = (await res.json()) as { code: string };

    interaction.editReply({
      embeds: [
        {
          color: 0x56deff,
          title: "Pairing Code",
          description: `Your pairing code is:\n**${data.code}**\n\nGo back and enter this code to link your account, or click the link below.`,
          footer: { text: "This code will expire in 5 minutes" },
          timestamp: new Date().toISOString()
        }
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              label: "Link Account",
              style: 5,
              url: `${process.env.FRONTEND_URL}/link?code=${encodeURIComponent(data.code)}`
            }
          ]
        }
      ]
    });
  }
} satisfies Command;
