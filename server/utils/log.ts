import ENV from "../../env";
import chalk from "chalk";

export class Log {
  private static logLevel = (() => {
    switch (ENV.LOG_LEVEL) {
      case "debug":
        return 0;
      case "info":
        return 1;
      case "warn":
        return 2;
      case "error":
        return 3;
      default:
        return 1;
    }
  })();

  private static formatMessage(message: unknown[]): string {
    return message
      .map((part) => {
        if (typeof part === "object") return JSON.stringify(part, null, 2);
        return part;
      })
      .join(" ");
  }

  static debug(...message: unknown[]) {
    if (Log.logLevel <= 0) console.debug(chalk.green.bold("[DEBUG] ") + chalk.green(new Date().toLocaleString()) + " | " + chalk.reset(Log.formatMessage(message)));
  }

  static info(...message: unknown[]) {
    if (Log.logLevel <= 1) console.info(chalk.blue.bold("[INFO] ") + chalk.blue(new Date().toLocaleString()) + " | " + chalk.reset(Log.formatMessage(message)));
  }

  static warn(...message: unknown[]) {
    if (Log.logLevel <= 2) console.warn(chalk.yellow.bold("[WARN] ") + chalk.yellow(new Date().toLocaleString()) + " | " + chalk.reset(Log.formatMessage(message)));
  }

  static error(...message: unknown[]) {
    if (Log.logLevel <= 3) console.error(chalk.red.bold("[ERROR] ") + chalk.red(new Date().toLocaleString()) + " | " + chalk.reset(Log.formatMessage(message)));
  }
}
