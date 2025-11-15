import React, { useRef } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { THEME } from '../theme';

interface TestTileProps {
  title: string;
  icon: React.ReactNode;
  onPress: () => void;
}

export const TestTile: React.FC<TestTileProps> = ({ title, icon, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const backgroundColor = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.95,
        useNativeDriver: true,
        tension: 300,
        friction: 20,
      }),
      Animated.timing(backgroundColor, {
        toValue: 1,
        duration: 150,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 300,
        friction: 20,
      }),
      Animated.timing(backgroundColor, {
        toValue: 0,
        duration: 150,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const bgColor = backgroundColor.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.colors.bg, THEME.colors.lightAqua],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ scale: scaleAnim }],
          backgroundColor: bgColor,
        },
        THEME.shadows.card,
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={styles.button}
      >
        <View style={styles.iconContainer}>{icon}</View>
        <Text style={styles.title}>{title}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: THEME.borderRadius.xl,
    minHeight: 120,
    padding: THEME.spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  button: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: THEME.spacing.sm,
  },
  title: {
    ...THEME.typography.label,
    color: THEME.colors.deepNavy,
    textAlign: 'center',
    fontSize: 15,
  },
});

