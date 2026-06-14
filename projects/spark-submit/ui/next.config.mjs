import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    turbopack: {
        root: path.resolve(__dirname, '..'),
        resolveAlias: {
            '@interface': path.resolve(__dirname, '../interface'),
        },
    },
    transpilePackages: ['../interface'],
}

export default nextConfig
