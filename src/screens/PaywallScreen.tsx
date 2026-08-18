import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { ScreenHeader, useScreenHeaderHeight, Button, Surface } from '../components/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useProStore } from '../stores/proStore';
import { isTrialEligible } from '../services/RevenueCatService';

const FEATURE_KEYS = [
  'paywall.features.aiChat',
  'paywall.features.aiActions',
  'paywall.features.thoughtDump',
  'paywall.features.voiceDump',
  'paywall.features.personalizedQuotes',
  'paywall.features.githubTools',
  'paywall.features.canvases',
  'paywall.features.templates',
  'paywall.features.renderStyles',
  'paywall.features.multiAccount',
];

export default function PaywallScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const headerHeight = useScreenHeaderHeight();

  const monthlyPackage = useProStore((s) => s.monthlyPackage);
  const lifetimePackage = useProStore((s) => s.lifetimePackage);
  const offeringsReady = useProStore((s) => s.offeringsReady);
  const isPurchasing = useProStore((s) => s.isPurchasing);
  const isRestoring = useProStore((s) => s.isRestoring);
  const error = useProStore((s) => s.error);
  const loadOfferingsIfNeeded = useProStore((s) => s.loadOfferingsIfNeeded);
  const purchaseMonthly = useProStore((s) => s.purchaseMonthly);
  const purchaseLifetime = useProStore((s) => s.purchaseLifetime);
  const restore = useProStore((s) => s.restore);

  const [trialEligible, setTrialEligible] = useState(false);
  const [trialChecked, setTrialChecked] = useState(false);

  useEffect(() => {
    void loadOfferingsIfNeeded();
  }, [loadOfferingsIfNeeded]);

  const monthlyProductId = monthlyPackage?.product.identifier;
  useEffect(() => {
    if (!monthlyProductId || trialChecked) return;
    setTrialChecked(true);
    isTrialEligible(monthlyProductId)
      .then(setTrialEligible)
      .catch(() => setTrialEligible(false));
  }, [monthlyProductId, trialChecked]);

  const monthlyPrice = monthlyPackage?.product.priceString;
  const lifetimePrice = lifetimePackage?.product.priceString;
  const busy = isPurchasing || isRestoring;

  const handleMonthly = useCallback(() => {
    void purchaseMonthly().then(() => {
      if (useProStore.getState().status === 'pro') navigation.goBack();
    });
  }, [purchaseMonthly, navigation]);

  const handleLifetime = useCallback(() => {
    void purchaseLifetime().then(() => {
      if (useProStore.getState().status === 'pro') navigation.goBack();
    });
  }, [purchaseLifetime, navigation]);

  const handleRestore = useCallback(() => {
    void restore().then(() => {
      if (useProStore.getState().status === 'pro') navigation.goBack();
    });
  }, [restore, navigation]);

  const monthlyCtaLabel = monthlyPrice
    ? trialEligible
      ? t('paywall.monthly.trialCta', { price: monthlyPrice })
      : t('paywall.monthly.price', { price: monthlyPrice })
    : t('paywall.loading');

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        title={t('paywall.title')}
        actions={
          <TouchableOpacity
            testID="paywall.close"
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: headerHeight + 8 }}
        testID="paywall.scroll"
      >
        <Text className="text-3xl font-bold text-center" style={{ color: colors.text }}>
          {t('paywall.subtitle')}
        </Text>

        <View className="mt-6 gap-3" testID="paywall.features">
          {FEATURE_KEYS.map((key) => (
            <View key={key} className="flex-row items-center gap-3">
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text className="text-[15px] flex-1" style={{ color: colors.text }}>
                {t(key)}
              </Text>
            </View>
          ))}
        </View>

        {!offeringsReady ? (
          <View className="mt-8 items-center" testID="paywall.loading">
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <>
            {error ? (
              <View className="mt-6 rounded-xl p-4" style={{ backgroundColor: colors.error + '22' }} testID="paywall.error">
                <Text className="text-sm" style={{ color: colors.error }}>
                  {t('paywall.purchaseError')}: {error}
                </Text>
                <Button
                  testID="paywall.retry"
                  variant="secondary"
                  label={t('paywall.retry')}
                  onPress={() => void loadOfferingsIfNeeded()}
                  style={{ marginTop: 10 }}
                />
              </View>
            ) : null}

            <Surface elevation="raised" radius="md" className="mt-6 p-5">
              <Text className="text-lg font-bold" style={{ color: colors.text }}>
                {t('paywall.monthly.title')}
              </Text>
              {monthlyPrice ? (
                <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                  {trialEligible ? t('paywall.monthly.trialCta', { price: monthlyPrice }) : monthlyPrice}
                </Text>
              ) : null}
              <Button
                testID="paywall.monthly.cta"
                variant="primary"
                fullWidth
                disabled={busy || !monthlyPrice}
                label={monthlyCtaLabel}
                onPress={handleMonthly}
                style={{ marginTop: 14 }}
              />
            </Surface>

            <Surface elevation="raised" radius="md" className="mt-4 p-5">
              <Text className="text-lg font-bold" style={{ color: colors.text }}>
                {t('paywall.lifetime.title')}
              </Text>
              <Button
                testID="paywall.lifetime.cta"
                variant="secondary"
                fullWidth
                disabled={busy || !lifetimePrice}
                label={lifetimePrice ? t('paywall.lifetime.cta', { price: lifetimePrice }) : t('paywall.loading')}
                onPress={handleLifetime}
                style={{ marginTop: 14 }}
              />
            </Surface>

            <TouchableOpacity
              testID="paywall.restore"
              className="items-center mt-6"
              disabled={busy}
              onPress={handleRestore}
            >
              <Text className="text-sm font-medium" style={{ color: colors.accent }}>
                {t('paywall.restore')}
              </Text>
            </TouchableOpacity>

            <Text className="text-xs text-center mt-6 leading-[18px]" style={{ color: colors.textSecondary }}>
              {t('paywall.termsNote')}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
