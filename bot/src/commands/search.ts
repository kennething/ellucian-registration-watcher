import { getMeetingDaysString, getMeetingTimeString, getTermString } from "../../../server/utils/functions.ts";
import { fetchClassDescription, searchClassDb, tryCatch } from "../../../server/utils/fetch.ts";
import { ErrorCodes, getErrorResponse, getSignupResponse } from "../util/responses.ts";
import { TruncatedClassData, ClassData } from "../../../server/utils/types.ts";
import type { ClassSearchParams } from "../../../server/utils/types.ts";
import { ClientManager } from "../../../server/utils/clientManager.ts";
import { Term } from "../../../server/utils/term.ts";
import { db } from "../../../server/utils/sqlite.ts";
import { Log } from "../../../server/utils/log.ts";
import { getCourseColor } from "../util/index.ts";
import { paginationState } from "../common.ts";
import type { Command } from "./index.ts";
import { v7 as uuidv7 } from "uuid";
import ENV from "../../../env.ts";
import {
  CommandInteractionOptionResolver,
  ApplicationCommandOptionType,
  InteractionEditReplyOptions,
  ApplicationIntegrationType,
  InteractionContextType,
  ContainerBuilder,
  ButtonBuilder,
  MessageFlags,
  ButtonStyle
} from "discord.js";

function getSearchParams(options: CommandInteractionOptionResolver): ClassSearchParams {
  const userTerm = options.getString("term");
  if (!userTerm && !ClientManager.terms) throw new Error("No term provided and no recent terms found");

  const termId = userTerm ?? (ClientManager.terms.find((t: Term) => t.isPrimary) as Term).termId;

  const meetingDays = [
    options.getBoolean("sunday") ?? false,
    options.getBoolean("monday") ?? false,
    options.getBoolean("tuesday") ?? false,
    options.getBoolean("wednesday") ?? false,
    options.getBoolean("thursday") ?? false,
    options.getBoolean("friday") ?? false,
    options.getBoolean("saturday") ?? false
  ];

  const startTime = options
    .getString("start_time")
    ?.split(":")
    .map((val) => parseInt(val));
  const parsedStartTime = startTime ? ([startTime[0] % 12, startTime[1], startTime[0] >= 12 ? "PM" : "AM"] as [number, number, "AM" | "PM"]) : undefined;
  const endTime = options
    .getString("end_time")
    ?.split(":")
    .map((val) => parseInt(val));
  const parsedEndTime = endTime ? ([endTime[0] % 12, endTime[1], endTime[0] >= 12 ? "PM" : "AM"] as [number, number, "AM" | "PM"]) : undefined;

  const rmpLow = options.getNumber("rmp_rating_minimum");
  const rmpHigh = options.getNumber("rmp_rating_maximum");
  const creditLow = options.getInteger("credit_hours_minimum");
  const creditHigh = options.getInteger("credit_hours_maximum");

  const crnField = options.getString("crn");
  const searchParams: ClassSearchParams = {
    term: termId,
    attribute: options.getString("attribute") ?? undefined,
    subject: options.getString("subject") ?? undefined,
    courseNumber: options.getString("course_number") ?? undefined,
    courseTitle: options.getString("course_title") ?? undefined,
    crn: crnField ? [crnField] : undefined,
    meetingDays: meetingDays.every((day) => !day) ? undefined : meetingDays,
    time: parsedStartTime && parsedEndTime ? [...parsedStartTime, ...parsedEndTime] : undefined,
    professorRating: rmpLow && rmpHigh ? [rmpLow, rmpHigh] : undefined,
    strictRatingSearch: options.getBoolean("strict_rating_search") ?? false,
    creditHours: creditLow && creditHigh ? [creditLow, creditHigh] : undefined,
    avoidConflicts: options.getString("avoid_conflicts") ?? undefined
  };

  return searchParams;
}

export async function getClassData(term: string, searchParams: ClassSearchParams, offset = 0): Promise<[classes: TruncatedClassData[], total: number]> {
  const results = await searchClassDb(term, searchParams, offset, ENV.SEARCH_PAGE_SIZE);
  const classes: ClassData[] = results[0];
  const total = results[1];

  const parsedClasses: TruncatedClassData[] = [];
  classes.forEach((c) => {
    const professor = c.faculty.find((f) => f.primaryIndicator);
    const [rmpData, error] = professor
      ? tryCatch<{ rmp_id: number; overall_rating: number; num_ratings: number; percent_take_again: number; level_of_difficulty: number }>(
          () => db.prepare("SELECT rmp_id, overall_rating, num_ratings, percent_take_again, level_of_difficulty FROM professors WHERE school_name = ? LIMIT 1").get(professor.displayName) as any
        )
      : [];
    if (error) return Log.error(error);

    if (searchParams.strictRatingSearch && (!rmpData || !rmpData.overall_rating)) return;
    if (searchParams.professorRating && rmpData?.overall_rating && (rmpData.overall_rating < searchParams.professorRating[0] || rmpData.overall_rating > searchParams.professorRating[1])) return;

    parsedClasses.push({
      term: c.term,
      courseReferenceNumber: c.courseReferenceNumber,
      subject: c.subject,
      courseNumber: c.courseNumber,
      courseTitle: c.courseTitle,
      sequenceNumber: c.sequenceNumber,
      seatsAvailable: c.seatsAvailable,
      maximumEnrollment: c.maximumEnrollment,
      waitCount: c.waitCount,
      waitCapacity: c.waitCapacity,

      lastUpdated: null,
      seat24h: null,
      seat7d: null,
      seat28d: null,
      wait24h: null,
      wait7d: null,
      wait28d: null,

      credits: c.meetingsFaculty[0]?.meetingTime.creditHourSession ?? 0,
      meeting: {
        building: c.meetingsFaculty[0]?.meetingTime.building ?? "",
        buildingDescription: c.meetingsFaculty[0]?.meetingTime.buildingDescription ?? "",
        room: c.meetingsFaculty[0]?.meetingTime.room ?? "",
        campus: c.meetingsFaculty[0]?.meetingTime.campus ?? "",
        campusDescription: c.meetingsFaculty[0]?.meetingTime.campusDescription ?? "",
        scheduleType: c.meetingsFaculty[0]?.meetingTime.meetingScheduleType ?? "",
        instructionalMethodDescription: c.instructionalMethodDescription ?? "",
        time: [c.meetingsFaculty[0]?.meetingTime.beginTime ?? "", c.meetingsFaculty[0]?.meetingTime.endTime ?? ""],
        days: [
          c.meetingsFaculty[0]?.meetingTime.sunday ?? false,
          c.meetingsFaculty[0]?.meetingTime.monday ?? false,
          c.meetingsFaculty[0]?.meetingTime.tuesday ?? false,
          c.meetingsFaculty[0]?.meetingTime.wednesday ?? false,
          c.meetingsFaculty[0]?.meetingTime.thursday ?? false,
          c.meetingsFaculty[0]?.meetingTime.friday ?? false,
          c.meetingsFaculty[0]?.meetingTime.saturday ?? false
        ]
      },
      attributes: c.sectionAttributes.map((a) => a.code),

      professorId: professor?.bannerId ?? "",
      professorName: professor?.displayName.split(",").reverse().join(" ") ?? "",
      rmpId: rmpData?.rmp_id ?? null,
      rmpRating: rmpData?.overall_rating ?? null,
      rmpNumRatings: rmpData?.num_ratings ?? null,
      rmpTakeAgain: rmpData?.percent_take_again ?? null,
      rmpDifficulty: rmpData?.level_of_difficulty ?? null
    });
  });

  return [parsedClasses, total];
}

/** generates a full response for a single course */
export async function generateFullResponse(term: string, course: TruncatedClassData): Promise<ContainerBuilder | InteractionEditReplyOptions> {
  const container = new ContainerBuilder();

  const [data, descriptionError] = tryCatch(() => fetchClassDescription(term, course.courseReferenceNumber));
  if (descriptionError) return getErrorResponse(ErrorCodes.SEARCH_NO_CLASSES, "couldnt get the course description sorry");
  const description = await data;

  container
    .setAccentColor(getCourseColor(course, true))
    .addTextDisplayComponents((textDisplay) => {
      let str = `## ${course.courseTitle}\n${course.subject} ${course.courseNumber} - ${course.sequenceNumber} (CRN: ${course.courseReferenceNumber})`;

      // * location
      if (course.meeting.building && course.meeting.room) str += `\n- <:location:1537238636368764948> **Location**: ${course.meeting.building} ${course.meeting.room}`;
      // * professor
      if (course.professorName) {
        str += "\n- <:professor:1537238698477752451> **Professor**: ";
        const hasRmp = course.rmpId && course.rmpRating;
        const ratingStars = hasRmp ? "<:starfill:1537242913850007612>".repeat(Math.round(course.rmpRating!)) + "<:star:1537242913157681273>".repeat(5 - Math.round(course.rmpRating!)) : "";
        const rating = hasRmp ? ` ${ratingStars} (${course.rmpRating!.toFixed(1)}/5)` : "";
        const professor = hasRmp ? `[${course.professorName}](https://www.ratemyprofessors.com/professor/${course.rmpId})` : course.professorName;
        str += `${professor}${rating}`;
      }
      // * meeting time
      if (course.meeting.days.some((d) => !!d) || (course.meeting.time[0] && course.meeting.time[1])) {
        str += `\n- <:meetingtime:1537238821911920751> **Meeting Time**: `;
        if (course.meeting.days.some((d) => !!d)) str += `${getMeetingDaysString(course.meeting.days)} `;
        if (course.meeting.time[0] && course.meeting.time[1]) str += `${getMeetingTimeString(course.meeting.time)}`;
      }
      // * seats
      str += `\n- <:seats:1537238779268694117> **Seats Available**: __**${course.seatsAvailable}**__ of ${course.maximumEnrollment}`;
      // * waitlist
      str += `\n- <:waitlist:1537262126647877632> **Waitlist**: ${course.waitCapacity === 0 ? "--" : course.waitCount}`;

      textDisplay.setContent(str);
      return textDisplay;
    })
    .addSeparatorComponents((separator) => separator.setDivider(true))
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(`### <:description:1537274148999536701> Course Description\n${description.slice(0, 1000)}${description.length > 1000 ? "..." : ""}`)
    )
    .addSeparatorComponents((separator) => separator.setDivider(true))
    .addTextDisplayComponents((textDisplay) => {
      let str = `- <:term:1537260458715648041> **Term**: ${getTermString(course.term)}
- <:credits:1537260545592397996> **Credits**: ${course.credits}
- <:campus:1537273936646119496> **Campus**: ${course.meeting.campusDescription}${course.meeting.campus === "M" ? " Campus" : ""}
- <:scheduletype:1537261058635595846> **Schedule Type**: ${course.meeting.scheduleType}
- <:instructionmethod:1537262270114037845> **Instructional Method**: ${course.meeting.instructionalMethodDescription}`;
      if (course.attributes.length > 0)
        str += `\n- <:attributes:1537275293738336386> **Attributes**:\n${course.attributes.map((attribute) => `  - ${ClientManager.attributes?.find((a) => a.code === attribute)?.name ?? attribute}`).join("\n")}`;

      textDisplay.setContent(str);
      return textDisplay;
    });

  if (ENV.FRONTEND_URL)
    container.addActionRowComponents((actionRow) =>
      actionRow.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("View on Web").setURL(`${ENV.FRONTEND_URL}/search?term=${term}&crn=${course.courseReferenceNumber}`))
    );

  return container;
}
/** generates a full response if only 1 course, or regular paginated response */
export async function generateResponse(term: string, currentPage: number, total: number, classes: TruncatedClassData[], paginationId: string): Promise<InteractionEditReplyOptions> {
  function generatePaginatedResponse(): ContainerBuilder {
    const container = new ContainerBuilder();

    container
      .setAccentColor(ENV.PRIMARY_COLOR)
      .addTextDisplayComponents((textDisplay) =>
        textDisplay.setContent(`## Search Results\n${getTermString(term)} - ${total.toLocaleString()} classes found (Page ${currentPage} of ${maxPage.toLocaleString()})`)
      );

    container.addSeparatorComponents((separator) => separator.setDivider(true));

    if (classes.length === 0) {
      container.addTextDisplayComponents((textDisplay) => textDisplay.setContent("No classes on this page matching your search criteria."));
    } // 0 classes
    else
      classes.forEach((course) =>
        container.addSectionComponents((section) => {
          section
            .addTextDisplayComponents((textDisplay) => {
              let str = `### __${course.courseTitle}__\n${course.subject} ${course.courseNumber} - ${course.sequenceNumber} (CRN: ${course.courseReferenceNumber})`;

              // * professor
              if (course.professorName) {
                str += "\n- <:professor:1537238698477752451> **Professor**: ";
                const hasRmp = course.rmpId && course.rmpRating;
                const ratingStars = hasRmp ? "<:starfill:1537242913850007612>".repeat(Math.round(course.rmpRating!)) + "<:star:1537242913157681273>".repeat(5 - Math.round(course.rmpRating!)) : "";
                const rating = hasRmp ? ` ${ratingStars} (${course.rmpRating!.toFixed(1)}/5)` : "";
                const professor = hasRmp ? `[${course.professorName}](https://www.ratemyprofessors.com/professor/${course.rmpId})` : course.professorName;
                str += `${professor}${rating}`;
              }
              // * meeting time
              if (course.meeting.days.some((d) => !!d) || (course.meeting.time[0] && course.meeting.time[1])) {
                str += `\n- <:meetingtime:1537238821911920751> **Meeting Time**: `;
                if (course.meeting.days.some((d) => !!d)) str += `${getMeetingDaysString(course.meeting.days)} `;
                if (course.meeting.time[0] && course.meeting.time[1]) str += `${getMeetingTimeString(course.meeting.time)}`;
              }
              // * location
              if (course.meeting.building && course.meeting.room) str += `\n- <:location:1537238636368764948> **Location**: ${course.meeting.building} ${course.meeting.room}`;
              // * seats
              str += `\n- <:seats:1537238779268694117> **Seats Available**: __**${course.seatsAvailable}**__ of ${course.maximumEnrollment}`;
              // * waitlist
              if (course.waitCapacity > 0) str += `\n- <:waitlist:1537262126647877632> **Waitlist**: ${course.waitCount}`;

              textDisplay.setContent(str);
              return textDisplay;
            })
            .setButtonAccessory((button) => button.setStyle(ButtonStyle.Secondary).setLabel("More Info").setCustomId(`search:moreinfo:${course.term}:${course.courseReferenceNumber}`));
          return section;
        })
      );

    container
      .addSeparatorComponents((separator) => separator.setDivider(true))
      .addTextDisplayComponents((textDisplay) => textDisplay.setContent(`Page ${currentPage} of ${maxPage.toLocaleString()}`))
      .addActionRowComponents((actionRow) => {
        actionRow.setComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Secondary)
            .setCustomId(`search:page:first:${paginationId}`)
            .setEmoji("<:arrow:1537239640925536376>")
            .setDisabled(currentPage === 1),
          new ButtonBuilder()
            .setStyle(ButtonStyle.Secondary)
            .setCustomId(`search:page:prev:${paginationId}`)
            .setEmoji("<:arrowleft:1537239620897611887>")
            .setDisabled(currentPage === 1),
          new ButtonBuilder()
            .setStyle(ButtonStyle.Secondary)
            .setCustomId(`search:page:next:${paginationId}`)
            .setEmoji("<:arrowright:1537239554480668684>")
            .setDisabled(currentPage === maxPage),
          new ButtonBuilder()
            .setStyle(ButtonStyle.Secondary)
            .setCustomId(`search:page:last:${paginationId}`)
            .setEmoji("<:arrowright2:1537239597992513537>")
            .setDisabled(currentPage === maxPage)
        );
        if (ENV.FRONTEND_URL) actionRow.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("View on Web").setURL(`${ENV.FRONTEND_URL}/search`));
        return actionRow;
      });

    return container;
  }

  const maxPage = Math.ceil(total / ENV.SEARCH_PAGE_SIZE);

  const response = total === 1 && classes.length === 1 ? await generateFullResponse(term, classes[0]) : generatePaginatedResponse();
  if (!(response instanceof ContainerBuilder)) return response;

  return {
    components: [response],
    flags: MessageFlags.IsComponentsV2
  };
}

export default {
  data: {
    name: "search",
    description: "Search for classes",
    contexts: [InteractionContextType.PrivateChannel, InteractionContextType.BotDM, InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.UserInstall],
    options: [
      {
        name: "term",
        description: "Defaults to the latest major term (fall/spring)",
        max_length: 6,
        type: ApplicationCommandOptionType.String,
        autocomplete: true
      },
      {
        name: "attribute",
        description: "Filter by attribute code",
        type: ApplicationCommandOptionType.String,
        autocomplete: true
      },
      {
        name: "subject",
        description: "Filter by subject code",
        type: ApplicationCommandOptionType.String,
        autocomplete: true
      },
      {
        name: "location",
        description: "Filter by building",
        type: ApplicationCommandOptionType.String,
        autocomplete: true
      },
      {
        name: "course_number",
        description: "Filter by course number",
        max_length: 4,
        type: ApplicationCommandOptionType.String
      },
      {
        name: "course_title",
        description: "Filter by course title",
        max_length: 100,
        type: ApplicationCommandOptionType.String
      },
      {
        name: "crn",
        description: "Course Reference Number",
        max_length: 5,
        type: ApplicationCommandOptionType.String
      },
      {
        name: "avoid_conflicts",
        description: "Filter out classes that conflict with your schedule. The schedule must be the same term as the search term",
        type: ApplicationCommandOptionType.String,
        autocomplete: true
      },
      {
        name: "sunday",
        description: "Filter by classes that meet on Sunday",
        type: ApplicationCommandOptionType.Boolean
      },
      {
        name: "monday",
        description: "Filter by classes that meet on Monday",
        type: ApplicationCommandOptionType.Boolean
      },
      {
        name: "tuesday",
        description: "Filter by classes that meet on Tuesday",
        type: ApplicationCommandOptionType.Boolean
      },
      {
        name: "wednesday",
        description: "Filter by classes that meet on Wednesday",
        type: ApplicationCommandOptionType.Boolean
      },
      {
        name: "thursday",
        description: "Filter by classes that meet on Thursday",
        type: ApplicationCommandOptionType.Boolean
      },
      {
        name: "friday",
        description: "Filter by classes that meet on Friday",
        type: ApplicationCommandOptionType.Boolean
      },
      {
        name: "saturday",
        description: "Filter by classes that meet on Saturday",
        type: ApplicationCommandOptionType.Boolean
      },
      {
        name: "start_time",
        description: "24-hour format (HH:MM)",
        max_length: 5,
        type: ApplicationCommandOptionType.String
      },
      {
        name: "end_time",
        description: "24-hour format (HH:MM)",
        max_length: 5,
        type: ApplicationCommandOptionType.String
      },
      {
        name: "rmp_rating_minimum",
        description: "Filter by minimum RateMyProfessors rating (0.0 - 5.0)",
        min_value: 0,
        max_value: 5,
        type: ApplicationCommandOptionType.Number
      },
      {
        name: "rmp_rating_maximum",
        description: "Filter by maximum RateMyProfessors rating (0.0 - 5.0)",
        min_value: 0,
        max_value: 5,
        type: ApplicationCommandOptionType.Number
      },
      {
        name: "strict_rating_search",
        description: "Show only professors with a RateMyProfessors page",
        type: ApplicationCommandOptionType.Boolean
      },
      {
        name: "credit_hours_minimum",
        description: "Filter by minimum credit hours (0 - 4)",
        min_value: 0,
        max_value: 4,
        type: ApplicationCommandOptionType.Integer
      },
      {
        name: "credit_hours_maximum",
        description: "Filter by maximum credit hours (0 - 4)",
        min_value: 0,
        max_value: 4,
        type: ApplicationCommandOptionType.Integer
      }
    ]
  },
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused(true);

    if (focusedValue.name === "term")
      return interaction.respond(ClientManager.terms?.map((term: Term) => ({ name: `${term.getTermString()}${term.isEarly ? " (Early)" : ""}`, value: term.termId })) ?? []);
    else if (focusedValue.name === "attribute")
      return interaction.respond(
        ClientManager.attributes
          ?.filter((attribute) => (focusedValue.value ? attribute.name.toLowerCase().includes(focusedValue.value.toLowerCase()) : true))
          .map((attribute) => ({ name: attribute.name, value: attribute.code }))
          .slice(0, 25) ?? []
      );
    else if (focusedValue.name === "subject")
      return interaction.respond(
        ClientManager.subjects
          ?.filter((subject) => (focusedValue.value ? subject.name.toLowerCase().includes(focusedValue.value.toLowerCase()) : true))
          .map((subject) => ({ name: subject.name, value: subject.code }))
          .slice(0, 25) ?? []
      );
    else if (focusedValue.name === "location")
      return interaction.respond(
        ClientManager.locations
          ?.filter((location) =>
            focusedValue.value ? location.long.toLowerCase().includes(focusedValue.value.toLowerCase()) || location.short.toLowerCase().includes(focusedValue.value.toLowerCase()) : true
          )
          .map((location) => ({ name: `${location.short} - ${location.long}`, value: location.short }))
          .slice(0, 25) ?? []
      );
    else if (focusedValue.name === "avoid_conflicts") {
      const schedules = db.prepare("SELECT uuid, name, term_id FROM schedules WHERE owner_uuid = (SELECT uuid FROM users WHERE discord_id = ?)").all(interaction.user.id) as {
        uuid: string;
        name: string;
        term_id: string;
      }[];
      return interaction.respond(
        schedules
          .filter((schedule) => (focusedValue.value ? schedule.name.toLowerCase().includes(focusedValue.value.toLowerCase()) : true))
          .map((schedule) => ({ name: `${schedule.name} (${getTermString(schedule.term_id)})`, value: schedule.uuid }))
          .slice(0, 25) ?? []
      );
    }

    return interaction.respond([]);
  },
  async execute(interaction) {
    await interaction.deferReply();

    // @ts-expect-error
    const options = interaction.options as CommandInteractionOptionResolver;

    const [user, error] = tryCatch<{ uuid: string }>(() => db.prepare("SELECT uuid FROM users WHERE discord_id = ?").get(interaction.user.id) as any);
    if (!user) return void interaction.editReply(getSignupResponse());
    if (error) return void interaction.editReply(getErrorResponse(ErrorCodes.USER_DB_FETCH_FAIL));

    const [searchParams, searchParamsError] = tryCatch(() => getSearchParams(options));
    if (searchParamsError) return void interaction.editReply(getErrorResponse(ErrorCodes.UNKNOWN));

    if (searchParams.avoidConflicts) {
      const [schedule, scheduleError] = tryCatch(
        () => db.prepare("SELECT 1 FROM schedules WHERE uuid = ? AND term_id = ? AND owner_uuid = ?").get(searchParams.avoidConflicts, searchParams.term, user.uuid) as any
      );
      if (scheduleError) return void interaction.editReply(getErrorResponse(ErrorCodes.SCHEDULE_DB_FETCH_FAIL));
      if (!schedule) return void interaction.editReply(getErrorResponse(ErrorCodes.NO_SCHEDULE, "Your schedule for **avoid_conflicts** must be the same term as your search term"));
    }

    const [parsedClasses, total] = await getClassData(searchParams.term, searchParams);
    if (total === 0) return void interaction.editReply(getErrorResponse(ErrorCodes.SEARCH_NO_CLASSES, "No classes found matching your search criteria"));

    const paginationId = uuidv7();
    paginationState.set(paginationId, { userId: interaction.user.id, page: 1, total, params: searchParams });
    setTimeout(() => paginationState.delete(paginationId), ENV.PAGINATION_TIMEOUT * 1000);

    interaction.editReply(await generateResponse(searchParams.term, 1, total, parsedClasses, paginationId));
  }
} satisfies Command;
