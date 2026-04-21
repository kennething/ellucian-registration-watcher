import { fetchClasses, tryCatch } from "./utils/fetch";
import { CLIENT } from "../bot/src/common";
import express, { Router } from "express";
import { Cookie } from "./utils/cookie";
import { db } from "./utils/sqlite";
import cors from "cors";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";

const termStrings = {
  "10": "Winter",
  "20": "Spring",
  "60": "Summer",
  "90": "Fall"
} as const;

export async function startServer() {
  const app = express();
  app.use(cors()).use(express.json());

  const projectRoot = process.cwd();
  const routesDir = path.join(projectRoot, "server", "routes");
  fs.readdirSync(routesDir).forEach(async (file) => {
    if (!file.endsWith(".ts")) return;

    const routePath = path.join(routesDir, file);
    const router = (await import(pathToFileURL(routePath).href)).default as Router;
    app.use("/", router);
  });

  const port = Number(process.env.PORT) || 6969;
  app.listen(port, "0.0.0.0", () => console.log(`Server is up on port ${port}`));

  await Cookie.refreshCookie();

  const interval = 300 as const; // 5m interval
  const currentOffset = Math.ceil(Date.now() / 1000) % interval;
  setTimeout(() => {
    setInterval(async () => {
      const mostRecentTerms = Cookie.getMostRecentTerms();
      if (!mostRecentTerms) return;

      const [watchers, error] = tryCatch<{ owner_uuid: string; term_id: string; crn_list: string }[]>(
        () => db.prepare(`SELECT owner_uuid, term_id, crn_list FROM watchers WHERE term_id IN (${mostRecentTerms?.map(() => "?").join(", ")})`).all(...mostRecentTerms) as any
      );
      if (error) return;

      const terms = Array.from(new Set(watchers.map((watcher) => watcher.term_id)));
      const classes = await Promise.all(
        terms.map(async (term) => await fetchClasses(term, new Set(watchers.filter((watcher) => watcher.term_id === term).flatMap((watcher) => JSON.parse(watcher.crn_list) as string[]))))
      );

      for (const watcher of watchers) {
        const crnList = JSON.parse(watcher.crn_list) as string[];
        const termIndex = terms.findIndex((term) => term === watcher.term_id);
        const watchedClasses = classes[termIndex]?.filter((c) => crnList.includes(c.courseReferenceNumber));
        if (!watchedClasses) continue;

        const availableClasses = watchedClasses.filter((c) => c.seatsAvailable > 0);
        if (availableClasses.length === 0) continue;

        const user = await CLIENT.client?.users.fetch(watcher.owner_uuid);
        user?.send({
          content: `# Class Available!\nThe following classes are now available:\n${availableClasses.map((c) => `- ${c.subject} ${c.courseNumber} - ${c.courseTitle}`).join("\n")}`
        });
      }
    }, interval * 1000);
  }, currentOffset * 1000);

  setTimeout(
    () => {
      setInterval(async () => {
        const mostRecentTerms = Cookie.getMostRecentTerms();
        if (!mostRecentTerms) return;
        const mostRecentTermStrings = mostRecentTerms.map((term) => `${termStrings[term.slice(-2) as keyof typeof termStrings]} ${term.slice(0, -2)}`);

        db.prepare("DELETE FROM watchers WHERE delete_warning_date IS NOT NULL AND (delete_warning_date + 604800) < ?").run(Math.floor(Date.now() / 1000));

        const [outdatedWatchers, error] = tryCatch<{ owner_uuid: string }[]>(
          () =>
            db
              .prepare(`UPDATE watchers SET delete_warning_date = ? WHERE term_id NOT IN (${mostRecentTerms?.map(() => "?").join(", ")}) AND delete_warning_date IS NULL RETURNING owner_uuid`)
              .all(Math.floor(Date.now() / 1000), ...mostRecentTerms) as any
        );
        if (error) return;

        const uniqueUsers = new Set(outdatedWatchers.map((watcher) => watcher.owner_uuid));
        for (const user of uniqueUsers) {
          const discordUser = await CLIENT.client?.users.fetch(user);
          discordUser?.send({
            embeds: [
              {
                title: "A watcher is being removed",
                description: `One or more of your watchers is for an outdated term and will be automatically deleted in 7 days.\nWatchers for the ${mostRecentTermStrings.join(" and ")} term${mostRecentTermStrings.length > 1 ? "s" : ""} will not be affected.`,
                color: 0xff0000,
                footer: { text: "No action is required from you." },
                timestamp: new Date().toISOString()
              }
            ]
          });
        }
      }, 86400);
    },
    (Math.ceil(Date.now() / 1000) % 86400) * 1000
  );
}
