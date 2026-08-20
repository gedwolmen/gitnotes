import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { ScreenHeader, useScreenHeaderHeight, Button, Surface } from '../components/ui';
import ProFeatureBento from '../components/paywall/ProFeatureBento';
import { useTheme } from '../contexts/ThemeContext';
import { useProStore } from '../stores/proStore';
import { isTrialEligible } from '../services/RevenueCatService';

export default function PaywallScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const headerHeight = useScreenHeaderHeight();
  const insets = useSafeAreaInsets();

  const monthlyPackage = useProStore((s) => s.monthlyPackage);
  const yearlyPackage = useProStore((s) => s.yearlyPackage);
  const lifetimePackage = useProStore((s) => s.lifetimePackage);
  const offeringsReady = useProStore((s) => s.offeringsReady);
  const isPurchasing = useProStore((s) => s.isPurchasing);
  const isRestoring = useProStore((s) => s.isRestoring);
  const error = useProStore((s) => s.error);
  const loadOfferingsIfNeeded = useProStore((s) => s.loadOfferingsIfNeeded);
  const purchaseMonthly = useProStore((s) => s.purchaseMonthly);
  const purchaseYearly = useProStore((s) => s.purchaseYearly);
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
  const yearlyPrice = yearlyPackage?.product.priceString;
  const lifetimePrice = lifetimePackage?.product.priceString;
  const busy = isPurchasing || isRestoring;

  const handleMonthly = useCallback(() => {
    void purchaseMonthly().then(() => {
      if (useProStore.getState().status === 'pro') navigation.goBack();
    });
  }, [purchaseMonthly, navigation]);

  const handleYearly = useCallback(() => {
    void purchaseYearly().then(() => {
      if (useProStore.getState().status === 'pro') navigation.goBack();
    });
  }, [purchaseYearly, navigation]);

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

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: colors.background }}>
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
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, paddingTop: Math.max(56, headerHeight - 24) }}
        testID="paywall.scroll"
      >
        <Text className="text-3xl font-bold text-center" style={{ color: colors.text }}>
          {t('paywall.subtitle')}
        </Text>

        <ProFeatureBento />

        {!offeringsReady ? (
          <View className="mt-8 items-center" testID="paywall.loading">
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <>
            {error ? (
              <View className="mt-6 rounded-xl border p-4 flex-row items-start gap-3" style={{ backgroundColor: colors.error + '14', borderColor: colors.error + '44' }} testID="paywall.error">
                <Ionicons name="alert-circle" size={22} color={colors.error} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold" style={{ color: colors.error }}>
                    {t('paywall.purchaseError')}
                  </Text>
                  <Text className="text-[13px] mt-1 leading-[18px]" style={{ color: colors.textSecondary }}>
                    {error}
                  </Text>
                  <Button
                    testID="paywall.retry"
                    variant="secondary"
                    label={t('paywall.retry')}
                    onPress={() => void loadOfferingsIfNeeded()}
                    style={{ marginTop: 12 }}
                  />
                </View>
              </View>
            ) : null}

            <Surface elevation="raised" radius="md" className="mt-6 p-5">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold" style={{ color: colors.text }}>
                  {t('paywall.monthly.title')}
                </Text>
                {monthlyPrice ? (
                  <Text className="text-base font-semibold" style={{ color: colors.textSecondary }}>
                    {trialEligible ? t('paywall.monthly.trialCta', { price: monthlyPrice }) : t('paywall.monthly.price', { price: monthlyPrice })}
                  </Text>
                ) : null}
              </View>
              <Button
                testID="paywall.monthly.cta"
                variant="primary"
                fullWidth
                disabled={busy || !monthlyPrice}
                label={trialEligible ? t('paywall.action.trial') : t('paywall.action.subscribe')}
                onPress={handleMonthly}
                style={{ marginTop: 14 }}
              />
            </Surface>

            {yearlyPackage ? (
            <Surface elevation="raised" radius="md" className="mt-4 p-5">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold" style={{ color: colors.text }}>
                  {t('paywall.yearly.title')}
                </Text>
                {yearlyPrice ? (
                  <Text className="text-base font-semibold" style={{ color: colors.textSecondary }}>
                    {t('paywall.yearly.cta', { price: yearlyPrice })}
                  </Text>
                ) : null}
              </View>
              <Button
                testID="paywall.yearly.cta"
                variant="secondary"
                fullWidth
                disabled={busy || !yearlyPrice}
                label={t('paywall.action.subscribe')}
                onPress={handleYearly}
                style={{ marginTop: 14, borderWidth: 1, borderColor: colors.border }}
              />
            </Surface>
            ) : null}

            {lifetimePackage ? (
            <Surface elevation="raised" radius="md" className="mt-4 p-5">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold" style={{ color: colors.text }}>
                  {t('paywall.lifetime.title')}
                </Text>
                {lifetimePrice ? (
                  <Text className="text-base font-semibold" style={{ color: colors.textSecondary }}>
                    {t('paywall.lifetime.cta', { price: lifetimePrice })}
                  </Text>
                ) : null}
              </View>
              <Button
                testID="paywall.lifetime.cta"
                variant="secondary"
                fullWidth
                disabled={busy || !lifetimePrice}
                label={t('paywall.action.buy')}
                onPress={handleLifetime}
                style={{ marginTop: 14, borderWidth: 1, borderColor: colors.border }}
              />
            </Surface>
            ) : null}

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
