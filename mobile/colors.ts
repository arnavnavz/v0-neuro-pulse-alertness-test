/**
 * Color Palette
 * Primary design system colors for NeuroPulse mobile app
 */

export const COLORS = {
  // Primary colors
  primary: '#E63946',      // Primary Red
  bg: '#F1FAEE',          // Off-White/Cream
  lightAqua: '#A8DADC',   // Light Aqua
  steelBlue: '#457B9D',   // Steel Blue
  deepNavy: '#1D3557',    // Deep Navy

  // Semantic colors
  text: {
    primary: '#1D3557',
    secondary: '#457B9D',
    light: '#F1FAEE',
    accent: '#A8DADC',
  },
  
  // Background variations
  background: {
    primary: '#F1FAEE',
    secondary: '#1D3557',
    gradient: {
      start: '#1D3557',
      end: '#457B9D',
    },
  },

  // Interactive states
  button: {
    default: '#457B9D',
    pressed: '#1D3557',
    active: '#E63946',
    text: '#F1FAEE',
  },

  // Shadows
  shadow: {
    default: 'rgba(21, 43, 67, 0.25)',
    pressed: 'rgba(21, 43, 67, 0.15)',
    glow: 'rgba(168, 218, 220, 0.4)',
  },
} as const;

export type ColorKey = keyof typeof COLORS;

