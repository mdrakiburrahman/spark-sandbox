export { ActionLogger, LogColors, ILogger, SystemLogger };

const LogColors = {
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

interface ILogger {
  info: (message: string) => string;
  success: (message: string) => string;
  warn: (message: string) => string;
  error: (message: any) => any;
  debug: (message: string) => string;
}

class SystemLogger {
  private static logger: ILogger | undefined = undefined;

  static setLogger(logger: ILogger | undefined): void {
    SystemLogger.logger = logger;
  }

  static info(message: any): any {
    SystemLogger.logger?.info(message);
    return message;
  }

  static success(message: any): any {
    SystemLogger.logger?.success(message);
    return message;
  }

  static warn(message: any): any {
    SystemLogger.logger?.warn(message);
    return message;
  }

  static error(message: any): any {
    SystemLogger.logger?.error(message);
    return message;
  }

  static debug(message: any): any {
    SystemLogger.logger?.debug(message);
    return message;
  }
}

class ActionLogger implements ILogger {
  private debugEnabled: boolean;

  constructor(debugEnabled: boolean) {
    this.debugEnabled = debugEnabled;
  }

  info(message: any): any {
    console.log(LogColors.white, message);
    return message;
  }
  success(message: any): any {
    console.log(LogColors.green, message);
    return message;
  }
  warn(message: any): any {
    console.log(LogColors.yellow, message);
    return message;
  }
  error(message: any): any {
    console.log(LogColors.red, message);
    return message;
  }
  debug(message: any): any {
    console.log(LogColors.gray, message);
    return message;
  }
}
