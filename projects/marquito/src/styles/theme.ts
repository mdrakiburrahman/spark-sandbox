import { webLightTheme, webDarkTheme, Theme } from '@fluentui/react-components';

export const lightTheme: Theme = {
  ...webLightTheme,
  colorNeutralBackground1: '#FAF9F8',
  colorNeutralBackground2: '#F3F2F1',
  colorNeutralBackground3: '#EDEBE9',
  colorNeutralBackground4: '#FFFFFF',
  colorNeutralForeground1: '#323130',
  colorNeutralForeground2: '#484644',
  colorNeutralForeground3: '#605E5C',
  colorNeutralStroke1: '#EDEBE9',
  colorNeutralStroke2: '#E1DFDD',
  colorBrandBackground: '#0078D4',
  colorBrandBackgroundHover: '#106EBE',
  colorBrandForegroundLink: '#0078D4',
  colorCompoundBrandForeground1: '#0078D4',
  colorCompoundBrandBackground: '#0078D4',
  colorCompoundBrandStroke: '#0078D4',
  colorPaletteRedForeground1: '#A4262C',
  colorPaletteGreenForeground1: '#107C10',
};

export const darkTheme: Theme = {
  ...webDarkTheme,
  colorNeutralBackground1: '#1B1A19',
  colorNeutralBackground2: '#252423',
  colorNeutralBackground3: '#323130',
  colorNeutralBackground4: '#201F1E',
  colorNeutralForeground1: '#FAF9F8',
  colorNeutralForeground2: '#D2D0CE',
  colorNeutralForeground3: '#A19F9D',
  colorNeutralStroke1: '#484644',
  colorNeutralStroke2: '#323130',
  colorBrandBackground: '#0078D4',
  colorBrandBackgroundHover: '#106EBE',
  colorBrandForegroundLink: '#4DB8FF',
  colorCompoundBrandForeground1: '#4DB8FF',
  colorCompoundBrandBackground: '#0078D4',
  colorCompoundBrandStroke: '#0078D4',
  colorPaletteRedForeground1: '#FF6B6B',
  colorPaletteGreenForeground1: '#6CCB5F',
};

export const themeType = {
  dark: 'dark',
  light: 'light',
};
