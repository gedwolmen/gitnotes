/**
 * AuthorIdentityScreen — configure git author name and email.
 *
 * These values are used when creating commits via git2-rs.
 *
 * GPL-3.0 derivative of GitSync.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { useGit2SettingsStore } from './git2SettingsStore';
import { HapticService } from '../../../utils/haptics';

export function AuthorIdentityScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const author = useGit2SettingsStore((s) => s.author);
  const setAuthor = useGit2SettingsStore((s) => s.setAuthor);

  const [name, setName] = useState(author.name);
  const [email, setEmail] = useState(author.email);

  const hasChanges = name !== author.name || email !== author.email;

  const handleSave = useCallback(async () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert('Missing fields', 'Both name and email are required for commits.');
      return;
    }
    if (!email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    await setAuthor({ name: name.trim(), email: email.trim() });
    HapticService.success();
    navigation.goBack();
  }, [name, email, setAuthor, navigation]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Author Name
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Author Email
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.infoBox}>
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          These values are used as the git author and committer identity for all
          commits created by git2-rs. They are stored locally and included in
          your repository history.
        </Text>
      </View>

      <View style={styles.previewBox}>
        <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>
          Preview
        </Text>
        <Text style={[styles.previewText, { color: colors.text }]}>
          Commit as: {name.trim() || 'GitNotēs'} &lt;{email.trim() || 'app@gitnotes.dev'}&gt;
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.saveButton,
          { backgroundColor: hasChanges ? colors.primary : colors.border },
        ]}
        onPress={handleSave}
        disabled={!hasChanges}
      >
        <Text style={[styles.saveButtonText, { color: hasChanges ? '#fff' : colors.textSecondary }]}>
          Save
        </Text>
      </TouchableOpacity>

      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  infoBox: {
    marginHorizontal: 20,
    marginTop: 24,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 18,
  },
  previewBox: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  previewText: {
    fontSize: 14,
    fontFamily: 'Menlo',
  },
  saveButton: {
    marginHorizontal: 20,
    marginTop: 32,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  spacer: {
    height: 60,
  },
});
