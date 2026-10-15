import { ClientManager } from "../utils/clientManager";
import { wrapper } from "axios-cookiejar-support";
import { decodeHTML } from "entities/decode";
import { Term, TermId } from "../utils/term";
import { ClassData } from "../utils/types";
import { Database } from "better-sqlite3";
import { CookieJar } from "tough-cookie";
import { Log } from "../utils/log";
import ENV from "../utils/env";
import axios from "axios";

/** gets terms, subjects, and attributes from banner
 *
 * stores new values in db and updates `ClientManager` data members */
export async function refreshConstantData(db: Database) {
  const requestClient = wrapper(axios.create({ jar: new CookieJar() }));

  const terms = (await requestClient.get<{ code: string; description: string }[]>(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/getTerms?searchTerm=&offset=1&max=2`)).data;
  Term.latestTermId = terms[0].code as TermId;

  const primaryTermCode = terms.find((term) => term.code.slice(4) === "20" || term.code.slice(4) === "90")!;
  const primaryTerm = new Term(primaryTermCode.code);

  const offTermCode = terms.indexOf(primaryTermCode) === 0 ? null : terms.find((term) => term.code !== primaryTermCode?.code)!;
  const offTerm = offTermCode ? new Term(offTermCode.code) : null;

  let subjects = (
    await requestClient.get<{ code: string; description: string }[]>(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/get_subject?searchTerm=&term=${primaryTerm.termId}&offset=1&max=500`)
  ).data;
  subjects = subjects.map((subject) => ({ code: subject.code, description: decodeHTML(subject.description).split("-").join(" - ") }));
  const attributes = (
    await requestClient.get<{ code: string; description: string }[]>(
      `${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/get_attribute?searchTerm=&term=${primaryTerm.termId}&offset=1&max=100`
    )
  ).data;
  let specialAttributes = (
    await requestClient.get<{ code: string; description: string }[]>(
      `${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/get_specialAttribute?searchTerm=&term=${primaryTerm.termId}&offset=1&max=50`
    )
  ).data;
  specialAttributes = specialAttributes.map((attribute) => ({ code: attribute.code, description: attribute.description.split("-").join(" - ") }));

  const formData = new FormData();
  formData.append("term", offTerm ? offTerm.nextCycleTermId() : primaryTerm.nextTermId());
  await requestClient.post(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/term/search?mode=search`, formData);
  const earlyOffTermCode = (
    await requestClient.get(
      `${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/searchResults/searchResults?pageOffset=0&pageMaxSize=1&txt_term=${offTerm ? offTerm.nextCycleTermId() : primaryTerm.nextTermId()}`
    )
  ).data as { data: ClassData[] | null; totalCount: number };
  const hasEarlyOffTerm = earlyOffTermCode.data && earlyOffTermCode.totalCount > 0;

  const formData2 = new FormData();
  formData2.append("term", primaryTerm.nextPrimaryTermId());
  await requestClient.post(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/term/search?mode=search`, formData2);
  const earlyPrimaryTermCode = (
    await requestClient.get(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/searchResults/searchResults?pageOffset=0&pageMaxSize=1&txt_term=${primaryTerm.nextPrimaryTermId()}`)
  ).data as { data: ClassData[] | null; totalCount: number };
  const hasEarlyPrimaryTerm = earlyPrimaryTermCode?.data && earlyPrimaryTermCode.totalCount > 0;

  const allTerms = [primaryTerm, offTerm, hasEarlyOffTerm ? new Term(primaryTerm.nextTermId()) : null, hasEarlyPrimaryTerm ? new Term(primaryTerm.nextPrimaryTermId()) : null].filter(
    (term): term is Term => term !== null
  );

  db.transaction(() => {
    db.prepare("DELETE FROM terms WHERE delete_timestamp IS NULL AND term_id NOT IN (SELECT DISTINCT term_id FROM watchers)").run();

    db.prepare("DELETE FROM subjects").run();
    db.prepare("DELETE FROM attributes").run();

    const insertTermStatement = db.prepare(
      "INSERT INTO terms (term_id, is_primary, is_early) VALUES (?, ?, ?) ON CONFLICT(term_id) DO UPDATE SET is_primary = excluded.is_primary, is_early = excluded.is_early"
    );
    for (const term of allTerms) insertTermStatement.run(term.termId, Number(term.isPrimary), Number(term.isEarly));

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
  Log.debug("locations loaded =", ClientManager.locations.length);

  Log.info(`Refreshed constant data: ${allTerms.length} terms, ${subjects.length} subjects, ${attributes.length} attributes, ${specialAttributes.length} special attributes`);
}
