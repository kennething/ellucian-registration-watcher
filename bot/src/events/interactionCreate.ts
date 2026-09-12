import { ActionRow, AttachmentBuilder, ComponentType, Events, InteractionReplyOptions, MessageFlags, StringSelectMenuComponent } from "discord.js";
import { getMeetingDaysString, getMeetingTimeString, getTermString } from "../../../server/utils/functions.ts";
import { generateScheduleActionRow, generateScheduleImage } from "../commands/schedule.ts";
import { searchClasses, tryCatch } from "../../../server/utils/fetch.ts";
import { generateResponse, getClassData } from "../commands/search.ts";
import { ErrorCodes, getErrorResponse } from "../util/responses.ts";
import { ClassData } from "../../../server/utils/types.ts";
import { db } from "../../../server/utils/sqlite.ts";
import { Log } from "../../../server/utils/log.ts";
import { themes } from "../util/scheduleThemes.ts";
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

      const [command, ...buttonInfo] = interaction.customId.split(":") as ["search" | "schedule", ...string[]];

      if (command === "search") {
        const [type, paginationId] = buttonInfo as ["first" | "prev" | "next" | "last", paginationId: string];

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
      else if (command === "schedule") {
        const [type, ...moreButtonInfo] = buttonInfo as ["refresh" | "list", ...string[]];

        if (type === "refresh") {
          const [scheduleUuid, theme, isShared] = moreButtonInfo as [string, keyof typeof themes, string];
          const isSharedParsed = Boolean(Number(isShared));

          const [chosenScheduleUuid, attachment] = await generateScheduleImage(scheduleUuid, theme, isSharedParsed);
          if (!(attachment instanceof AttachmentBuilder)) return void interaction.followUp(attachment as InteractionReplyOptions);
          interaction.editReply({
            files: [attachment],
            components: [await generateScheduleActionRow(chosenScheduleUuid!, theme, isSharedParsed)]
          });
        } // schedule/refresh
        else if (type === "list") {
          const [scheduleUuid] = moreButtonInfo as [string];

          Log.debug(scheduleUuid);
          const [schedule, error] = tryCatch(() => db.prepare("SELECT term_id, crns FROM schedules WHERE uuid = ?").get(scheduleUuid) as { term_id: string; crns: string });
          Log.debug(schedule);
          if (error) return void interaction.followUp(getErrorResponse(ErrorCodes.SCHEDULE_DB_FETCH_FAIL, "this schedule doesnt exist dawg") as InteractionReplyOptions);

          const classData = await searchClasses(schedule.term_id, { crn: JSON.parse(schedule.crns) as string[] }, 0, ENV.USER_WATCHER_LIMIT);
          const classes = classData[0] as ClassData[];

          interaction.followUp({
            flags: MessageFlags.Ephemeral,
            content: `## ${getTermString(schedule.term_id)} - ${classes.reduce((acc, course) => acc + course.meetingsFaculty[0]?.meetingTime.creditHourSession || 0, 0)} credits

${classes
  .map((course) => {
    const meeting = course.meetingsFaculty[0]?.meetingTime;
    const unfilteredMeetingDays = [meeting?.sunday, meeting?.monday, meeting?.tuesday, meeting?.wednesday, meeting?.thursday, meeting?.friday, meeting?.saturday];
    const meetingDays = unfilteredMeetingDays.every((day) => day === undefined) ? undefined : unfilteredMeetingDays;
    const meetingTime = [meeting.beginTime, meeting?.endTime];

    return `-# - **${course.subject} ${course.courseNumber} - ${course.sequenceNumber}** | ${getMeetingDaysString(meetingDays)} ${getMeetingTimeString(meetingTime)} | ${course.meetingsFaculty[0]?.meetingTime.building} ${course.meetingsFaculty[0]?.meetingTime.room}`;
  })
  .join("\n")}`
          });
        } // schedule/list
      } // schedule
    } // isButton
    else if (interaction.isStringSelectMenu()) {
      await interaction.deferUpdate();

      const command = interaction.customId as "alert";

      if (command === "alert") {
        try {
          const value = interaction.values[0];
          if (value === "") return;
          const [term, crn, subject, courseNumber, sequenceNumber] = value.split(":");

          db.prepare("UPDATE watchers SET is_active = 0 WHERE owner_uuid = (SELECT uuid FROM users WHERE discord_id = ?) AND term_id = ? AND crn = ?").run(interaction.user.id, term, crn);

          const components = interaction.message.components;
          const actionRow = components[0] as ActionRow<StringSelectMenuComponent>;
          let selectOptions = actionRow.components[0].options;
          selectOptions = selectOptions.filter((option) => option.value !== value).slice(0, 25); // ? discord api limit

          const newActionRow = {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: "alert",
                placeholder: "Disable a watcher",
                options: selectOptions
              }
            ]
          };
          const newComponents = selectOptions.length === 0 ? [components[1]] : [newActionRow, components[1]];

          await interaction.editReply({ components: newComponents });
          await interaction.followUp({
            content: `Watcher for (${getTermString(term)}) ${subject} ${courseNumber} - ${sequenceNumber} has been disabled.`,
            ephemeral: true
          });
        } catch (error) {
          Log.error(error);
          await interaction.followUp({
            components: getErrorResponse(ErrorCodes.WATCHER_DB_UPDATE_FAIL)["components"]!,
            flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
          });
        }
      } // alert
    } // string select
  }
} satisfies Event<Events.InteractionCreate>;
