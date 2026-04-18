import { firefox, Request } from "playwright";
import { fetchUrl } from "./fetch";

/** Container for the session ID cookie */
export class Cookie {
  /** The value of the cookie */
  private static value: string | null = null;
  private static mostRecentTerms: [latest: string, secondLatest: string] | null = null;

  /** Gets the cookie
   * @param refresh whether to get a new cookie even if `Cookie.value` is already set. Defaults to `false`
   * @return The value of the cookie
   */
  static async getCookie(refresh = false): Promise<string | null> {
    if (refresh || Cookie.value === null) await Cookie.getValue();
    return Cookie.value;
  }

  static getMostRecentTerms(): [offSemester: string, realSemester: string] | [latest: string] | null {
    if (!Cookie.mostRecentTerms) return null;

    const latestTerm = Cookie.mostRecentTerms[0];
    // winter, summer term
    if (["10", "60"].includes(latestTerm.slice(-2))) return Cookie.mostRecentTerms;
    else return [Cookie.mostRecentTerms[0]];
  }

  /** Gets a new cookie and updates `Cookie.value` */
  private static async getValue(): Promise<void> {
    const browser = await firefox.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    async function findRequestWithCookie(request: Request) {
      if (!request.url().includes("https://ssb.cc.binghamton.edu:8484/StudentRegistrationSsb/ssb/selfServiceMenu/data")) return;

      page.off("request", findRequestWithCookie);
      const cookie = (await request.allHeaders()).cookie;
      if (!cookie) return;
      Cookie.value = cookie;

      const success = await Cookie.setup();
      if (!success) Cookie.value = null;
    }
    page.on("request", findRequestWithCookie);

    await page.goto("https://ssb.cc.binghamton.edu:8484/StudentRegistrationSsb/ssb/registration/registration", { waitUntil: "networkidle" });
    await browser.close();
  }

  /** Makes the other required requests to enable the session ID to get classes
   * @returns whether all requests were successful
   */
  private static async setup(): Promise<boolean> {
    const [terms, error] = await fetchUrl<{ code: string; description: string }[]>("https://ssb.cc.binghamton.edu:8484/StudentRegistrationSsb/ssb/classSearch/getTerms?searchTerm=&offset=1&max=2");
    if (error) return false;

    Cookie.mostRecentTerms = terms.map((term) => term.code) as [string, string];

    const formData = new FormData();
    formData.append("term", terms[0].code);
    formData.append("studyPath", "");
    formData.append("studyPathText", "");
    formData.append("startDatepicker", "");
    formData.append("endDatepicker", "");
    const [, error2] = await fetchUrl("https://ssb.cc.binghamton.edu:8484/StudentRegistrationSsb/ssb/term/search?mode=search", "POST", formData);
    if (error2) return false;

    return true;
  }
}
