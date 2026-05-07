import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Surface } from '../../components/ui';
import { useTheme, useTokens } from '../../contexts/ThemeContext';
import { ElevationTier } from '../../theme/elevation';
import { Radius } from '../../theme/tokens';

const TIERS: ElevationTier[] = ['subtle', 'raised', 'floating'];
const RADII_KEYS: Radius[] = ['sm', 'md', 'lg', 'pill'];

export default function NeumorphicGallery() {
  const { style, setStyle, isDark, setTheme, theme } = useTheme();
  const { colors, spacing, type } = useTokens();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={{ padding: spacing[4], gap: spacing[5] }}>
        <Text style={{ color: colors.text, fontSize: type['2xl'], fontWeight: '700' }}>
          Neumorphic Gallery
        </Text>

        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <TouchableOpacity
            onPress={() => setStyle(style === 'flat' ? 'neumorphic' : 'flat')}
          >
            <Surface elevation="raised" radius="pill" style={{ paddingVertical: spacing[2], paddingHorizontal: spacing[4] }}>
              <Text style={{ color: colors.text }}>Style: {style}</Text>
            </Surface>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <Surface elevation="raised" radius="pill" style={{ paddingVertical: spacing[2], paddingHorizontal: spacing[4] }}>
              <Text style={{ color: colors.text }}>Mode: {isDark ? 'dark' : 'light'}</Text>
            </Surface>
          </TouchableOpacity>
        </View>

        <Section title="Outset elevation tiers">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4] }}>
            {TIERS.map((t) => (
              <Surface key={t} elevation={t} radius="md" style={styles.swatch}>
                <Text style={{ color: colors.text }}>{t}</Text>
              </Surface>
            ))}
          </View>
        </Section>

        <Section title="Inset (pressed)">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4] }}>
            {TIERS.map((t) => (
              <Surface key={t} elevation={t} inset radius="md" style={styles.swatch}>
                <Text style={{ color: colors.text }}>{t}</Text>
              </Surface>
            ))}
          </View>
        </Section>

        <Section title="Radii">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4] }}>
            {RADII_KEYS.map((r) => (
              <Surface key={r} elevation="raised" radius={r} style={styles.swatch}>
                <Text style={{ color: colors.text }}>{r}</Text>
              </Surface>
            ))}
          </View>
        </Section>

        <Section title="Accent swatch">
          <Surface elevation="raised" radius="lg" style={{ padding: spacing[4] }}>
            <View style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'center' }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent }} />
              <Text style={{ color: colors.text }}>accent {colors.accent}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'center', marginTop: spacing[2] }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentMuted }} />
              <Text style={{ color: colors.text }}>accentMuted {colors.accentMuted}</Text>
            </View>
          </Surface>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  const { colors, spacing, type } = useTokens();
  return (
    <View style={{ gap: spacing[3] }}>
      <Text style={{ color: colors.textSecondary, fontSize: type.sm, textTransform: 'uppercase', letterSpacing: 1 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  swatch: { width: 96, height: 64, alignItems: 'center', justifyContent: 'center' },
});
