import { ApplicationIntegrationType, ComponentType, InteractionContextType, MessageFlags } from "discord.js";
import { ErrorCodes, getErrorResponse, getSignupResponse } from "../util/responses.ts";
import { NotificationType } from "../../../server/utils/types.ts";
import { tryCatch } from "../../../server/utils/fetch.ts";
import { db } from "../../../server/utils/sqlite.ts";
import type { Command } from "./index.ts";
import ENV from "../../../env.ts";

export default {
  data: {
    name: "list",
    description: "List your current watchers and their stats",
    contexts: [InteractionContextType.PrivateChannel, InteractionContextType.BotDM, InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.UserInstall]
  },
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [user, error] = tryCatch<{ uuid: string }>(() => db.prepare("SELECT uuid FROM users WHERE discord_id = ?").get(interaction.user.id) as any);
    if (!user) void interaction.editReply(getSignupResponse());
    if (error) return void interaction.editReply(getErrorResponse(ErrorCodes.USER_DB_FETCH_FAIL));

    const [watchers, error2] = tryCatch<{ term_id: string; crn: string; notify_when: number; notify_when_value: number }[]>(
      () => db.prepare("SELECT term_id, crn, notify_when, notify_when_value FROM watchers WHERE owner_uuid = ? LIMIT ?").all(user.uuid, ENV.USER_WATCHER_LIMIT) as any
    );
    if (error2) return void interaction.editReply(getErrorResponse(ErrorCodes.WATCHER_DB_FETCH_FAIL));

    const watchersWithData: { term_id: string; crn: string; notify_when: NotificationType; notify_when_value: number; seat24h: number; wait24h: number | null }[] = [];
    const getStatement = db.prepare("SELECT seat_24h, wait_24h FROM course_history WHERE term_id = ? AND crn = ?");
    db.transaction(() => {
      for (const watcher of watchers) {
        const { seat_24h, wait_24h } = getStatement.get(watcher.term_id, watcher.crn) as { seat_24h: string; wait_24h: string };
        const seat24h = JSON.parse(seat_24h) as number[];
        const wait24h = wait_24h ? (JSON.parse(wait_24h) as number[]) : null;
        watchersWithData.push({ ...watcher, seat24h: seat24h.at(-1)!, wait24h: wait24h ? wait24h.at(-1)! : null });
      }
    })();

    interaction.editReply({
      embeds: [
        {
          color: ENV.PRIMARY_COLOR,
          title: "Your Watchers",
          description:
            "These watchers will notify you when their conditions are met:\n" +
            watchersWithData
              .map((watcher) => {
                const condition = watcher.notify_when === NotificationType.SEAT_GREATER_THAN || watcher.notify_when === NotificationType.SEAT_LESS_THAN ? "seats" : "waitlist";
                const operator = watcher.notify_when === NotificationType.SEAT_LESS_THAN || watcher.notify_when === NotificationType.WAIT_LESS_THAN ? "≤" : "≥";
                return `- **${watcher.crn}** (${condition} ${operator} ${watcher.notify_when_value}): ${watcher.seat24h} seat${watcher.seat24h !== 1 ? "s" : ""} available${watcher.wait24h ? `, ${watcher.wait24h} in waitlist` : ""}`;
              })
              .join("\n"),
          footer: { text: `You have ${watchersWithData.length}/${ENV.USER_WATCHER_LIMIT} watchers` },
          timestamp: new Date().toISOString()
        }
      ],
      components: ENV.FRONTEND_URL
        ? [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  label: "Manage Watchers",
                  style: 5,
                  url: `${ENV.FRONTEND_URL}/watch`
                }
              ]
            }
          ]
        : undefined
    });
  }
} satisfies Command;
