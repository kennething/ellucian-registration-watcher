import ENV from "../../env";

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
    if (Log.logLevel <= 0) console.debug(`[DEBUG] ${new Date().toLocaleString()} | ${message.join(" ")}`);
  }

  static info<T>(...message: T[]) {
    if (Log.logLevel <= 1) console.info(`[INFO] ${new Date().toLocaleString()} | ${message.join(" ")}`);
  }

  static warn<T>(...message: T[]) {
    if (Log.logLevel <= 2) console.warn(`[WARN] ${new Date().toLocaleString()} | ${message.join(" ")}`);
  }

  static error<T>(...message: T[]) {
    if (Log.logLevel <= 3) console.error(`[ERROR] ${new Date().toLocaleString()} | ${message.join(" ")}`);
  }
}
