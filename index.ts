import * as events from "./server/events/index";
import { startServer } from "./server/app";
import { startBot } from "./bot/src/index";
import ENV from "./env";

import { db as _ } from "./server/utils/sqlite";

if (ENV.DISCORD_TOKEN) await startBot();
await startServer();

if (ENV.MATH_SCHEDULE_URL) events.fetchMathScheduleLoop();
if (ENV.RMP_SCHOOL_ID) events.fetchProfessorsLoop();
events.fetchSearchDataLoop();
events.purgeOutdatedLoop();
events.watchClassesLoop();
