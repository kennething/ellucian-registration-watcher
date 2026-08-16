import * as z from "zod";

export type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

export enum NotificationType {
  /** class.seatsAvailable >= X */
  SEAT_GREATER_THAN,
  /** class.seatsAvailable <= X */
  SEAT_LESS_THAN,
  /** class.waitCount >= X */
  WAIT_GREATER_THAN,
  /** class.waitCount <= X */
  WAIT_LESS_THAN
}

export const ClassSearchSchema = z
  .object({
    term: z.string(),
    crn: z.string(),
    subject: z.string(), // "CS" - subject code
    // too much work // // subject: z.array(z.string()), // "CS" - subject codes
    courseNumber: z.string(), // "220"
    courseTitle: z.string(),
    meetingDays: z.array(z.boolean()).length(7), // bool for each day of the week, starting on sunday; sunday+monday = [true, true, ...false]
    time: z.tuple([
      z.number().int().min(1).max(12).nullable(),
      z.number().int().min(0).max(59).nullable(),
      z.enum(["AM", "PM"]),
      z.number().int().min(1).max(12).nullable(),
      z.number().int().min(0).max(59).nullable(),
      z.enum(["AM", "PM"])
    ]), // [startHour: number, startMinute: number, startAmpm: "AM" | "PM", endHour: number, endMinute: number, endAmpm: "AM" | "PM"]
    attribute: z.string(), // attribute code
    // too much work // // attribute: z.array(z.string()), // attribute codes
    // too much work // // professor: z.array(z.string()), // instructor codes
    creditHours: z.tuple([z.number().int().min(0).max(4), z.number().int().min(0).max(4)]), // [low: number, high: number]; 1-4
    // too much work // // openSections: z.boolean(),
    // too much work // // waitlistOpen: z.boolean(),
    professorRating: z.tuple([z.number().min(0).max(5), z.number().min(0).max(5)]), // [low: number, high: number]; 0-5
    strictRatingSearch: z.boolean()
  })
  .partial()
  .required({ term: true });
export type ClassSearchParams = z.infer<typeof ClassSearchSchema>;

export type ClassData = {
  id: number;
  term: string;
  termDesc: string;
  courseReferenceNumber: string; // CRN
  partOfTerm: number;
  courseNumber: string; // "350"
  courseDisplay: string; // "350"
  subject: string; // "CS"
  subjectDescription: string; // "CS - Computer Science"
  sequenceNumber: string; // section number
  campusDescription: string;
  scheduleTypeDescription: string;
  courseTitle: string; // "Operating Systems"
  creditHours: number;
  maximumEnrollment: number;
  enrollment: number;
  seatsAvailable: number;
  waitCapacity: number;
  waitCount: number;
  waitAvailable: number;
  crossList: any; // TODO:
  crossListCapacity: any; // TODO:
  crossListCount: any; // TODO:
  crossListAvailable: any; // TODO:
  creditHourHigh: number;
  creditHourLow: number;
  creditHourIndicator: string;
  openSection: boolean; // is the section open
  linkIdentifier: string;
  isSectionLinked: boolean;
  subjectCourse: string; // "CS350"
  instructionalMethod: string; // "TR"
  instructionalMethodDescription: string; // "Traditional"
  sectionAttributes: {
    class: string; // some random string
    code: string; // "FYA"
    courseReferenceNumber: string; // CRN
    description: string; // "FYA - First Year Appropriate"
    isZTCAttribute: boolean;
    termCode: string;
  }[];
  faculty: {
    leaked?: true; // custom
    bannerId: string; // professor id
    category: any; // TODO:
    class: string;
    courseReferenceNumber: string; // CRN
    displayName: string;
    emailAddress: string;
    primaryIndicator: boolean;
    term: string;
  }[];
  meetingsFaculty: {
    category: string;
    class: string;
    courseReferenceNumber: string; // CRN
    faculty: {
      bannerId: string; // professor id
      category: any; // TODO:
      class: string;
      courseReferenceNumber: string; // CRN
      displayName: string;
      emailAddress: string;
      primaryIndicator: boolean;
      term: string;
    }[];
    meetingTime: {
      beginTime: string | null; // "0945"
      building: string; // "LN"
      buildingDescription: string; // "Library North"
      campus: string; // "M"
      campusDescription: string; // "Main"
      category: string;
      class: string;
      courseReferenceNumber: string; // CRN
      creditHourSession: number;
      endDate: string;
      endTime: string | null; // "1115"
      friday: boolean;
      hoursWeek: number;
      meetingScheduleType: string;
      meetingType: string;
      meetingTypeDescription: string;
      monday: boolean;
      room: string; // "205"
      saturday: boolean;
      startDate: string;
      sunday: boolean;
      term: string;
      thursday: boolean;
      tuesday: boolean;
      wednesday: boolean;
    };
    term: string;
  }[];
};

export type TruncatedClassData = {
  term: ClassData["term"];
  courseReferenceNumber: ClassData["courseReferenceNumber"];
  subject: ClassData["subject"];
  courseNumber: ClassData["courseNumber"];
  courseTitle: ClassData["courseTitle"];
  sequenceNumber: ClassData["sequenceNumber"];
  seatsAvailable: ClassData["seatsAvailable"];
  maximumEnrollment: ClassData["maximumEnrollment"];
  waitCount: ClassData["waitCount"];
  waitCapacity: ClassData["waitCapacity"];
  lastUpdated: number | null;
  seat24h: number | null;
  seat7d: number | null;
  seat28d: number | null;
  wait24h: number | null;
  wait7d: number | null;
  wait28d: number | null;
  credits: ClassData["meetingsFaculty"][number]["meetingTime"]["creditHourSession"];
  meeting: {
    building: ClassData["meetingsFaculty"][number]["meetingTime"]["building"];
    buildingDescription: ClassData["meetingsFaculty"][number]["meetingTime"]["buildingDescription"];
    room: ClassData["meetingsFaculty"][number]["meetingTime"]["room"];
    campus: ClassData["meetingsFaculty"][number]["meetingTime"]["campus"];
    campusDescription: ClassData["meetingsFaculty"][number]["meetingTime"]["campusDescription"];
    scheduleType: ClassData["meetingsFaculty"][number]["meetingTime"]["meetingScheduleType"];
    instructionalMethodDescription: ClassData["instructionalMethodDescription"];
    time: [start: ClassData["meetingsFaculty"][number]["meetingTime"]["beginTime"], end: ClassData["meetingsFaculty"][number]["meetingTime"]["endTime"]];
    days: [sun: boolean, mon: boolean, tue: boolean, wed: boolean, thu: boolean, fri: boolean, sat: boolean];
  };
  attributes: ClassData["sectionAttributes"][number]["code"][];
  professorLeaked?: true;
  professorId: ClassData["faculty"][number]["bannerId"];
  professorName: ClassData["faculty"][number]["displayName"];
  rmpId: number | null;
  rmpRating: number | null;
  rmpNumRatings: number | null;
  rmpDifficulty: number | null;
  rmpTakeAgain: number | null;
};
