import { wrapper } from "axios-cookiejar-support";
import { ClientManager } from "./clientManager";
import { decodeHTML } from "entities/decode";
import { CookieJar } from "tough-cookie";
import { Term, TermId } from "./term";
import Database from "better-sqlite3";
import { ClassData } from "./types";
import ENV from "../../env";
import { Log } from "./log";
import axios from "axios";
import path from "path";
import fs from "fs";

const dbPath = path.resolve(ENV.DATABASE_PATH);

if (!fs.existsSync(dbPath)) {
  Log.warn(`Database file not found at ${dbPath}. Creating a new database file.`);
  fs.writeFileSync(dbPath, "");
}

export const db = new Database(dbPath, { fileMustExist: true });
db.pragma("journal_mode = WAL");
process.on("exit", () => db.close());

db.exec(/* sql */ `
CREATE TABLE IF NOT EXISTS terms (
  term_id    TEXT    PRIMARY KEY
                      UNIQUE
                      NOT NULL,
  is_primary INTEGER NOT NULL,
  is_early   INTEGER NOT NULL
                      DEFAULT (0),
  delete_timestamp INTEGER
);

CREATE TABLE IF NOT EXISTS subjects (
  name TEXT NOT NULL,
  code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attributes (
    name       TEXT    NOT NULL,
    code       TEXT    NOT NULL,
    is_special INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
    short TEXT NOT NULL,
    long  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_history (
  crn             TEXT    PRIMARY KEY
                          UNIQUE
                          NOT NULL,
  term_id         TEXT    NOT NULL,
  [24h_timestamp] INTEGER NOT NULL,
  [7d_timestamp]  INTEGER NOT NULL,
  [28d_timestamp] INTEGER NOT NULL,
  seat_24h        TEXT   NOT NULL, -- json array
  seat_7d         TEXT   NOT NULL, -- json array
  seat_28d        TEXT   NOT NULL, -- json array
  wait_24h        TEXT,            -- json array
  wait_7d         TEXT,            -- json array
  wait_28d        TEXT             -- json array
);

CREATE TABLE IF NOT EXISTS professors (
  school_id           INTEGER NOT NULL
                              PRIMARY KEY
                              UNIQUE,
  school_name         TEXT    NOT NULL,
  rmp_id              INTEGER,
  rmp_name            TEXT,
  overall_rating      REAL,
  num_ratings         INTEGER,
  percent_take_again  REAL,
  level_of_difficulty REAL
);

CREATE TABLE IF NOT EXISTS schedules (
  uuid       TEXT    NOT NULL
                      UNIQUE
                      PRIMARY KEY,
  owner_uuid TEXT    NOT NULL
                      REFERENCES users (uuid) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  name       TEXT    NOT NULL,
  term_id    TEXT    NOT NULL,
  crns       TEXT               -- json array
);

CREATE TABLE IF NOT EXISTS users (
  uuid       TEXT    NOT NULL
                      UNIQUE
                      PRIMARY KEY,
  discord_id TEXT    NOT NULL
                      UNIQUE,
  created_at INTEGER NOT NULL,
  web_theme  INTEGER DEFAULT (0) 
                      NOT NULL
);

CREATE TABLE IF NOT EXISTS watchers (
  uuid              TEXT    UNIQUE
                            PRIMARY KEY
                            NOT NULL,
  owner_uuid        TEXT    NOT NULL
                            REFERENCES users (uuid) ON DELETE CASCADE,
  is_active         INTEGER NOT NULL,
  last_notified     INTEGER,
  created_at        INTEGER NOT NULL,
  term_id           TEXT    NOT NULL,
  crn               TEXT    NOT NULL,
  notify_when       INTEGER NOT NULL,
  notify_when_value INTEGER NOT NULL
);
`);

/** gets terms, subjects, and attributes from banner
 *
 * stores new values in db and updates `ClientManager` data members */
export async function refreshConstantData() {
  const requestClient = wrapper(axios.create({ jar: new CookieJar() }));

  const terms = (await requestClient.get<{ code: string; description: string }[]>(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/getTerms?searchTerm=&offset=1&max=2`)).data;
  Term.latestTermId = terms[0].code as TermId;
  let subjects = (
    await requestClient.get<{ code: string; description: string }[]>(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/get_subject?searchTerm=&term=${terms[0].code}&offset=1&max=500`)
  ).data;
  subjects = subjects.map((subject) => ({ code: subject.code, description: decodeHTML(subject.description).split("-").join(" - ") }));
  const attributes = (
    await requestClient.get<{ code: string; description: string }[]>(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/get_attribute?searchTerm=&term=${terms[0].code}&offset=1&max=100`)
  ).data;
  let specialAttributes = (
    await requestClient.get<{ code: string; description: string }[]>(
      `${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/get_specialAttribute?searchTerm=&term=${terms[0].code}&offset=1&max=50`
    )
  ).data;
  specialAttributes = specialAttributes.map((attribute) => ({ code: attribute.code, description: attribute.description.split("-").join(" - ") }));

  const primaryTermCode = terms.find((term) => term.code.slice(4) === "20" || term.code.slice(4) === "90")!;
  const primaryTerm = new Term(primaryTermCode.code);

  const offTermCode = terms.indexOf(primaryTermCode) === 0 ? null : terms.find((term) => term.code !== primaryTermCode?.code)!;

  const formData = new FormData();
  formData.append("term", primaryTerm.nextTermId());
  formData.append("studyPath", "");
  formData.append("studyPathText", "");
  formData.append("startDatepicker", "");
  formData.append("endDatepicker", "");
  await requestClient.post(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/term/search?mode=search`, formData);
  const earlyOffTermCode = (await requestClient.get(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/searchResults/searchResults?pageOffset=0&pageMaxSize=1&txt_term=${primaryTerm.nextTermId()}`))
    .data as { data: ClassData[] | null; totalCount: number };
  const hasEarlyOffTerm = earlyOffTermCode.data && earlyOffTermCode.totalCount > 0;

  const earlyPrimaryTermCode = hasEarlyOffTerm
    ? ((await requestClient.get(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/searchResults/searchResults?pageOffset=0&pageMaxSize=1&txt_term=${primaryTerm.nextPrimaryTermId()}`)).data as {
        data: ClassData[] | null;
        totalCount: number;
      })
    : null;
  const hasEarlyPrimaryTerm = earlyPrimaryTermCode?.data && earlyPrimaryTermCode.totalCount > 0;

  const allTerms = [
    primaryTerm,
    offTermCode ? new Term(offTermCode.code) : null,
    hasEarlyOffTerm ? new Term(primaryTerm.nextTermId()) : null,
    hasEarlyPrimaryTerm ? new Term(primaryTerm.nextPrimaryTermId()) : null
  ].filter((term): term is Term => term !== null);

  db.transaction(() => {
    const remainingTerms = db.prepare("DELETE FROM terms WHERE delete_timestamp IS NULL RETURNING term_id").all() as { term_id: TermId }[];
    db.prepare("DELETE FROM subjects").run();
    db.prepare("DELETE FROM attributes").run();

    const termsToInsert = allTerms.filter((term) => !remainingTerms.some((remainingTerm) => remainingTerm.term_id === term.termId));
    const insertTermStatement = db.prepare("INSERT INTO terms (term_id, is_primary, is_early) VALUES (?, ?, ?)");
    for (const term of termsToInsert) insertTermStatement.run(term.termId, Number(term.isPrimary), Number(term.isEarly));

    const insertSubjectStatement = db.prepare("INSERT INTO subjects (code, name) VALUES (?, ?)");
    for (const subject of subjects) insertSubjectStatement.run(subject.code, subject.description);

    const insertAttributeStatement = db.prepare("INSERT INTO attributes (code, name, is_special) VALUES (?, ?, ?)");
    for (const attribute of attributes) insertAttributeStatement.run(attribute.code, attribute.description, 0);
    for (const attribute of specialAttributes) insertAttributeStatement.run(attribute.code, attribute.description, 1);
  })();

  ClientManager.setClients(
    primaryTerm.termId,
    allTerms.map((term) => term.termId)
  );
  ClientManager.terms = allTerms;
  ClientManager.subjects = subjects.map((subject) => ({ code: subject.code, name: subject.description }));
  ClientManager.attributes = attributes.map((attribute) => ({ code: attribute.code, name: attribute.description, isSpecial: false }));
  ClientManager.attributes.push(...specialAttributes.map((attribute) => ({ code: attribute.code, name: attribute.description, isSpecial: true })));
  ClientManager.attributes.sort((a, b) => a.name.localeCompare(b.name));
  ClientManager.locations = db.prepare("SELECT DISTINCT short, long FROM locations").all() as { short: string; long: string }[];

  Log.info(`Refreshed constant data: ${allTerms.length} terms, ${subjects.length} subjects, ${attributes.length} attributes, ${specialAttributes.length} special attributes`);
}
await refreshConstantData();

Log.debug("initiated db connection");
