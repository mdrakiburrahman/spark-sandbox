import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import yaml from 'yaml'

/**
 * Build a spark-submit command preview for a job.
 * This is a simplified version that shows what the command would look like.
 */
export async function POST(request: NextRequest) {
    try {
        const { jobName } = await request.json()

        if (!jobName) {
            return NextResponse.json({ error: 'Job name is required' }, { status: 400 })
        }

        // Load the config
        const configPath = path.join(process.cwd(), '..', 'config', 'spark-jobs.yaml')

        if (!fs.existsSync(configPath)) {
            return NextResponse.json({ error: 'Configuration file not found' }, { status: 404 })
        }

        const content = fs.readFileSync(configPath, 'utf-8')
        const config = yaml.parse(content)

        const job = config.jobs[jobName]
        if (!job) {
            return NextResponse.json({ error: `Job '${jobName}' not found` }, { status: 404 })
        }

        const module = config.modules[job.module]
        if (!module) {
            return NextResponse.json({ error: `Module '${job.module}' not found` }, { status: 404 })
        }

        // Build a representative spark-submit command
        const cmd: string[] = []

        // Spark submit base
        cmd.push('$SPARK_HOME/bin/spark-submit')
        cmd.push('  --master local[*]')
        cmd.push('  --deploy-mode client')
        cmd.push('  --driver-memory <from-resource-config>')
        cmd.push('  --executor-memory <from-resource-config>')
        cmd.push('  --driver-cores <from-resource-config>')
        cmd.push('  --executor-cores <from-resource-config>')
        cmd.push('  --num-executors <from-resource-config>')

        // Config file
        const configFile = module.configPath
        if (module.useSparkConfigs) {
            cmd.push(`  --conf spark.driver.extraJavaOptions=-Dconfig.file=${configFile}`)
            cmd.push(`  --conf spark.executor.extraJavaOptions=-Dconfig.file=${configFile}`)
        }

        // Ivy settings
        cmd.push('  --conf spark.jars.ivySettings=<ivy-settings-path>')

        // Additional JARs
        const useAdditionalJars = job.useAdditionalJars ?? module.useAdditionalJars
        if (useAdditionalJars && config.additionalJars?.length > 0) {
            cmd.push(`  --packages ${config.additionalJars.join(',')}`)
        }

        // Spark config sets
        if (job.sparkConfigSets) {
            for (const setName of job.sparkConfigSets) {
                const configSet = config.sparkConfigSets[setName]
                if (configSet) {
                    cmd.push(`  # Config set: ${setName}`)
                    for (const entry of configSet) {
                        cmd.push(`  --conf ${entry.key}=${entry.value}`)
                    }
                }
            }
        }

        // Main class and JAR
        cmd.push(`  --class ${job.class}`)
        cmd.push(`  <jar-path-matching: ${module.jarPattern}>`)

        // Config path (first arg)
        cmd.push(`  ${configFile}`)

        // Additional args
        if (job.args) {
            for (const arg of job.args) {
                cmd.push(`  ${arg}`)
            }
        }

        // Inline config (base64)
        if (job.inlineConfig) {
            const base64 = Buffer.from(job.inlineConfig).toString('base64')
            cmd.push(`  # Inline config (base64 encoded):`)
            cmd.push(`  ${base64.substring(0, 60)}${base64.length > 60 ? '...' : ''}`)
        }

        return NextResponse.json({ command: cmd.join(' \\\n') })
    } catch (error) {
        console.error('Error building spark command:', error)
        return NextResponse.json({ error: 'Failed to build spark command' }, { status: 500 })
    }
}
