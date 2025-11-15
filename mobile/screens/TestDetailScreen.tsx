import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PrimaryButton } from '../components/PrimaryButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { THEME } from '../theme';
import {
  ArrowLeft,
  Play,
  Info,
  History,
} from 'lucide-react-native';
const { width, height } = Dimensions.get('window');

interface TestDetailScreenProps {
  navigation: any;
  route: {
    params: {
      testId: string;
    };
  };
}

const testNames: Record<string, string> = {
  'dot-grid': 'Dot Reaction Grid',
  'peripheral': 'Peripheral Vision Test',
  'flash': 'Flash Reaction',
  'cognitive': 'Cognitive Speed',
  'attention': 'Attention Drift Test',
};

export const TestDetailScreen: React.FC<TestDetailScreenProps> = ({
  navigation,
  route,
}) => {
  const { testId } = route.params;
  const [testRunning, setTestRunning] = useState(false);
  const testName = testNames[testId] || 'Test';

  const handleStartTest = () => {
    setTestRunning(true);
    // Test logic would go here
    setTimeout(() => {
      setTestRunning(false);
      navigation.navigate('Results', { testId });
    }, 3000);
  };

  return (
    <View style={styles.container}>
      {/* Header with Wave */}
      <View style={styles.header}>
        <LinearGradient
          colors={[THEME.colors.deepNavy, THEME.colors.steelBlue]}
          style={styles.headerGradient}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <ArrowLeft size={24} color={THEME.colors.bg} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{testName}</Text>
          <View style={styles.placeholder} />
        </LinearGradient>
        <View style={styles.waveCurve} />
      </View>

      {/* Main Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Interactive Test Card */}
        <View style={styles.testCard}>
          <View style={styles.testArea}>
            {testRunning ? (
              <View style={styles.runningTest}>
                <View style={styles.testIndicator} />
                <Text style={styles.runningText}>Test in progress...</Text>
              </View>
            ) : (
              <View style={styles.readyState}>
                <View style={styles.readyCircle}>
                  <Text style={styles.readyText}>Ready</Text>
                </View>
                <Text style={styles.instructions}>
                  Tap "Start Test" to begin. Follow the on-screen prompts.
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Bottom Sticky Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomBarContent}>
          <SecondaryButton
            title="Instructions"
            icon={<Info size={20} color={THEME.colors.steelBlue} />}
            onPress={() => {}}
            style={styles.bottomButton}
          />
          <PrimaryButton
            title={testRunning ? 'Running...' : 'Start Test'}
            icon={testRunning ? null : <Play size={20} color={THEME.colors.bg} />}
            onPress={handleStartTest}
            variant={testRunning ? 'active' : 'default'}
            disabled={testRunning}
            style={[styles.bottomButton, styles.primaryButton]}
          />
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Results', { testId })}
          >
            <History size={24} color={THEME.colors.steelBlue} />
          </TouchableOpacity>
        </View>
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
    position: 'relative',
  },
  headerGradient: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: THEME.spacing.xl,
    paddingBottom: THEME.spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...THEME.typography.title,
    fontSize: 22,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  waveCurve: {
    position: 'absolute',
    bottom: -20,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: THEME.colors.bg,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: THEME.spacing.xl,
    paddingBottom: 100,
  },
  testCard: {
    backgroundColor: THEME.colors.bg,
    borderRadius: THEME.borderRadius.huge,
    padding: THEME.spacing.xxl,
    ...THEME.shadows.card,
    minHeight: 400,
  },
  testArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 350,
  },
  runningTest: {
    alignItems: 'center',
  },
  testIndicator: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: THEME.colors.primary,
    marginBottom: THEME.spacing.lg,
    ...THEME.shadows.glow,
  },
  runningText: {
    ...THEME.typography.subtitle,
    color: THEME.colors.deepNavy,
  },
  readyState: {
    alignItems: 'center',
  },
  readyCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: THEME.colors.lightAqua,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.xl,
  },
  readyText: {
    ...THEME.typography.subtitle,
    color: THEME.colors.deepNavy,
    fontSize: 18,
  },
  instructions: {
    ...THEME.typography.body,
    color: THEME.colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: THEME.spacing.lg,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: THEME.colors.bg,
    paddingTop: THEME.spacing.md,
    paddingBottom: 40,
    paddingHorizontal: THEME.spacing.xl,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.lightAqua + '40',
    ...THEME.shadows.card,
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottomButton: {
    flex: 1,
    marginHorizontal: THEME.spacing.xs,
  },
  primaryButton: {
    flex: 2,
  },
  iconButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: THEME.spacing.sm,
  },
});

