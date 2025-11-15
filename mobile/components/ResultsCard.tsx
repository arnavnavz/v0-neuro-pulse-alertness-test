import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME } from '../theme';

interface ResultsCardProps {
  lastReactionTime: number;
  bestScore: number;
  unit?: string;
}

export const ResultsCard: React.FC<ResultsCardProps> = ({
  lastReactionTime,
  bestScore,
  unit = 'ms',
}) => {
  const maxValue = Math.max(lastReactionTime, bestScore) * 1.2;
  const lastPercentage = (lastReactionTime / maxValue) * 100;
  const bestPercentage = (bestScore / maxValue) * 100;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Test Results</Text>
      
      <View style={styles.statRow}>
        <View style={styles.statItem}>
          <Text style={styles.label}>Last Reaction Time</Text>
          <Text style={styles.value}>
            {lastReactionTime.toFixed(0)} {unit}
          </Text>
        </View>
        
        <View style={styles.statItem}>
          <Text style={styles.label}>Best Score</Text>
          <Text style={styles.value}>
            {bestScore.toFixed(0)} {unit}
          </Text>
        </View>
      </View>

      <View style={styles.chartContainer}>
        <View style={styles.barContainer}>
          <Text style={styles.barLabel}>Last</Text>
          <View style={styles.barBackground}>
            <View
              style={[
                styles.bar,
                styles.barLast,
                { width: `${lastPercentage}%` },
              ]}
            />
          </View>
          <Text style={styles.barValue}>{lastReactionTime.toFixed(0)}</Text>
        </View>

        <View style={styles.barContainer}>
          <Text style={styles.barLabel}>Best</Text>
          <View style={styles.barBackground}>
            <View
              style={[
                styles.bar,
                styles.barBest,
                { width: `${bestPercentage}%` },
              ]}
            />
          </View>
          <Text style={styles.barValue}>{bestScore.toFixed(0)}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.colors.bg,
    borderRadius: THEME.borderRadius.xl,
    padding: THEME.spacing.xl,
    ...THEME.shadows.card,
  },
  header: {
    ...THEME.typography.subtitle,
    marginBottom: THEME.spacing.lg,
    color: THEME.colors.deepNavy,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.xl,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    ...THEME.typography.bodySmall,
    color: THEME.colors.text.secondary,
    marginBottom: THEME.spacing.xs,
  },
  value: {
    ...THEME.typography.subtitle,
    color: THEME.colors.deepNavy,
    fontSize: 22,
  },
  chartContainer: {
    marginTop: THEME.spacing.md,
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  barLabel: {
    ...THEME.typography.bodySmall,
    color: THEME.colors.text.secondary,
    width: 40,
  },
  barBackground: {
    flex: 1,
    height: 24,
    backgroundColor: THEME.colors.lightAqua + '40',
    borderRadius: THEME.borderRadius.sm,
    marginHorizontal: THEME.spacing.sm,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: THEME.borderRadius.sm,
  },
  barLast: {
    backgroundColor: THEME.colors.primary,
  },
  barBest: {
    backgroundColor: THEME.colors.lightAqua,
  },
  barValue: {
    ...THEME.typography.bodySmall,
    color: THEME.colors.deepNavy,
    width: 50,
    textAlign: 'right',
  },
});

