/**
 * Express App
 *
 * Main Express application setup.
 */

import express, { Express, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import { router } from './routes.js'
import { sseRouter } from './sse.js'

/**
 * Create the Express application
 */
export function createApp(): Express {
    const app = express()

    // Middleware
    app.use(cors())
    app.use(express.json())

    // Request logging (development)
    if (process.env.NODE_ENV !== 'test') {
        app.use((req: Request, res: Response, next: NextFunction) => {
            const start = Date.now()
            res.on('finish', () => {
                const duration = Date.now() - start
                console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`)
            })
            next()
        })
    }

    // API routes
    app.use('/api', router)

    // SSE routes
    app.use('/api/sse', sseRouter)

    // 404 handler
    app.use((req: Request, res: Response) => {
        res.status(404).json({
            success: false,
            error: `Not found: ${req.method} ${req.path}`,
        })
    })

    // Error handler
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        console.error('Unhandled error:', err)
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
        })
    })

    return app
}
