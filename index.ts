import { startServer } from "./server/app";
import * as events from "./server/events";
import { startBot } from "./bot";
import ENV from "./utils/env";

import { db as _ } from "./db";

if (ENV.DISCORD_TOKEN) await startBot();
await startServer();

if (ENV.MATH_SCHEDULE_URL) events.fetchMathScheduleLoop();
if (ENV.RMP_SCHOOL_ID) events.fetchProfessorsLoop();
events.fetchSearchDataLoop();
events.purgeOutdatedLoop();
events.watchClassesLoop();
