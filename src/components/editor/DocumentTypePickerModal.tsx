import React, { useCallback, useRef } from 'react';
import { Modal as RNModal, StyleSheet, Text, TouchableOpacity, View, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../contexts/ThemeContext';

export type DocumentType = 'canvas' | 'diagram';

/**
 * Pro-gated document type picker shown when the user taps "new canvas".
 *
 * Visual Canvas: always Pro-gated; opens size picker flow.
 * ASCII Diagram: always Pro-gated; routes to DiagramEditor after title input.
 * Free users see both options but selecting diagram immediately shows paywall
 * before any store mutation.
 */
export interface DocumentTypePickerModalProps {
  visible: boolean;
  onSelectVisualCanvas: () => void;
  onSelectDiagram: () => void;
  onClose: () => void;
}

export function DocumentTypePickerModal({
  visible,
  onSelectVisualCanvas,
  onSelectDiagram,
  onClose,
}: DocumentTypePickerModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const hasSelectedRef = useRef(false);

  const handleSelectVisualCanvas = useCallback(() => {
    if (hasSelectedRef.current) return;
    hasSelectedRef.current = true;
    onSelectVisualCanvas();
  }, [onSelectVisualCanvas]);

  const handleSelectDiagram = useCallback(() => {
    if (hasSelectedRef.current) return;
    hasSelectedRef.current = true;
    onSelectDiagram();
  }, [onSelectDiagram]);

  const handleVisibleChange = useCallback((v: boolean) => {
    if (!v) {
      hasSelectedRef.current = false;
      onClose();
    }
  }, [onClose]);

  return (
    <RNModal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={() => handleVisibleChange(false)}
      onShow={() => { hasSelectedRef.current = false; }}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={() => handleVisibleChange(false)}
        accessible={false}
      >
        <KeyboardAvoidingContainer>
          <View
            style={[styles.sheet, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            {/* Handle */}
            <View style={[styles.handle, { backgroundColor: colors.border + '60' }]} />

            <Text style={[styles.title, { color: colors.text }]}>
              {'New Document'}
            </Text>

            {/* Visual Canvas option */}
            <TouchableOpacity
              testID="document-type-picker.button.visual-canvas"
              accessible
              accessibilityRole="button"
              accessibilityLabel={'Create a new visual canvas'}
              style={[styles.optionCard, { borderColor: colors.border }]}
              onPress={handleSelectVisualCanvas}
              activeOpacity={0.7}
            >
              <View style={[styles.optionIcon, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="easel-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>
                  {'Visual Canvas'}
                </Text>
                <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                  {'Freeform infinite canvas with drawing and shapes'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* ASCII Diagram option */}
            <TouchableOpacity
              testID="document-type-picker.button.ascii-diagram"
              accessible
              accessibilityRole="button"
              accessibilityLabel={'Create a new ASCII diagram'}
              style={[styles.optionCard, { borderColor: colors.border }]}
              onPress={handleSelectDiagram}
              activeOpacity={0.7}
            >
              <View style={[styles.optionIcon, { backgroundColor: colors.accent + '18' }]}>
                <Ionicons name="grid-outline" size={24} color={colors.accent} />
              </View>
              <View style={styles.optionContent}>
                <View style={styles.optionTitleRow}>
                  <Text style={[styles.optionTitle, { color: colors.text }]}>
                    {'ASCII Diagram'}
                  </Text>
                  <View style={[styles.proBadge, { backgroundColor: colors.accent + '20' }]}>
                    <Text style={[styles.proBadgeText, { color: colors.accent }]}>Pro</Text>
                  </View>
                </View>
                <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                  {'Grid-based diagram with boxes, lines, and text'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              testID="document-type-picker.button.cancel"
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={() => handleVisibleChange(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingContainer>
      </TouchableOpacity>
    </RNModal>
  );
}

function KeyboardAvoidingContainer({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'ios') {
    return <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>{children}</KeyboardAvoidingView>;
  }
  return <View style={{ width: '100%' }}>{children}</View>;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 24,
  },
  sheet: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  optionContent: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  proBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  optionDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  cancelButton: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
