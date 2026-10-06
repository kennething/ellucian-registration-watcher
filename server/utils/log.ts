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
        throw new Error(`Invalid LOG_LEVEL: ${ENV.LOG_LEVEL}`);
    }
  })();

  private static formatMessage(message: unknown[]): string {
    return message
      .map((part) => {
        if (typeof part !== "object") return part;

        const proto = Object.getPrototypeOf(part);
        if (proto !== null && proto !== Object.prototype && /^class\s/.test(Function.prototype.toString.call(proto.constructor))) return String(part);

        return JSON.stringify(part);
      })
      .join(" ");
  }

  /** print to stdout with `console.debug()` */
  static debug(...message: unknown[]) {
    if (Log.logLevel <= 0) console.debug(chalk.green.bold("[DEBUG] ") + chalk.green(new Date().toLocaleString()) + " | " + chalk.reset(Log.formatMessage(message)));
  }
  /** print to stdout with `console.info()` */
  static info(...message: unknown[]) {
    if (Log.logLevel <= 1) console.info(chalk.blue.bold("[INFO] ") + chalk.blue(new Date().toLocaleString()) + " | " + chalk.reset(Log.formatMessage(message)));
  }
  /** print to stderr with `console.warn()` */
  static warn(...message: unknown[]) {
    if (Log.logLevel <= 2) console.warn(chalk.yellow.bold("[WARN] ") + chalk.yellow(new Date().toLocaleString()) + " | " + chalk.reset(Log.formatMessage(message)));
  }
  /** print to stderr with `console.error()` */
  static error(...message: unknown[]) {
    if (Log.logLevel <= 3) {
      console.error(chalk.red.bold("[ERROR] ") + chalk.red(new Date().toLocaleString()) + " | " + chalk.reset(Log.formatMessage(message)));
      console.trace();
    }
  }
}
