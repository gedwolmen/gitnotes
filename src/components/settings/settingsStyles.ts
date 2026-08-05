import { StyleSheet } from 'react-native';

export const settingsStyles = StyleSheet.create({
  scrollContent: { flex: 1 },
  settingLabel: { fontSize: 16 },
  settingValue: { fontSize: 15 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  emptyReposText: { fontSize: 15, fontWeight: '500' },
  repoName: { fontSize: 15, fontWeight: '500' },
  repoPath: { fontSize: 12 },
  creditsWrap: { paddingTop: 24, marginHorizontal: -8, alignItems: 'center' },
  creditsText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  bottomPad: { height: 40 },
});
