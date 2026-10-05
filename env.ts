import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as z from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, ".env"), quiet: true });

const Integer = z.coerce.number().int();

const UrlSchema = z
  .url({ protocol: /^https?$/ })
  .normalize()
  .refine((url) => !url.endsWith("/"), { message: "URLs should not end with a trailing slash" });

const ENV = z
  .object({
    NODE_ENV: z.enum(["development", "production"]).default("development"),

    // * General
    /** URL with protocol, don't append `/`. */
    BACKEND_URL: UrlSchema,
    /**
     * Port to run the server on.
     * @default 6969
     */
    PORT: Integer.positive().default(6969),
    /**
     * `debug`, `info`, `warn`, or `error`.
     * @default "warn"
     */
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("warn"),
    /**
     * Maximum number of watchers a user can create.
     * @default 67
     */
    USER_WATCHER_LIMIT: Integer.positive().default(67),
    /**
     * Maximum number of schedules a user can create.
     * @default 10
     */
    USER_SCHEDULE_LIMIT: Integer.positive().default(10),
    /**
     * Timezone to use for all date/time operations.
     * @see https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
     * @default "America/New_York"
     */
    TIMEZONE: z.string().default("America/New_York"),
    /** URL with protocol to your university's course catalog, don't append `/`. */
    BANNER_API_URL: UrlSchema,
    /**
     * ID of your school on Rate My Professors.
     * @see https://www.ratemyprofessors.com
     *
     * Find this by searching for your school and looking at the URL.
     */
    RMP_SCHOOL_ID: Integer.positive().optional(),
    /** You probably don't have this but the URL to the math course schedule for your school, don't append `/`. */
    MATH_SCHEDULE_URL: UrlSchema.optional(),
    /**
     * Maximum number of concurrent request clients to use for fetching data from the Banner API.
     *
     * Clients cannot be used concurrently so requests are queued if all are busy.
     * @default 10
     */
    MAX_REQUEST_CLIENTS: Integer.positive().default(10),
    /**
     * Number of requests in the lowest request client's queue before a new client is created.
     * @default 0
     */
    NEW_REQUEST_CLIENT_THRESHOLD: Integer.nonnegative().default(0),
    /**
     * Inactivity time, in seconds, of a request client before it's deleted.
     * @default 1200
     */
    CLIENT_LIFETIME: Integer.positive().default(1200),
    /**
     * Path to the SQLite database file.
     *
     * If the database file doesn't exist, a new one will be created.
     * @default "./server/db.sqlite3"
     */
    DATABASE_PATH: z.string().default("./server/db.sqlite3"),
    /**
     * Path to a folder where the database will be backed up before watchers are purged.
     * @default "./server"
     */
    BACKUP_DATABASE_PATH: z.string().default("./server"),

    // * Automation
    /**
     * Number of entries to log in the class history over the last 24 hours. This should be an interval of `CLASS_FETCH_INTERVAL`.
     * @default 72 // once per 20 minutes
     */
    CLASS_HISTORY_24H_ENTRIES: Integer.positive().default(72),
    /**
     * Number of entries to log in the class history over the last 7 days. This should be an interval of `CLASS_FETCH_INTERVAL`.
     * @default 28 // once per 6 hours
     */
    CLASS_HISTORY_7D_ENTRIES: Integer.positive().default(28),
    /**
     * Number of entries to log in the class history over the last 28 days. This should be an interval of `CLASS_FETCH_INTERVAL`.
     * @default 28 // once per 1 day
     */
    CLASS_HISTORY_28D_ENTRIES: Integer.positive().default(28),

    // * Class Scraping
    /**
     * Interval, in seconds, to fetch new class data.
     *
     * Set to `0` to disable class fetching. Set to `-1` to run once, immediately.
     * @default 600 // 10 minutes
     */
    CLASS_FETCH_INTERVAL: Integer.min(-1).default(600),
    /**
     * Offset, in seconds, to wait before fetching new class data.
     * @default 50
     */
    CLASS_FETCH_OFFSET: Integer.nonnegative().default(50),
    /**
     * Cooldown, in seconds, to wait before sending another notification for the same watcher to the same user.
     * @default 43200 // 12 hours
     */
    NOTIFICATION_COOLDOWN: Integer.positive().default(43200),

    // * Search Scraping
    /**
     * Interval, in seconds, to fetch new search data.
     *
     * Set to `0` to disable search fetching. Set to `-1` to run once, immediately.
     * @default 14400 // 4 hours
     */
    SEARCH_FETCH_INTERVAL: Integer.min(-1).default(14400),
    /**
     * Offset, in seconds, to wait before fetching new search data.
     * @default 360 // 6 minutes
     */
    SEARCH_FETCH_OFFSET: Integer.nonnegative().default(360),

    // * New Term Detection
    /**
     * Interval, in seconds, to check for new terms.
     *
     * Set to `0` to disable new term detection. Set to `-1` to run once, immediately.
     * @default 604800 // 7 days
     */
    NEW_TERMS_INTERVAL: Integer.min(-1).default(604800),
    /**
     * Offset, in seconds, to wait before checking for new terms.
     * @default 64800 (18 hours)
     */
    NEW_TERMS_OFFSET: Integer.nonnegative().default(64800),

    // * Purging
    /**
     * Interval, in seconds, to search for outdated watchers and tables.
     *
     * Set to `0` to disable watcher purging. Set to `-1` to run once, immediately.
     * @default 86400 // 1 day
     */
    OUTDATED_PURGE_INTERVAL: Integer.min(-1).default(86400),
    /**
     * Offset, in seconds, to wait before searching for outdated watchers and tables.
     * @default 0
     */
    OUTDATED_PURGE_OFFSET: Integer.nonnegative().default(0),
    /**
     * Number of seconds to wait before purging outdated watchers after the term has ended. This should be an interval of `OUTDATED_PURGE_INTERVAL`.
     * @default 604800 // 7 days
     */
    WATCHER_PURGE_NOTICE: Integer.positive().default(604800),

    // * RateMyProfessors Scraping
    /**
     * Interval, in seconds, to fetch new RateMyProfessors data.
     *
     * Set to `0` to disable RateMyProfessors fetching. Set to `-1` to run once, immediately.
     * @default 604800 // 7 days
     */
    RMP_FETCH_INTERVAL: Integer.min(-1).default(604800),
    /**
     * Offset, in seconds, to wait before fetching new Rate My Professors data.
     * @default 300 // 5 minutes
     */
    RMP_FETCH_OFFSET: Integer.nonnegative().default(300),

    // * Other
    /**
     * Interval, in seconds, to fetch new math course schedule data.
     *
     * Set to `0` to disable math course schedule fetching. Set to `-1` to run once, immediately.
     * @default 86400 // 1 day
     */
    MATH_FETCH_INTERVAL: Integer.min(-1).default(86400),
    /**
     * Offset, in seconds, to wait before fetching new math course schedule data.
     * @default 32400 // 9 hours
     */
    MATH_FETCH_OFFSET: Integer.nonnegative().default(32400),

    // * Discord Bot
    /** Token of your Discord bot. */
    DISCORD_TOKEN: z.string().optional(),
    /** Application ID of your Discord bot. */
    APPLICATION_ID: z.string().optional(),
    /**
     * Hex color code for the primary container color.
     * @default 0x065942
     */
    PRIMARY_COLOR: Integer.nonnegative().default(0x065942),
    /**
     * Hex color code for the error container color.
     * @default 0xff0000
     */
    ERROR_COLOR: Integer.nonnegative().default(0xff0000),
    /**
     * Number of search results to show per page of `/search`.
     *
     * Max of `25` due to Discord limit.
     * @default 4
     */
    SEARCH_PAGE_SIZE: Integer.positive().max(25).default(4),
    /**
     * Number of seconds to wait before expiring a pagination state.
     * @default 900 // 15 minutes
     */
    PAGINATION_TIMEOUT: Integer.positive().default(900),

    // * Frontend
    /** URL with protocol, don't append `/`. */
    FRONTEND_URL: UrlSchema.optional(),
    /** Client ID of your Discord bot, used for Discord OAuth2. */
    DISCORD_CLIENT_ID: z.string().optional(),
    /** Client secret of your Discord bot, used for Discord OAuth2. */
    DISCORD_CLIENT_SECRET: z.string().optional(),
    /** Secret for generating JWT tokens, used for authentication - technically can be any string but like cmon. */
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
