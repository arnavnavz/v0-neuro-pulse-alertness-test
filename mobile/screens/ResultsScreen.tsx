import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { ResultsCard } from '../components/ResultsCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { THEME } from '../theme';
import { ArrowLeft, RotateCcw } from 'lucide-react-native';

interface ResultsScreenProps {
  navigation: any;
  route: {
    params: {
      testId: string;
    };
  };
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  navigation,
  route,
}) => {
  const { testId } = route.params;
  
  // Mock data - in real app, this would come from state/API
  const lastReactionTime = 245;
  const bestScore = 198;

  const handleRetake = () => {
    navigation.navigate('TestDetail', { testId });
  };

  const handleGoHome = () => {
    navigation.navigate('Home');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={24} color={THEME.colors.deepNavy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Test Results</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <ResultsCard
          lastReactionTime={lastReactionTime}
          bestScore={bestScore}
        />

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Performance Summary</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Status</Text>
              <Text style={styles.summaryValue}>Good</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Improvement</Text>
              <Text style={[styles.summaryValue, styles.positiveValue]}>
                +12%
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <PrimaryButton
          title="Retake Test"
          icon={<RotateCcw size={20} color={THEME.colors.bg} />}
          onPress={handleRetake}
          style={styles.actionButton}
        />
        <PrimaryButton
          title="Back to Home"
          onPress={handleGoHome}
          variant="default"
          style={styles.actionButton}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: THEME.spacing.xl,
    paddingBottom: THEME.spacing.lg,
    backgroundColor: THEME.colors.bg,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...THEME.typography.title,
    fontSize: 24,
    color: THEME.colors.deepNavy,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: THEME.spacing.xl,
    paddingBottom: 120,
  },
  summaryCard: {
    backgroundColor: THEME.colors.bg,
    borderRadius: THEME.borderRadius.xl,
    padding: THEME.spacing.xl,
    marginTop: THEME.spacing.lg,
    ...THEME.shadows.card,
  },
  summaryTitle: {
    ...THEME.typography.subtitle,
    marginBottom: THEME.spacing.lg,
    color: THEME.colors.deepNavy,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    ...THEME.typography.bodySmall,
    color: THEME.colors.text.secondary,
    marginBottom: THEME.spacing.xs,
  },
  summaryValue: {
    ...THEME.typography.subtitle,
    color: THEME.colors.deepNavy,
    fontSize: 20,
  },
  positiveValue: {
    color: THEME.colors.steelBlue,
  },
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: THEME.spacing.xl,
    paddingBottom: 40,
    backgroundColor: THEME.colors.bg,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.lightAqua + '40',
  },
  actionButton: {
    flex: 1,
    marginHorizontal: THEME.spacing.xs,
  },
});

