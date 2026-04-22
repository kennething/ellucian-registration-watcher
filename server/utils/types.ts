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
  courseNumber: string;
  courseDisplay: string;
  subject: string;
  subjectDescription: string;
  sequenceNumber: string;
  campusDescription: string;
  scheduleTypeDescription: string;
  courseTitle: string;
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
  openSection: boolean;
  linkIdentifier: string;
  isSectionLinked: boolean;
  subjectCourse: string;
  faculty: {
    bannerId: string;
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
    faculty: any[]; // TODO:
    meetingTime: {
      beginTime: string;
      building: string;
      buildingDescription: string;
      campus: string;
      campusDescription: string;
      category: string;
      class: string;
      courseReferenceNumber: string; // CRN
      creditHourSession: number;
      endDate: string;
      endTime: string;
      friday: boolean;
      hoursWeek: number;
      meetingScheduleType: string;
      meetingType: string;
      meetingTypeDescription: string;
      monday: boolean;
      room: string;
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
