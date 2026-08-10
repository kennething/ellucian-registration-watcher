import { APIEmbed, ApplicationCommandOptionType, ApplicationIntegrationType, ButtonStyle, CommandInteractionOptionResolver, ComponentType, InteractionContextType } from "discord.js";
import { getMeetingDaysString, getMeetingTimeString, getTermString } from "../../../server/utils/functions.ts";
import { TruncatedClassData, ClassData } from "../../../server/utils/types.ts";
import { searchClasses, tryCatch } from "../../../server/utils/fetch.ts";
import type { ClassSearchParams } from "../../../server/routes/class.ts";
import { Cookie } from "../../../server/utils/cookie.ts";
import { db } from "../../../server/utils/sqlite.ts";
import { paginationState } from "../common.ts";
import type { Command } from "./index.ts";
import { v7 as uuidv7 } from "uuid";
import ENV from "../../../env.ts";

function getSearchParams(options: CommandInteractionOptionResolver): ClassSearchParams {
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

  const searchParams: ClassSearchParams = {
    term: options.getString("term")!,
    attribute: options.getString("attribute") ?? undefined,
    subject: options.getString("subject") ?? undefined,
    courseNumber: options.getString("course_number") ?? undefined,
    courseTitle: options.getString("course_title") ?? undefined,
    crn: options.getString("crn") ?? undefined,
    meetingDays: meetingDays.every((day) => !day) ? undefined : meetingDays,
    time: parsedStartTime && parsedEndTime ? [...parsedStartTime, ...parsedEndTime] : undefined,
    professorRating: rmpLow && rmpHigh ? [rmpLow, rmpHigh] : undefined,
    creditHours: creditLow && creditHigh ? [creditLow, creditHigh] : undefined
  };

  return searchParams;
}

export async function getClassData(term: string, searchParams: ClassSearchParams, offset = 0): Promise<[classes: TruncatedClassData[], total: number]> {
  const results = await searchClasses(term, searchParams, offset, 10); // get 10 instead of 6 incase rmp filtered
  const classes: ClassData[] = results[0];
  const total = results[1];

  const parsedClasses: TruncatedClassData[] = [];
  classes.forEach((c) => {
    const professor = c.faculty.find((f) => f.primaryIndicator);
    const [rmpData, error] = professor
      ? tryCatch<{ rmp_id: number; overall_rating: number; num_ratings: number; percent_take_again: number; level_of_difficulty: number }>(
          () => db.prepare("SELECT rmp_id, overall_rating, num_ratings, percent_take_again, level_of_difficulty FROM professors WHERE school_name = ?").get(professor.displayName) as any
        )
      : [];
    if (error) return console.error(error);

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
      seat28d: null,
      wait24h: null,
      wait28d: null,

      credits: c.meetingsFaculty[0]?.meetingTime.creditHourSession ?? 0,
      meeting: {
        building: c.meetingsFaculty[0]?.meetingTime.building ?? "",
        buildingDescription: c.meetingsFaculty[0]?.meetingTime.buildingDescription ?? "",
        room: c.meetingsFaculty[0]?.meetingTime.room ?? "",
        campus: c.meetingsFaculty[0]?.meetingTime.campus ?? "",
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

      professorId: professor?.bannerId ?? "",
      professorName: professor?.displayName.split(",").reverse().join(" ") ?? "",
      rmpId: rmpData?.rmp_id ?? null,
      rmpRating: rmpData?.overall_rating ?? null,
      rmpNumRatings: rmpData?.num_ratings ?? null,
      rmpTakeAgain: rmpData?.percent_take_again ?? null,
      rmpDifficulty: rmpData?.level_of_difficulty ?? null
    });
  });

  return [parsedClasses.slice(0, 6), total];
}

export function generateEmbed(currentPage: number, total: number, classes: TruncatedClassData[]): APIEmbed[] {
  const meetingString = (course: TruncatedClassData) => {
    if (course.meeting.days.some((day) => day) && !course.meeting.building && !course.meeting.room) return `-# ${getMeetingDaysString(course.meeting.days)}\n`;
    else if (course.meeting.days.every((day) => !day) && course.meeting.building && course.meeting.room) return `-# ${course.meeting.building} ${course.meeting.room}\n`;
    else if (course.meeting.days.some((day) => day) && course.meeting.building && course.meeting.room)
      return `-# ${getMeetingDaysString(course.meeting.days)} | ${course.meeting.building} ${course.meeting.room}\n`;
    return "";
  };

  return [
    {
      color: 0x065942,
      title: "Search Results",
      description: `${total.toLocaleString()} classes found${classes.some((c) => c.professorLeaked) ? "\n**\\*** *This professor was taken from the internal Math department schedule and is subject to change.*" : ""}`,
      fields: classes.map((course) => ({
        name: `${course.subject} ${course.courseNumber} - ${course.sequenceNumber} | ${course.courseTitle.replace(/&amp;/g, "&").replace(/&#39;/g, "'")}`,
        value: `${meetingString(course)}${getMeetingTimeString(course.meeting.time) === "TBD" ? "" : `-# ${getMeetingTimeString(course.meeting.time)}\n`}**__${course.seatsAvailable}__**/${course.maximumEnrollment} seats left${course.waitCapacity === 0 ? "" : `\n**${course.waitCount}** on waitlist`}
-# ${course.rmpId && course.professorName ? `[${course.professorName}${course.professorLeaked ? "*****" : ""}](https://ratemyprofessors.com/professor/${course.rmpId})${course.rmpNumRatings ? `\n-# ${course.rmpRating!.toFixed(1)}/5 (${course.rmpNumRatings} rating${course.rmpNumRatings === 1 ? "" : "s"})` : ""}` : course.professorName ? `${course.professorName}${course.professorLeaked ? "*****" : ""}` : "Unknown Instructor"}
‎ `,
        inline: true
      })),
      footer: { text: `Page ${currentPage} of ${Math.ceil(total / 6).toLocaleString()}` },
      timestamp: new Date().toISOString()
    }
  ];
}

export function generateActionRow(currentPage: number, total: number, paginationId: string) {
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          label: "⏮️",
          style: ButtonStyle.Secondary,
          custom_id: `search:first:${paginationId}`,
          disabled: currentPage === 1
        },
        {
          type: ComponentType.Button,
          label: "◀️",
          style: ButtonStyle.Secondary,
          custom_id: `search:prev:${paginationId}`,
          disabled: currentPage === 1
        },
        {
          type: ComponentType.Button,
          label: "▶️",
          style: ButtonStyle.Secondary,
          custom_id: `search:next:${paginationId}`,
          disabled: currentPage === Math.ceil(total / 6)
        },
        {
          type: ComponentType.Button,
          label: "⏭️",
          style: ButtonStyle.Secondary,
          custom_id: `search:last:${paginationId}`,
          disabled: currentPage === Math.ceil(total / 6)
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Link,
          label: "View on Web",
          url: `${ENV.FRONTEND_URL}/search`
        }
      ]
    }
  ] as const;
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
        description: "The term to search for classes",
        max_length: 6,
        type: ApplicationCommandOptionType.String,
        autocomplete: true,
        required: true
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
        description: "Filter by minimum RateMyProfessor rating (0.0 - 5.0)",
        min_value: 0,
        max_value: 5,
        type: ApplicationCommandOptionType.Number
      },
      {
        name: "rmp_rating_maximum",
        description: "Filter by maximum RateMyProfessor rating (0.0 - 5.0)",
        min_value: 0,
        max_value: 5,
        type: ApplicationCommandOptionType.Number
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

    if (focusedValue.name === "term") return interaction.respond(Cookie.getMostRecentTerms()?.map((term) => ({ name: getTermString(term), value: term })) ?? []);
    else if (focusedValue.name === "attribute")
      return interaction.respond(
        Cookie.attributes
          ?.filter((attribute) => (focusedValue.value ? attribute.name.toLowerCase().includes(focusedValue.value.toLowerCase()) : true))
          .map((attribute) => ({ name: attribute.name, value: attribute.code }))
          .slice(0, 25) ?? []
      );
    else if (focusedValue.name === "subject")
      return interaction.respond(
        Cookie.subjects
          ?.filter((subject) => (focusedValue.value ? subject.name.toLowerCase().includes(focusedValue.value.toLowerCase()) : true))
          .map((subject) => ({ name: subject.name, value: subject.code }))
          .slice(0, 25) ?? []
      );

    return interaction.respond([]);
  },
  async execute(interaction) {
    await interaction.deferReply();

    const [user, error] = tryCatch<{ uuid: string }>(() => db.prepare("SELECT uuid FROM users WHERE discord_id = ?").get(interaction.user.id) as any);
    if (!user) return void interaction.editReply({ content: `Create an account first: <${ENV.FRONTEND_URL}>` });
    if (error) return void interaction.editReply({ content: "An error occurred. Try again later" });

    // @ts-expect-error
    const options = interaction.options as CommandInteractionOptionResolver;
    const searchParams = getSearchParams(options);

    const [parsedClasses, total] = await getClassData(searchParams.term, searchParams);

    if (total === 0) return void interaction.editReply({ content: "No classes found matching your search criteria." });

    const paginationId = uuidv7();
    paginationState.set(paginationId, { userId: interaction.user.id, page: 1, total, params: searchParams });

    interaction.editReply({
      embeds: generateEmbed(1, total, parsedClasses),
      components: generateActionRow(1, total, paginationId)
    });
  }
} satisfies Command;
