import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as z from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, ".env") });

const UrlSchema = z
  .url({ protocol: /^https?$/ })
  .normalize()
  .refine((url) => !url.endsWith("/"), { message: "URLs should not end with a trailing slash" });

const ENV = z
  .object({
    NODE_ENV: z.enum(["development", "production"]).default("development"),

    BACKEND_URL: UrlSchema,
    PORT: z.coerce.number().int().positive().default(6969),
    DATABASE_PATH: z.string().default("./server/db.sqlite3"),
    BACKUP_DATABASE_PATH: z.string().default("./server"),
    BANNER_API_URL: UrlSchema,
    RMP_SCHOOL_ID: z.coerce.number().int().positive().optional(),
    MATH_SCHEDULE_URL: UrlSchema.optional(),
    USER_WATCHER_LIMIT: z.coerce.number().int().positive().default(67),
    USER_SCHEDULE_LIMIT: z.coerce.number().int().positive().default(5),

    NOTIFICATION_COOLDOWN: z.coerce.number().int().positive().default(43200),
    CLASS_FETCH_INTERVAL: z.coerce.number().int().positive().default(600),
    CLASS_FETCH_OFFSET: z.coerce.number().int().nonnegative().default(50),
    CLASS_HISTORY_24H_ENTRIES: z.coerce.number().int().positive().default(72),
    CLASS_HISTORY_28D_ENTRIES: z.coerce.number().int().positive().default(28),
    WATCHER_PURGE_INTERVAL: z.coerce.number().int().positive().default(86400),
    WATCHER_PURGE_OFFSET: z.coerce.number().int().nonnegative().default(0),
    RMP_FETCH_INTERVAL: z.coerce.number().int().positive().default(604800),
    RMP_FETCH_OFFSET: z.coerce.number().int().nonnegative().default(300),
    MATH_FETCH_INTERVAL: z.coerce.number().int().positive().default(86400),
    MATH_FETCH_OFFSET: z.coerce.number().int().nonnegative().default(32400),

    DISCORD_TOKEN: z.string().optional(),
    APPLICATION_ID: z.string().optional(),

    FRONTEND_URL: UrlSchema.optional(),
    DISCORD_CLIENT_ID: z.string().optional(),
    DISCORD_CLIENT_SECRET: z.string().optional(),
    JWT_SECRET: z.string().optional()
  })
  .parse(process.env);

export default ENV;
