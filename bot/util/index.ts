type CourseParam = {
  subject: string;
  courseNumber: string;
  sequenceNumber: string;
};
export function getCourseColor(course: CourseParam, getRaw: true): [number, number, number];
export function getCourseColor(course: CourseParam, getRaw?: boolean): string;
export function getCourseColor(course: CourseParam, getRaw = false) {
  const str = `${course.subject}${course.courseNumber}${course.sequenceNumber}`;

  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  const hue = (hash >>> 0) % 360;
  const saturation = 60 + ((hash >>> 8) % 21);
  const lightness = 70 + ((hash >>> 16) % 11);

  function hslToHex(h: number, s: number, l: number, raw: true): [number, number, number];
  function hslToHex(h: number, s: number, l: number, raw: false): string;
  function hslToHex(h: number, s: number, l: number, raw: boolean) {
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0,
      g = 0,
      b = 0;

    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];

    if (raw) return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];

    const toHex = (v: number) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0");

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  // @ts-expect-error
  return hslToHex(hue, saturation, lightness, getRaw);
}
