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

  static debug<T>(...message: T[]) {
    if (Log.logLevel <= 0) console.debug(chalk.green.bold("[DEBUG] ") + chalk.green(new Date().toLocaleString()) + " | " + chalk.reset(message.join(" ")));
  }

  static info<T>(...message: T[]) {
    if (Log.logLevel <= 1) console.info(chalk.blue.bold("[INFO] ") + chalk.blue(new Date().toLocaleString()) + " | " + chalk.reset(message.join(" ")));
  }

  static warn<T>(...message: T[]) {
    if (Log.logLevel <= 2) console.warn(chalk.yellow.bold("[WARN] ") + chalk.yellow(new Date().toLocaleString()) + " | " + chalk.reset(message.join(" ")));
  }

  static error<T>(...message: T[]) {
    if (Log.logLevel <= 3) console.error(chalk.red.bold("[ERROR] ") + chalk.red(new Date().toLocaleString()) + " | " + chalk.reset(message.join(" ")));
  }
}
