/**
 * Theme configuration
 * Typography, spacing, and design tokens
 */

import { COLORS } from './colors';

export const THEME = {
  colors: COLORS,
  
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    xxxl: 40,
  },

  borderRadius: {
    sm: 12,
    md: 18,
    lg: 22,
    xl: 24,
    xxl: 28,
    xxxl: 32,
    huge: 40,
  },

  typography: {
    title: {
      fontSize: 28,
      fontWeight: '700' as const,
      lineHeight: 36,
      color: COLORS.text.light,
    },
    subtitle: {
      fontSize: 20,
      fontWeight: '600' as const,
      lineHeight: 28,
      color: COLORS.text.primary,
    },
    body: {
      fontSize: 16,
      fontWeight: '400' as const,
      lineHeight: 24,
      color: COLORS.text.primary,
    },
    bodySmall: {
      fontSize: 14,
      fontWeight: '400' as const,
      lineHeight: 20,
      color: COLORS.text.secondary,
    },
    label: {
      fontSize: 14,
      fontWeight: '600' as const,
      lineHeight: 20,
      color: COLORS.text.primary,
    },
  },

  shadows: {
    card: {
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 8,
    },
    button: {
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 6,
    },
    pressed: {
      shadowColor: COLORS.shadow.pressed,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 3,
    },
    glow: {
      shadowColor: COLORS.shadow.glow,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 10,
    },
  },
} as const;

