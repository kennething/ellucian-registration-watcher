type Year = `${number}`;
type TermCode = "10" | "20" | "60" | "90";
export type TermId = `${Year}${TermCode}`;

const termStrings = {
  "10": "Winter",
  "20": "Spring",
  "60": "Summer",
  "90": "Fall"
} as const;
export type TermString = `${(typeof termStrings)[keyof typeof termStrings]} ${number}`;

export class Term {
  static latestTermId: TermId;

  termId: TermId;
  /** is fall or spring term */
  isPrimary: boolean;
  /** is available on ssb */
  isEarly: boolean;
  /** when the term was detected as stale
   *
   * unix timestamp in seconds
   */
  deleteTimestamp: number | null;

  constructor(termId: string, deleteTimestamp?: number) {
    this.termId = termId as TermId;
    this.isPrimary = termId.slice(4) === "20" || termId.slice(4) === "90";
    this.isEarly = Number(Term.latestTermId) < Number(termId);
    this.deleteTimestamp = deleteTimestamp ?? null;
  }

  getTermString(): TermString {
    const year = this.termId.slice(0, 4);
    const quarter = this.termId.slice(4);
    return `${termStrings[quarter as keyof typeof termStrings]} ${year}` as TermString;
  }

  nextTermId(): TermId {
    const year = Number(this.termId.slice(0, 4));
    const termCode = this.termId.slice(4) as TermCode;
    let nextTermCode: TermCode;
    let nextYear = year;

    switch (termCode) {
      case "10":
        nextTermCode = "20";
        break;
      case "20":
        nextTermCode = "60";
        break;
      case "60":
        nextTermCode = "90";
        break;
      case "90":
        nextTermCode = "10";
        nextYear++;
        break;
    }

    return `${nextYear}${nextTermCode}` as TermId;
  }

  nextPrimaryTermId(): TermId {
    const year = Number(this.termId.slice(0, 4));
    const termCode = this.termId.slice(4) as TermCode;
    let nextTermCode: TermCode;
    let nextYear = year;

    switch (termCode) {
      case "10":
        nextTermCode = "20";
        break;
      case "20":
      case "60":
        nextTermCode = "90";
        break;
      case "90":
        nextTermCode = "20";
        nextYear++;
        break;
    }

    return `${nextYear}${nextTermCode}` as TermId;
  }

  /** if this is a primary term, returns the next primary term
   *
   * if this is an off term, returns the next off term
   */
  nextCycleTermId(): TermId {
    const year = Number(this.termId.slice(0, 4));
    const termCode = this.termId.slice(4) as TermCode;
    let nextTermCode: TermCode;
    let nextYear = year;

    switch (termCode) {
      case "10":
        nextTermCode = "60";
        break;
      case "20":
        nextTermCode = "90";
        break;
      case "60":
        nextTermCode = "10";
        break;
      case "90":
        nextTermCode = "20";
        nextYear++;
        break;
    }

    return `${nextYear}${nextTermCode}` as TermId;
  }
}
