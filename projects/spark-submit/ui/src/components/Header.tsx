'use client'

import { Open16Regular } from '@fluentui/react-icons'
import ThemeToggle from './ThemeToggle'
import { useThemeContext } from './ThemeProvider'

const Header = () => {
    const { isDark } = useThemeContext()

    return (
        <header
            style={{
                width: '100%',
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 100,
                backgroundColor: isDark ? 'rgba(10, 10, 10, 0.65)' : 'rgba(255, 255, 255, 0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: `0 1px 0 ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
            }}
        >
            <div
                style={{
                    padding: '10px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                    >
                        <a
                            href="https://microsoft.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                textDecoration: 'none',
                                color: isDark ? '#ffffff' : '#242424',
                                fontSize: '14px',
                                fontWeight: 600,
                            }}
                        >
                            <svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect width="10" height="10" fill="#F25022" />
                                <rect x="11" width="10" height="10" fill="#7FBA00" />
                                <rect y="11" width="10" height="10" fill="#00A4EF" />
                                <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
                            </svg>
                            Microsoft
                        </a>
                        <span style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)', margin: '0 4px' }}>|</span>
                        <span
                            style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '14px',
                                fontWeight: 600,
                                color: isDark ? 'rgba(255,255,255,0.9)' : '#242424',
                            }}
                        >
                            Spark Submit
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <a
                        href="/sql"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            textDecoration: 'none',
                            color: isDark ? '#fb923c' : '#f97316',
                            fontSize: '13px',
                            fontWeight: 500,
                            padding: '6px 12px',
                            borderRadius: '6px',
                            backgroundColor: isDark ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.08)',
                            transition: 'background-color 0.2s',
                        }}
                    >
                        🗄️ SQL
                    </a>
                    <a
                        href="/dbml"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            textDecoration: 'none',
                            color: isDark ? '#fb923c' : '#f97316',
                            fontSize: '13px',
                            fontWeight: 500,
                            padding: '6px 12px',
                            borderRadius: '6px',
                            backgroundColor: isDark ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.08)',
                            transition: 'background-color 0.2s',
                        }}
                    >
                        ⊞ DBML
                    </a>
                    <a
                        href="https://spark.apache.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            textDecoration: 'none',
                            color: isDark ? '#ffffff' : '#020202',
                            fontSize: '13px',
                        }}
                    >
                        Apache Spark
                        <Open16Regular />
                    </a>
                    <a
                        href="https://github.com/mdrakiburrahman/spark-sandbox"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            textDecoration: 'none',
                            color: isDark ? '#e6e6e6' : '#242424',
                            fontSize: '13px',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            transition: 'background-color 0.2s',
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z" />
                        </svg>
                        Source Code
                    </a>
                    <ThemeToggle />
                </div>
            </div>
        </header>
    )
}

export default Header
