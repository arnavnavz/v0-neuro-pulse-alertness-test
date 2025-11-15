import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME } from '../theme';

interface StatItem {
  label: string;
  value: string;
  unit?: string;
}

interface StatsCardProps {
  stats: StatItem[];
}

export const StatsCard: React.FC<StatsCardProps> = ({ stats }) => {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {stats.map((stat, index) => (
          <View
            key={index}
            style={[
              styles.statItem,
              index < stats.length - 1 && styles.statDivider,
            ]}
          >
            <Text style={styles.label}>{stat.label}</Text>
            <View style={styles.valueContainer}>
              <Text style={styles.value}>{stat.value}</Text>
              {stat.unit && <Text style={styles.unit}>{stat.unit}</Text>}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(241, 250, 238, 0.15)',
    borderRadius: THEME.borderRadius.xxl,
    padding: THEME.spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(168, 218, 220, 0.3)',
    // Frosted glass effect approximation
    backdropFilter: 'blur(10px)',
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  statItem: {
    alignItems: 'center',
    minWidth: 100,
    paddingVertical: THEME.spacing.sm,
  },
  statDivider: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(168, 218, 220, 0.3)',
    marginRight: THEME.spacing.md,
    paddingRight: THEME.spacing.md,
  },
  label: {
    ...THEME.typography.bodySmall,
    color: THEME.colors.lightAqua,
    marginBottom: THEME.spacing.xs,
    textAlign: 'center',
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    ...THEME.typography.title,
    fontSize: 24,
    color: THEME.colors.bg,
    fontWeight: '700',
  },
  unit: {
    ...THEME.typography.bodySmall,
    color: THEME.colors.lightAqua,
    marginLeft: 4,
    fontSize: 12,
  },
});

