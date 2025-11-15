# NeuroPulse Mobile App

A sleek, modern React Native mobile application for alertness testing with a premium design system.

## Design System

### Color Palette
- **Primary Red**: #E63946
- **Off-White/Cream**: #F1FAEE
- **Light Aqua**: #A8DADC
- **Steel Blue**: #457B9D
- **Deep Navy**: #1D3557

### Features
- Modern gradient backgrounds
- Frosted glass effect stats cards
- Animated button interactions
- Smooth navigation between screens
- Custom test tiles with icons
- Results visualization

## Setup

1. Install dependencies:
```bash
npm install
# or
yarn install
```

2. Start the development server:
```bash
npm start
# or
expo start
```

3. Run on your device:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app on your physical device

## Project Structure

```
mobile/
├── App.tsx                 # Main app entry with navigation
├── colors.ts               # Color palette constants
├── theme.ts                # Theme configuration
├── components/             # Reusable UI components
│   ├── PrimaryButton.tsx
│   ├── SecondaryButton.tsx
│   ├── StatsCard.tsx
│   ├── TestTile.tsx
│   └── ResultsCard.tsx
└── screens/                # Screen components
    ├── HomeScreen.tsx
    ├── TestDetailScreen.tsx
    └── ResultsScreen.tsx
```

## Screens

### Home Screen
- Gradient background (Deep Navy to Steel Blue)
- Stats card with frosted glass effect
- Bottom sheet with test selection grid

### Test Detail Screen
- Curved header with wave design
- Interactive test area
- Bottom action bar with buttons

### Results Screen
- Results card with charts
- Performance summary
- Action buttons for retaking tests

## Components

### PrimaryButton
- Animated press states
- Scale and color transitions
- Support for active/running states

### SecondaryButton
- Outlined style
- Smooth animations
- Icon support

### StatsCard
- Frosted glass appearance
- Multiple stat display
- Customizable layout

### TestTile
- Grid layout compatible
- Icon and title display
- Press animations

### ResultsCard
- Bar chart visualization
- Last vs Best comparison
- Clean, readable layout

## Notes

- Uses Expo for React Native development
- TypeScript for type safety
- React Navigation for routing
- Lucide React Native for icons
- Expo Linear Gradient for gradients

