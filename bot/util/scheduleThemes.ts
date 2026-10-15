export const themes = {
  light: {
    bg: "#FFFFFF",
    header: "#0082FF",
    headerText: "#D7EAFF",
    lines: "#F5F9FF",
    timeText: "#49617C"
  },
  dark: {
    bg: "#373F4D",
    header: "#AFE696",
    headerText: "#0B1308",
    lines: "#474F5A",
    timeText: "#B5C9D2"
  },
  "green (light)": {
    bg: "#F9FDF2",
    header: "#50A100",
    headerText: "#010600",
    lines: "#E7EBE1",
    timeText: "#1B1D1A"
  },
  "green (dark)": {
    bg: "#251E1D",
    header: "#1BC167",
    headerText: "#000000",
    lines: "#4F4C4B",
    timeText: "#D4D4D4"
  },
  "orange (light)": {
    bg: "#FFF9F1",
    header: "#D54900",
    headerText: "#FFFFFF",
    lines: "#FFEFDB",
    timeText: "#8F3805"
  },
  "orange (dark)": {
    bg: "#312630",
    header: "#E2A45E",
    headerText: "#160702",
    lines: "#574640",
    timeText: "#D0AE74"
  },
  "blue (light)": {
    bg: "#F0F2F5",
    header: "#7194B9",
    headerText: "#02050A",
    lines: "#EAEDF2",
    timeText: "#3C4451"
  },
  "blue (dark)": {
    bg: "#0A053E",
    header: "#5547DD",
    headerText: "#FFFFFF",
    lines: "#35326C",
    timeText: "#B1C1FF"
  },
  "pink (light)": {
    bg: "#FEF4F9",
    header: "#F94FA8",
    headerText: "#FFFFFF",
    lines: "#FBEAF4",
    timeText: "#D2236D"
  },
  "pink (dark)": {
    bg: "#343846",
    header: "#FF92D0",
    headerText: "#1C0512",
    lines: "#65666F",
    timeText: "#F9F9F5"
  }
} as const satisfies Record<
  string,
  {
    bg: string;
    header: string;
    headerText: string;
    lines: string;
    timeText: string;
  }
>;
