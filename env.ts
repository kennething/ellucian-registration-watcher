import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as z from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, ".env"), quiet: true });

const UrlSchema = z
  .url({ protocol: /^https?$/ })
  .normalize()
  .refine((url) => !url.endsWith("/"), { message: "URLs should not end with a trailing slash" });

const ENV = z
  .object({
    NODE_ENV: z.enum(["development", "production"]).default("development"),

    BACKEND_URL: UrlSchema,
    PORT: z.coerce.number().int().positive().default(6969),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("warn"),
    MAX_REQUEST_CLIENTS: z.coerce.number().int().positive().default(10),
    CLIENT_LIFETIME: z.coerce.number().int().positive().default(1200),
    DATABASE_PATH: z.string().default("./server/db.sqlite3"),
    BACKUP_DATABASE_PATH: z.string().default("./server"),
    TIMEZONE: z.string().default("America/New_York"),
    BANNER_API_URL: UrlSchema,
    RMP_SCHOOL_ID: z.coerce.number().int().positive().optional(),
    MATH_SCHEDULE_URL: UrlSchema.optional(),
    USER_WATCHER_LIMIT: z.coerce.number().int().positive().default(67),
    USER_SCHEDULE_LIMIT: z.coerce.number().int().positive().default(10),

    NOTIFICATION_COOLDOWN: z.coerce.number().int().positive().default(43200),
    CLASS_FETCH_INTERVAL: z.coerce.number().int().nonnegative().default(600),
    CLASS_FETCH_OFFSET: z.coerce.number().int().nonnegative().default(50),
    CLASS_HISTORY_24H_ENTRIES: z.coerce.number().int().positive().default(72),
    CLASS_HISTORY_7D_ENTRIES: z.coerce.number().int().positive().default(28),
    CLASS_HISTORY_28D_ENTRIES: z.coerce.number().int().positive().default(28),
    SEARCH_FETCH_INTERVAL: z.coerce.number().int().nonnegative().default(14400),
    SEARCH_FETCH_OFFSET: z.coerce.number().int().nonnegative().default(360),
    OUTDATED_PURGE_INTERVAL: z.coerce.number().int().nonnegative().default(86400),
    OUTDATED_PURGE_OFFSET: z.coerce.number().int().nonnegative().default(0),
    WATCHER_PURGE_NOTICE: z.coerce.number().int().positive().default(604800),
    RMP_FETCH_INTERVAL: z.coerce.number().int().nonnegative().default(604800),
    RMP_FETCH_OFFSET: z.coerce.number().int().nonnegative().default(300),
    MATH_FETCH_INTERVAL: z.coerce.number().int().nonnegative().default(86400),
    MATH_FETCH_OFFSET: z.coerce.number().int().nonnegative().default(32400),

    DISCORD_TOKEN: z.string().optional(),
    APPLICATION_ID: z.string().optional(),
    PRIMARY_COLOR: z.coerce.number().int().nonnegative().default(0x065942),
    ERROR_COLOR: z.coerce.number().int().nonnegative().default(0xff0000),
    SEARCH_PAGE_SIZE: z.coerce.number().int().positive().default(4),
    PAGINATION_TIMEOUT: z.coerce.number().int().positive().default(900),

    FRONTEND_URL: UrlSchema.optional(),
    DISCORD_CLIENT_ID: z.string().optional(),
    DISCORD_CLIENT_SECRET: z.string().optional(),
    JWT_SECRET: z.string().optional()
  })
  .superRefine((env, ctx) => {
    const someMissing = <T>(fields: T[]) => fields.some((field) => field === undefined);

    if (env.DISCORD_TOKEN && !env.APPLICATION_ID)
      ctx.addIssue({
        code: "custom",
        message: "APPLICATION_ID must be provided if DISCORD_TOKEN is set"
      });

    if (env.FRONTEND_URL && someMissing([env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET]))
      ctx.addIssue({
        code: "custom",
        message: "DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET must be provided if FRONTEND_URL is set"
      });
  })
  .parse(process.env);

export default ENV;
