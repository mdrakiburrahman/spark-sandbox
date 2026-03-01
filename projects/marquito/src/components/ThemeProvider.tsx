'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { FluentProvider, Theme } from '@fluentui/react-components';
import { themeType, lightTheme, darkTheme } from '@/styles/theme';

interface ThemeContextType {
  theme: { value: Theme; key: string };
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: { value: lightTheme, key: themeType.light },
  toggleTheme: () => {},
  isDark: false,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<{ value: Theme; key: string }>({
    value: lightTheme,
    key: themeType.light,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let localTheme = localStorage.getItem('marquito-theme');
    if (!localTheme) {
      localTheme = themeType.light;
      localStorage.setItem('marquito-theme', localTheme);
    }
    const fluentTheme = localTheme === themeType.dark ? darkTheme : lightTheme;
    document.body.setAttribute('data-theme', localTheme);
    setTheme({ value: fluentTheme, key: localTheme });
  }, []);

  const toggleTheme = () => {
    const localTheme = localStorage.getItem('marquito-theme');
    const fluentTheme = localTheme === themeType.light ? darkTheme : lightTheme;
    const newLocalTheme = localTheme === themeType.light ? themeType.dark : themeType.light;
    localStorage.setItem('marquito-theme', newLocalTheme);
    document.body.setAttribute('data-theme', newLocalTheme);
    setTheme({ value: fluentTheme, key: newLocalTheme });
  };

  const isDark = theme.key === themeType.dark;

  if (!mounted) {
    return (
      <FluentProvider theme={lightTheme}>
        <div style={{ visibility: 'hidden' }}>{children}</div>
      </FluentProvider>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark }}>
      <FluentProvider theme={theme.value}>{children}</FluentProvider>
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => useContext(ThemeContext);

export default ThemeProvider;
