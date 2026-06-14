'use client'

import { useThemeContext } from './ThemeProvider'
import { WeatherSunny20Regular, WeatherMoon20Regular } from '@fluentui/react-icons'

const ThemeToggle = () => {
    const { toggleTheme, isDark } = useThemeContext()

    return (
        <button
            onClick={toggleTheme}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                cursor: 'pointer',
                color: isDark ? '#ffffff' : '#242424',
                transition: 'all 0.2s ease',
            }}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {isDark ? <WeatherSunny20Regular /> : <WeatherMoon20Regular />}
        </button>
    )
}

export default ThemeToggle
