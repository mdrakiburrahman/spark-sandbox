'use client'

import { useThemeContext } from './ThemeProvider'

const Footer = () => {
    const { isDark } = useThemeContext()

    return (
        <footer
            style={{
                width: '100%',
                padding: '16px 24px',
                backgroundColor: isDark ? 'rgba(10, 10, 10, 0.65)' : 'rgba(255, 255, 255, 0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
            }}
        >
            <span>© {new Date().getFullYear()} Microsoft. Spark Submit UI.</span>
        </footer>
    )
}

export default Footer
