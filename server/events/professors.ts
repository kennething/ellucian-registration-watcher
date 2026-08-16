import { waitForInterval } from "../utils/functions";
import { getRMPData } from "../utils/rmp";
import { Cookie } from "../utils/cookie";
import { db } from "../utils/sqlite";
import ENV from "../../env";
import Fuse from "fuse.js";

export function fetchProfessorsLoop(): void {
  waitForInterval(ENV.RMP_FETCH_INTERVAL, ENV.RMP_FETCH_OFFSET, async () => {
    const rmpProfessors = (await getRMPData()).map((professor) => ({
      ...professor,
      sortedName: professor.name
        .replaceAll(/,|\.|\-/g, " ")
        .split(" ")
        .filter((w) => w.length > 1)
        .sort()
        .join(" ")
    }));
    // ! bing professor id isnt consistent ??
    const bingProfessors = (
      await Cookie.requestClient.get<{ code: string; description: string }[]>(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/get_instructor?searchTerm=&term=202690&offset=1&max=2000`)
    ).data.map((professor) => ({
      ...professor,
      sortedName: professor.description
        .replaceAll(/,|\.|\-|\([A-Za-z]{1,3}\/[A-Za-z]{1,3}\)/g, " ")
        .split(" ")
        .filter((w) => w.length > 1)
        .sort()
        .join(" ")
    }));

    const searcher = new Fuse(rmpProfessors, { useTokenSearch: true, tokenMatch: "all", keys: ["name"], threshold: 0.25, shouldSort: true, ignoreDiacritics: true });

    const finalProfessors = bingProfessors.map((professor) => {
      const result = searcher.search(professor.description);
      const match = result[0]?.item;

      return {
        school_id: professor.code,
        school_name: professor.description,
        rmp_id: match?.id ?? null,
        rmp_name: match?.name ?? null,
        overall_rating: match?.overall_rating ?? null,
        num_ratings: match?.num_ratings ?? null,
        percent_take_again: match?.percent_take_again ?? null,
        level_of_difficulty: match?.level_of_difficulty ?? null
      };
    });

    db.transaction(() => {
      db.prepare("DELETE FROM professors").run();

      const columns = Object.keys(finalProfessors[0]);
      const statement = db.prepare(`INSERT INTO professors (${columns.join(", ")}) VALUES (${columns.map((c) => `@${c}`).join(", ")})`);
      for (const professor of finalProfessors) statement.run(professor);
    })();

    console.log(`${new Date().toLocaleString()}: Fetched ${finalProfessors.length} professors from RMP and Binghamton`);
  });
}
