import { StyleSheet } from 'react-native';

export const treeStyles = StyleSheet.create({
  leading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chevronSlot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 15,
    lineHeight: 20,
    flex: 1,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  ext: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  size: {
    fontSize: 11,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingTop: 60,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  emptySub: {
    fontSize: 13,
  },
});

export const dialogStyles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 4,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  folderList: {
    maxHeight: 200,
  },
  folderItemText: {
    fontSize: 14,
  },
});
