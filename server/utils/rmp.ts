import { ProfessorSearchResult, Professor, RMPClient } from "ratemyprofessors-client";
import ENV from "../../env";

export async function getRMPData() {
  const client = new RMPClient();

  const professors: Professor[] = [];

  let searchResult: ProfessorSearchResult | undefined;
  do {
    searchResult = await client.listProfessorsForSchool(ENV.RMP_SCHOOL_ID!, { page_size: 1000, cursor: searchResult?.next_cursor });
    if (searchResult?.professors) professors.push(...searchResult.professors);
  } while (searchResult?.has_next_page && searchResult.next_cursor);

  return professors;
}
