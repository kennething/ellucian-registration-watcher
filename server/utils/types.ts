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
  seat28d: number | null;
  wait24h: number | null;
  wait28d: number | null;
  credits: ClassData["meetingsFaculty"][number]["meetingTime"]["creditHourSession"];
  meeting: {
    building: ClassData["meetingsFaculty"][number]["meetingTime"]["building"];
    buildingDescription: ClassData["meetingsFaculty"][number]["meetingTime"]["buildingDescription"];
    room: ClassData["meetingsFaculty"][number]["meetingTime"]["room"];
    campus: ClassData["meetingsFaculty"][number]["meetingTime"]["campus"];
    time: [start: ClassData["meetingsFaculty"][number]["meetingTime"]["beginTime"], end: ClassData["meetingsFaculty"][number]["meetingTime"]["endTime"]];
    days: [sun: boolean, mon: boolean, tue: boolean, wed: boolean, thu: boolean, fri: boolean, sat: boolean];
  };
  professorLeaked?: true;
  professorId: ClassData["faculty"][number]["bannerId"];
  professorName: ClassData["faculty"][number]["displayName"];
  rmpId: number | null;
  rmpRating: number | null;
  rmpNumRatings: number | null;
  rmpDifficulty: number | null;
  rmpTakeAgain: number | null;
};
