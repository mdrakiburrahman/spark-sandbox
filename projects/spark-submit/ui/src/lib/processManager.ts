import { ChildProcess } from 'child_process'

// Shared state for running processes across API routes
export const runningProcesses = new Map<string, ChildProcess>()

// Function to stop all running processes
export function stopAllProcesses(): number {
    const count = runningProcesses.size
    for (const [jobName, process] of runningProcesses) {
        try {
            process.kill('SIGTERM')
        } catch (e) {
            console.error(`Failed to kill process for job ${jobName}:`, e)
        }
    }
    runningProcesses.clear()
    return count
}
