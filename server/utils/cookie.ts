import { wrapper } from "axios-cookiejar-support";
import axios, { AxiosInstance } from "axios";
import { CookieJar } from "tough-cookie";

export class Cookie {
  static requestClient: AxiosInstance;
  private static mostRecentTerms: [latest: string, secondLatest: string] | null = null;

  static async refreshCookie() {
    const jar = new CookieJar();
    Cookie.requestClient = wrapper(axios.create({ jar }));
    Cookie.setup();
  }

  static getMostRecentTerms(): [offSemester: string, realSemester: string] | [latest: string] | null {
    if (!Cookie.mostRecentTerms) return null;

    const latestTerm = Cookie.mostRecentTerms[0];
    // winter, summer term
    if (["10", "60"].includes(latestTerm.slice(-2))) return Cookie.mostRecentTerms;
    else return [Cookie.mostRecentTerms[0]];
  }

  /** Makes the other required requests to enable the session ID to get classes
   * @returns whether all requests were successful
   */
  private static async setup(): Promise<boolean> {
    const terms = (
      await Cookie.requestClient.get<{ code: string; description: string }[]>("https://ssb.cc.binghamton.edu:8484/StudentRegistrationSsb/ssb/classSearch/getTerms?searchTerm=&offset=1&max=2")
    ).data;

    Cookie.mostRecentTerms = terms.map((term) => term.code) as [string, string];

    const formData = new FormData();
    formData.append("term", terms[0].code);
    formData.append("studyPath", "");
    formData.append("studyPathText", "");
    formData.append("startDatepicker", "");
    formData.append("endDatepicker", "");
    await Cookie.requestClient.post("https://ssb.cc.binghamton.edu:8484/StudentRegistrationSsb/ssb/term/search?mode=search", formData);

    return true;
  }
}
