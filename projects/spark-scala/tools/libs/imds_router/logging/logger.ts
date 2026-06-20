import fs from 'fs'

export interface ILogger {
    log(message: string): void
}

/** Appends timestamped lines to a log file. */
export class Logger implements ILogger {
    constructor(private readonly logFile: string) {}

    log(message: string): void {
        fs.appendFileSync(this.logFile, `[${new Date().toISOString()}] ${message}\n`)
    }
}
