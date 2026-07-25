import { ProfessorSearchResult, Professor, RMPClient } from "ratemyprofessors-client";

export async function getRMPData() {
  const client = new RMPClient();
  const UNIVERSITY_ID = 958 as const; // bing

  const professors: Professor[] = [];

  let searchResult: ProfessorSearchResult | undefined;
  do {
    searchResult = await client.listProfessorsForSchool(UNIVERSITY_ID, { page_size: 1000, cursor: searchResult?.next_cursor });
    if (searchResult?.professors) professors.push(...searchResult.professors);
  } while (searchResult?.has_next_page && searchResult.next_cursor);

  return professors;
}
