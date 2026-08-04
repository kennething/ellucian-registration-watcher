import * as htmlparser2 from "htmlparser2";
import { Cookie } from "./cookie";

type Element = ReturnType<typeof htmlparser2.DomUtils.getElementsByTagName>[number];

export async function getSchedule(term: string) {
  const form = new FormData();
  form.set("schedule", term);
  form.set("listby", "By course name");

  const html = (await Cookie.requestClient.post("https://matrix.math.binghamton.edu/d/cgi-bin/schedule/get_course_schedule.cgi", form)).data as string;
  const dom = htmlparser2.parseDocument(html);

  /** `{ [crn]: professor }` */
  const data = new Map<string, string>();

  const validRows = htmlparser2.DomUtils.findAll(
    (element) => {
      if (element.type !== "tag" || element.name !== "tr") return false;

      const children = htmlparser2.DomUtils.getChildren(element) as Element[];
      const td = children.find((child) => child.type === "tag" && child.name === "td");
      if (!td) return false;

      return !td.children.some((child) => child.type === "tag" && child.name === "big");
    },
    htmlparser2.DomUtils.getElementsByTagName("table", dom, true)[0].children
  );

  validRows.forEach((row) => {
    const children = htmlparser2.DomUtils.getChildren(row) as Element[];

    let crn: string | undefined;
    let professor: string | undefined;

    let tdCount = 0;
    for (const child of children) {
      if (child.type === "tag" && child.name === "td") {
        tdCount++;
        if (tdCount === 3) crn = htmlparser2.DomUtils.textContent(child).trim();
        else if (tdCount === 5) professor = htmlparser2.DomUtils.textContent(child).trim();
      }
    }

    if (crn !== "0" && crn && professor) data.set(crn, professor);
  });

  return data;
}
