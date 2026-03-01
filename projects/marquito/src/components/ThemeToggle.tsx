'use client';

import { useThemeContext } from './ThemeProvider';
import { WeatherSunny24Filled, WeatherMoon24Filled } from '@fluentui/react-icons';

const ThemeToggle = () => {
  const { toggleTheme, isDark } = useThemeContext();

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        width: '52px',
        height: '26px',
        borderRadius: '20px',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'}`,
        position: 'relative',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 6px',
        boxSizing: 'border-box',
        backgroundColor: isDark ? '#323130' : '#EDEBE9',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '3px',
          left: isDark ? '6px' : '26px',
          borderRadius: '50%',
          height: '18px',
          width: '18px',
          backgroundColor: isDark ? '#D2D0CE' : '#323130',
          transition: 'left 0.3s ease',
        }}
      />
      <WeatherSunny24Filled
        style={{ height: '14px', width: '14px', color: isDark ? '#A19F9D' : '#F2C811', zIndex: 1 }}
      />
      <WeatherMoon24Filled
        style={{ height: '14px', width: '14px', color: isDark ? '#4DB8FF' : '#A19F9D', zIndex: 1 }}
      />
    </button>
  );
};

export default ThemeToggle;
