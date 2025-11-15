# NeuroPulse Mobile App - Setup Guide

## Prerequisites

1. **Node.js** (v18 or higher)
2. **npm** or **yarn**
3. **Expo CLI** (will be installed with dependencies)
4. **Expo Go app** on your mobile device (iOS/Android) - OR - iOS Simulator / Android Emulator

## Installation Steps

### 1. Navigate to the mobile directory
```bash
cd mobile
```

### 2. Install dependencies
```bash
npm install
# or
yarn install
```

### 3. Start the development server
```bash
npm start
# or
expo start
```

### 4. Run on your device

**Option A: Physical Device**
- Install "Expo Go" app from App Store (iOS) or Play Store (Android)
- Scan the QR code displayed in the terminal with:
  - iOS: Camera app
  - Android: Expo Go app

**Option B: Simulator/Emulator**
- Press `i` for iOS Simulator (requires Xcode on Mac)
- Press `a` for Android Emulator (requires Android Studio setup)

## Project Structure

```
mobile/
├── App.tsx                    # Main entry point with navigation
├── colors.ts                  # Color palette constants
├── theme.ts                   # Theme configuration (spacing, typography, etc.)
├── components/                # Reusable UI components
│   ├── PrimaryButton.tsx      # Main action button with animations
│   ├── SecondaryButton.tsx   # Outlined secondary button
│   ├── StatsCard.tsx         # Frosted glass stats display
│   ├── TestTile.tsx          # Test selection tile
│   └── ResultsCard.tsx       # Results visualization
└── screens/                   # Screen components
    ├── HomeScreen.tsx         # Dashboard with stats and test grid
    ├── TestDetailScreen.tsx  # Individual test screen
    └── ResultsScreen.tsx     # Results display screen
```

## Design System

### Colors
- **Primary Red**: #E63946
- **Off-White/Cream**: #F1FAEE
- **Light Aqua**: #A8DADC
- **Steel Blue**: #457B9D
- **Deep Navy**: #1D3557

### Key Features
- Gradient backgrounds
- Animated button interactions
- Frosted glass effects
- Smooth navigation
- Custom test tiles
- Results visualization

## Troubleshooting

### Metro bundler issues
```bash
npm start -- --reset-cache
```

### Clear Expo cache
```bash
expo start -c
```

### iOS Simulator not opening
- Ensure Xcode is installed
- Run: `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`

### Android Emulator not opening
- Ensure Android Studio is installed
- Create and start an AVD (Android Virtual Device) from Android Studio

## Development Tips

1. **Hot Reload**: Changes automatically reload in the app
2. **Debug Menu**: Shake device or press `Cmd+D` (iOS) / `Cmd+M` (Android) in simulator
3. **Reload**: Press `r` in the terminal or shake device
4. **TypeScript**: All components are typed for better development experience

## Next Steps

- Implement actual test logic in `TestDetailScreen`
- Add state management (Redux, Zustand, or Context API)
- Connect to backend API
- Add more test types
- Implement user authentication
- Add test history persistence

