import { Router } from "express";
import { toCamelCase } from "../utils/functions";

const router = Router();

router.get("/class/search", async (req, res) => {
  const { term, crn, subject, courseNumber, time, attribute, professor, creditHours, openSections, waitlistOpen, professorRating } = req.body as {
    term: string;
    crn: string;
    subject: string; // "CS"
    courseNumber: string; // "220"
    time: [
      [start: number, end: number], // convert to minutes from midnight
      [start: number, end: number],
      [start: number, end: number],
      [start: number, end: number],
      [start: number, end: number],
      [start: number, end: number],
      [start: number, end: number]
    ];
    attribute: string;
    professor: string;
    creditHours: [low: number, high: number]; // 1-4
    openSections: boolean;
    waitlistOpen: boolean;
    professorRating: [low: number, high: number]; // 0-5
  };
  if (
    !term ||
    typeof term !== "string" ||
    !crn ||
    typeof crn !== "string" ||
    !subject ||
    typeof subject !== "string" ||
    !courseNumber ||
    typeof courseNumber !== "string" ||
    !time ||
    !Array.isArray(time) ||
    time.some((t) => !Array.isArray(t) || t.length !== 2 || typeof t[0] !== "number" || typeof t[1] !== "number") ||
    time.length !== 7 ||
    !attribute ||
    typeof attribute !== "string" ||
    !professor ||
    typeof professor !== "string" ||
    !creditHours ||
    !Array.isArray(creditHours) ||
    creditHours.length !== 2 ||
    typeof creditHours[0] !== "number" ||
    typeof creditHours[1] !== "number" ||
    typeof openSections !== "boolean" ||
    typeof waitlistOpen !== "boolean" ||
    !professorRating ||
    !Array.isArray(professorRating) ||
    professorRating.length !== 2 ||
    typeof professorRating[0] !== "number" ||
    typeof professorRating[1] !== "number"
  )
    return res.status(400).json({ error: "Invalid body" });

  // do stuff

  // TODO: change to actual search results
  return res.status(200).json({ results: toCamelCase([]) });
});

export default router;
