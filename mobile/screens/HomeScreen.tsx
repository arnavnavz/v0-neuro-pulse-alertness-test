import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatsCard } from '../components/StatsCard';
import { TestTile } from '../components/TestTile';
import { THEME } from '../theme';
import {
  Grid3x3,
  Eye,
  Zap,
  Brain,
  Gauge,
} from 'lucide-react-native';

const { height } = Dimensions.get('window');
const STATS_CARD_HEIGHT = height * 0.4;
const BOTTOM_SHEET_HEIGHT = height * 0.6;

interface HomeScreenProps {
  navigation: any;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const stats = [
    { label: 'Avg Reaction', value: '245', unit: 'ms' },
    { label: "Today's Score", value: '87', unit: '%' },
    { label: 'Fatigue Level', value: 'Low', unit: '' },
  ];

  const tests = [
    {
      id: 'dot-grid',
      title: 'Dot Reaction Grid',
      icon: <Grid3x3 size={32} color={THEME.colors.steelBlue} />,
    },
    {
      id: 'peripheral',
      title: 'Peripheral Vision Test',
      icon: <Eye size={32} color={THEME.colors.steelBlue} />,
    },
    {
      id: 'flash',
      title: 'Flash Reaction',
      icon: <Zap size={32} color={THEME.colors.steelBlue} />,
    },
    {
      id: 'cognitive',
      title: 'Cognitive Speed',
      icon: <Brain size={32} color={THEME.colors.steelBlue} />,
    },
    {
      id: 'attention',
      title: 'Attention Drift Test',
      icon: <Gauge size={32} color={THEME.colors.steelBlue} />,
    },
  ];

  const handleTestPress = (testId: string) => {
    navigation.navigate('TestDetail', { testId });
  };

  return (
    <View style={styles.container}>
      {/* Gradient Background */}
      <LinearGradient
        colors={[THEME.colors.deepNavy, THEME.colors.steelBlue]}
        style={styles.gradient}
      >
        {/* Top Stats Card Section */}
        <View style={styles.statsSection}>
          <StatsCard stats={stats} />
        </View>

        {/* Bottom Sheet Container */}
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sectionTitle}>Select Test</Text>
          
          <ScrollView
            contentContainerStyle={styles.testGrid}
            showsVerticalScrollIndicator={false}
          >
            {tests.map((test) => (
              <View key={test.id} style={styles.testTileWrapper}>
                <TestTile
                  title={test.title}
                  icon={test.icon}
                  onPress={() => handleTestPress(test.id)}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  statsSection: {
    height: STATS_CARD_HEIGHT,
    paddingTop: 60,
    paddingHorizontal: THEME.spacing.xl,
    paddingBottom: THEME.spacing.lg,
  },
  bottomSheet: {
    flex: 1,
    backgroundColor: THEME.colors.bg,
    borderTopLeftRadius: THEME.borderRadius.xxxl,
    borderTopRightRadius: THEME.borderRadius.xxxl,
    paddingTop: THEME.spacing.lg,
    paddingHorizontal: THEME.spacing.xl,
    ...THEME.shadows.card,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: THEME.colors.lightAqua,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: THEME.spacing.md,
  },
  sectionTitle: {
    ...THEME.typography.subtitle,
    color: THEME.colors.deepNavy,
    marginBottom: THEME.spacing.lg,
  },
  testGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: THEME.spacing.xxxl,
  },
  testTileWrapper: {
    width: '48%',
  },
});

