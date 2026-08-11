import { requestSearchClasses, tryCatch } from "../../../server/utils/fetch.ts";
import { getTermString } from "../../../server/utils/functions.ts";
import { ClassData } from "../../../server/utils/types.ts";
import { db } from "../../../server/utils/sqlite.ts";
import type { Command } from "./index.ts";
import { createCanvas } from "canvas";
import ENV from "../../../env.ts";
import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  AttachmentBuilder,
  ButtonStyle,
  CommandInteractionOptionResolver,
  ComponentType,
  InteractionContextType,
  MessageFlags
} from "discord.js";

type MiniClassData = {
  subject: string;
  courseNumber: string;
  sequenceNumber: string;
  startTime: ClassData["meetingsFaculty"][0]["meetingTime"]["beginTime"];
  endTime: ClassData["meetingsFaculty"][0]["meetingTime"]["endTime"];
  meetingsFaculty: ClassData["meetingsFaculty"];
  faculty: ClassData["faculty"];
  rmpRating: number | null;
};

const TIME_WIDTH = 100 as const;
const DAY_WIDTH = 250 as const;
const HEADER_HEIGHT = 60 as const;
const SLOT_HEIGHT = 25 as const;

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

const GRID_HEIGHT = 60 * SLOT_HEIGHT;
const WIDTH = TIME_WIDTH + DAYS.length * DAY_WIDTH;
const HEIGHT = HEADER_HEIGHT + GRID_HEIGHT;

const SCHEDULE_START = 8 * 60;

function timeToMinutes(time: ClassData["meetingsFaculty"][0]["meetingTime"]["beginTime"]) {
  const hours = parseInt(time?.slice(0, 2) ?? "0");
  const minutes = parseInt(time?.slice(2, 4) ?? "0");
  return hours * 60 + minutes;
}

function timeToY(minutes: number) {
  return HEADER_HEIGHT + ((minutes - SCHEDULE_START) / 15) * SLOT_HEIGHT;
}

function getTimeLabel(minutes: number) {
  let hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  const amPm = hours >= 12 ? "PM" : "AM";

  if (hours === 0) hours = 12;
  if (hours > 12) hours -= 12;

  return `${hours}:${mins.toString().padStart(2, "0")}${mins === 0 ? ` ${amPm}` : ""}`;
}

function getCourseColor(course: MiniClassData) {
  const str = `${course.subject}${course.courseNumber}${course.sequenceNumber}`;

  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  const hue = (hash >>> 0) % 360;
  const saturation = 60 + ((hash >>> 8) % 21);
  const lightness = 70 + ((hash >>> 16) % 11);

  const hslToHex = (h: number, s: number, l: number) => {
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0,
      g = 0,
      b = 0;

    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];

    const toHex = (v: number) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0");

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };
  return hslToHex(hue, saturation, lightness);
}

export default {
  data: {
    name: "schedule",
    description: "View your schedules",
    contexts: [InteractionContextType.PrivateChannel, InteractionContextType.BotDM, InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.UserInstall],
    options: [
      {
        name: "schedule",
        description: "The schedule to view. If not provided, the first schedule will be used.",
        max_length: 100,
        type: ApplicationCommandOptionType.String,
        autocomplete: true
      },
      {
        name: "share",
        description: "If provided, the schedule will not be displayed as an ephemeral message.",
        type: ApplicationCommandOptionType.Boolean
      }
    ]
  },
  async autocomplete(interaction) {
    const [user, error] = tryCatch<{ uuid: string }>(() => db.prepare("SELECT uuid FROM users WHERE discord_id = ?").get(interaction.user.id) as any);
    if (!user || error) return void interaction.respond([]);

    const [schedules, error2] = tryCatch<{ uuid: string; name: string }[]>(() => db.prepare("SELECT uuid, name FROM schedules WHERE owner_uuid = ?").all(user.uuid) as any);
    if (error2) return void interaction.respond([]);

    const focusedOption = interaction.options.getFocused(true);
    const filteredSchedules = schedules.filter((schedule) => schedule.name.toLowerCase().includes(focusedOption.value.toLowerCase()));
    const choices = filteredSchedules.map((schedule) => ({ name: schedule.name, value: schedule.uuid }));
    interaction.respond(choices.slice(0, 25));
  },
  async execute(interaction) {
    // @ts-expect-error
    const options = interaction.options as CommandInteractionOptionResolver;

    await interaction.deferReply({ flags: options.getBoolean("share") ? undefined : MessageFlags.Ephemeral });

    const [user, error] = tryCatch<{ uuid: string }>(() => db.prepare("SELECT uuid FROM users WHERE discord_id = ?").get(interaction.user.id) as any);
    if (!user) return void interaction.editReply({ content: `Sign up first! ${ENV.FRONTEND_URL}` });
    if (error) return void interaction.editReply({ content: "An error occurred while fetching your schedules. Try again later" });

    let schedule: { uuid: string; term_id: string; name: string; crns: string[] } | undefined;

    const scheduleUuid = options.getString("name");
    if (!scheduleUuid) {
      const [fetchedSchedule, error2] = tryCatch<{ uuid: string; term_id: string; name: string; crns: string }>(
        () => db.prepare("SELECT uuid, term_id, name, crns FROM schedules WHERE owner_uuid = ?").get(user.uuid) as any
      );
      if (error2) return void interaction.editReply({ content: "An error occurred while fetching your schedules. Try again later" });
      if (!fetchedSchedule) return void interaction.editReply({ content: "You don't have any schedules yet. Create one first!" });
      schedule = { ...fetchedSchedule, crns: JSON.parse(fetchedSchedule.crns) as string[] };
    } else {
      const [fetchedSchedule, error2] = tryCatch<{ term_id: string; name: string; crns: string }>(
        () => db.prepare("SELECT term_id, name, crns FROM schedules WHERE owner_uuid = ? AND uuid = ?").get(user.uuid, scheduleUuid) as any
      );
      if (error2) return void interaction.editReply({ content: "An error occurred while fetching your schedules. Try again later" });
      if (!fetchedSchedule) return void interaction.editReply({ content: "This schedule doesn't exist." });
      schedule = { ...fetchedSchedule, uuid: scheduleUuid, crns: JSON.parse(fetchedSchedule.crns) as string[] };
    }

    if (schedule.crns.length === 0) return void interaction.editReply({ content: "This schedule is empty. Add some classes first!" });

    const classData = await requestSearchClasses(schedule.term_id, { crn: schedule.crns.join(" OR ") }, 0, ENV.USER_WATCHER_LIMIT);
    const classes = classData[0] as ClassData[];

    const parsedClasses: MiniClassData[] = [];
    classes.forEach((c) => {
      const professor = c.faculty.find((f) => f.primaryIndicator);
      const [rmpData, error] = professor
        ? tryCatch<{ rmp_id: number; overall_rating: number; num_ratings: number; percent_take_again: number; level_of_difficulty: number }>(
            () => db.prepare("SELECT rmp_id, overall_rating, num_ratings, percent_take_again, level_of_difficulty FROM professors WHERE school_name = ?").get(professor.displayName) as any
          )
        : [];
      if (error) return console.error(error);

      parsedClasses.push({
        subject: c.subject,
        courseNumber: c.courseNumber,
        sequenceNumber: c.sequenceNumber,
        startTime: c.meetingsFaculty[0]?.meetingTime.beginTime,
        endTime: c.meetingsFaculty[0]?.meetingTime.endTime,
        meetingsFaculty: c.meetingsFaculty,
        faculty: c.faculty,
        rmpRating: rmpData?.overall_rating ?? null
      });
    });

    const canvas = createCanvas(WIDTH, HEIGHT);
    (() => {
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#1a1a1e";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.fillStyle = "#afe696";
      ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);

      ctx.fillStyle = "#0b1308";
      ctx.font = "bold 24px Inter";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      DAYS.forEach((day, i) => {
        const x = TIME_WIDTH + i * DAY_WIDTH + DAY_WIDTH / 2;
        ctx.fillText(day.charAt(0).toUpperCase() + day.slice(1), x, HEADER_HEIGHT / 2);
      });

      ctx.strokeStyle = "#474f5a";
      ctx.lineWidth = 1;
      for (let i = 0; i <= GRID_HEIGHT / SLOT_HEIGHT; i++) {
        const y = HEADER_HEIGHT + i * SLOT_HEIGHT;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }

      for (let i = 0; i <= DAYS.length; i++) {
        const x = TIME_WIDTH + i * DAY_WIDTH;
        ctx.beginPath();
        ctx.moveTo(x, HEADER_HEIGHT);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }

      ctx.fillStyle = "#b5c9d2";
      ctx.font = "16px Inter";
      ctx.textAlign = "left";

      for (let i = 0; i < GRID_HEIGHT / SLOT_HEIGHT; i++) {
        const minutes = SCHEDULE_START + i * 15;
        const y = HEADER_HEIGHT + i * SLOT_HEIGHT + 15;

        if (minutes % 60 === 0) ctx.font = "bold 16px Inter";
        else ctx.font = "16px Inter";

        ctx.fillText(getTimeLabel(minutes), 10, y);
      }

      for (const course of parsedClasses) {
        const color = getCourseColor(course);

        const start = timeToMinutes(course.meetingsFaculty[0]?.meetingTime.beginTime);
        const end = timeToMinutes(course.meetingsFaculty[0]?.meetingTime.endTime);

        const y = timeToY(start);
        const height = timeToY(end) - y;

        DAYS.forEach((day, i) => {
          if (!course.meetingsFaculty[0]?.meetingTime[day]) return;

          const x = TIME_WIDTH + i * DAY_WIDTH;

          ctx.fillStyle = color;
          ctx.fillRect(x + 4, y + 2, DAY_WIDTH - 8, height - 4);

          ctx.fillStyle = "#000000";
          ctx.font = "bold 18px Inter";
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText(`${course.subject} ${course.courseNumber} - ${course.sequenceNumber}`, x + 12, y + 10, DAY_WIDTH - 24);

          ctx.font = "14px Inter";
          const professor = course.faculty[0];
          if (professor) ctx.fillText(`${professor.displayName.split(",").reverse().join(" ")}${course.rmpRating ? ` (${course.rmpRating.toFixed(1)}/5)` : ""}`, x + 12, y + 34, DAY_WIDTH - 24);

          const startHour = Number(course.startTime?.slice(0, 2));
          const startMinutes = Number(course.startTime?.slice(2, 4));
          const endHour = Number(course.endTime?.slice(0, 2));
          const endMinutes = Number(course.endTime?.slice(2, 4));
          const sameAmpm = startHour < 12 === endHour < 12;

          let startStr = `${String(startHour > 12 ? startHour - 12 : startHour).padStart(2, "0")}:${startMinutes.toString().padStart(2, "0")}`;
          if (!sameAmpm) startStr += startHour < 12 ? " AM" : " PM";

          const meetingTimeString = `${startStr} - ${endHour > 12 ? endHour - 12 : endHour}:${endMinutes.toString().padStart(2, "0")} ${endHour < 12 ? "AM" : "PM"}`;
          ctx.fillText(`${meetingTimeString}`, x + 12, y + (professor ? 54 : 34), DAY_WIDTH - 24);

          ctx.fillText(`${course.meetingsFaculty[0]?.meetingTime.building} ${course.meetingsFaculty[0]?.meetingTime.room}`, x + 12, y + (professor ? 74 : 54), DAY_WIDTH - 24);
        });
      }
    })();

    const buffer = canvas.toBuffer("image/png");
    await interaction.editReply({
      content: `${getTermString(schedule.term_id)} - ${classes.reduce((acc, course) => acc + course.meetingsFaculty[0]?.meetingTime.creditHourSession || 0, 0)} credits`,
      files: [new AttachmentBuilder(buffer, { name: `${schedule.name}.png` })],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Link,
              label: "View on Web",
              url: `${ENV.FRONTEND_URL}/schedules/${schedule.uuid}`
            }
          ]
        }
      ]
    });
  }
} satisfies Command;
