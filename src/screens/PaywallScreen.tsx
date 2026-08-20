import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { ScreenHeader, useScreenHeaderHeight, Button, Surface } from '../components/ui';
import PaywallFeatureGrid from '../components/paywall/PaywallFeatureGrid';
import { useTheme } from '../contexts/ThemeContext';
import { useProStore } from '../stores/proStore';
import { getIntroEligibilities, trackPaywallImpression } from '../services/RevenueCatService';
import * as PaywallAnalytics from '../services/PaywallAnalytics';

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
  const configured = useProStore((s) => s.configured);
  const currentOffering = useProStore((s) => s.currentOffering);
  const isPurchasing = useProStore((s) => s.isPurchasing);
  const isRestoring = useProStore((s) => s.isRestoring);
  const error = useProStore((s) => s.error);
  const loadOfferingsIfNeeded = useProStore((s) => s.loadOfferingsIfNeeded);
  const purchaseMonthly = useProStore((s) => s.purchaseMonthly);
  const purchaseYearly = useProStore((s) => s.purchaseYearly);
  const purchaseLifetime = useProStore((s) => s.purchaseLifetime);
  const restore = useProStore((s) => s.restore);

  const [introEligible, setIntroEligible] = useState<Record<string, boolean>>({});
  const [restoreNotice, setRestoreNotice] = useState<'nothing' | null>(null);
  const openedAtRef = useRef(Date.now());

  useEffect(() => {
    void loadOfferingsIfNeeded();
  }, [loadOfferingsIfNeeded]);

  // Paywall is a leaf screen (only goBack): every entry path funnels through
  // root-stack navigate('Paywall'), and navigating to an already-focused leaf
  // screen is a no-op — mount == presentation, so exactly one impression per
  // view (#935).
  useEffect(() => {
    const openedAt = openedAtRef.current;
    PaywallAnalytics.trackPaywallOpen();
    if (configured) {
      void trackPaywallImpression(currentOffering ?? undefined);
    }
    return () => {
      PaywallAnalytics.trackPaywallClose(
        Date.now() - openedAt,
        useProStore.getState().status === 'pro',
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthlyProductId = monthlyPackage?.product.identifier;
  const yearlyProductId = yearlyPackage?.product.identifier;
  useEffect(() => {
    const ids = [monthlyProductId, yearlyProductId].filter(
      (id): id is string => typeof id === 'string',
    );
    if (ids.length === 0) return;
    let cancelled = false;
    getIntroEligibilities(ids)
      .then((result) => {
        if (!cancelled) setIntroEligible(result);
      })
      .catch(() => {
        if (!cancelled) setIntroEligible({});
      });
    return () => {
      cancelled = true;
    };
  }, [monthlyProductId, yearlyProductId]);

  const monthlyTrialEligible = monthlyProductId ? introEligible[monthlyProductId] === true : false;
  const yearlyTrialEligible = yearlyProductId ? introEligible[yearlyProductId] === true : false;

  const monthlyPrice = monthlyPackage?.product.priceString;
  const yearlyPrice = yearlyPackage?.product.priceString;
  const lifetimePrice = lifetimePackage?.product.priceString;
  const busy = isPurchasing || isRestoring;

  const handleMonthly = useCallback(() => {
    if (!monthlyPackage) return;
    setRestoreNotice(null);
    PaywallAnalytics.trackCtaTap(monthlyPackage.product.identifier);
    void purchaseMonthly().then(() => {
      if (useProStore.getState().status === 'pro') navigation.goBack();
    });
  }, [monthlyPackage, purchaseMonthly, navigation]);

  const handleYearly = useCallback(() => {
    if (!yearlyPackage) return;
    setRestoreNotice(null);
    PaywallAnalytics.trackCtaTap(yearlyPackage.product.identifier);
    void purchaseYearly().then(() => {
      if (useProStore.getState().status === 'pro') navigation.goBack();
    });
  }, [yearlyPackage, purchaseYearly, navigation]);

  const handleLifetime = useCallback(() => {
    if (!lifetimePackage) return;
    setRestoreNotice(null);
    PaywallAnalytics.trackCtaTap(lifetimePackage.product.identifier);
    void purchaseLifetime().then(() => {
      if (useProStore.getState().status === 'pro') navigation.goBack();
    });
  }, [lifetimePackage, purchaseLifetime, navigation]);

  const handleRestore = useCallback(async () => {
    setRestoreNotice(null);
    PaywallAnalytics.trackRestoreTap();
    const outcome = await restore();
    if (outcome === 'restored') {
      navigation.goBack();
    } else if (outcome === 'nothing') {
      setRestoreNotice('nothing');
    }
    // 'error' surfaces through the existing error banner path.
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

        <View className="mt-6">
          <PaywallFeatureGrid />
        </View>

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
                    {monthlyTrialEligible
                      ? t('paywall.monthly.trialCta', { price: monthlyPrice })
                      : t('paywall.monthly.price', { price: monthlyPrice })}
                  </Text>
                ) : null}
              </View>
              <Button
                testID="paywall.monthly.cta"
                variant="primary"
                fullWidth
                disabled={busy || !monthlyPrice}
                label={monthlyTrialEligible ? t('paywall.action.trial') : t('paywall.action.subscribe')}
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
                    {yearlyTrialEligible
                      ? t('paywall.yearly.trialCta', { price: yearlyPrice })
                      : t('paywall.yearly.cta', { price: yearlyPrice })}
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
              onPress={() => void handleRestore()}
            >
              {isRestoring ? (
                <View className="flex-row items-center gap-2" testID="paywall.restoring">
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text className="text-sm font-medium" style={{ color: colors.accent }}>
                    {t('paywall.restoring')}
                  </Text>
                </View>
              ) : (
                <Text className="text-sm font-medium" style={{ color: colors.accent }}>
                  {t('paywall.restore')}
                </Text>
              )}
            </TouchableOpacity>

            {restoreNotice === 'nothing' ? (
              <Surface elevation="raised" radius="md" className="mt-4 p-4" testID="paywall.restore-nothing">
                <Text className="text-[13px] text-center leading-[18px]" style={{ color: colors.textSecondary }}>
                  {t('paywall.nothingToRestore')}
                </Text>
              </Surface>
            ) : null}

            <Text className="text-xs text-center mt-6 leading-[18px]" style={{ color: colors.textSecondary }}>
              {t('paywall.termsNote')}
            </Text>

            <View className="flex-row justify-center gap-4 mt-3">
              <Pressable
                testID="paywall.terms-link"
                role="link"
                accessibilityRole="link"
                onPress={() => void Linking.openURL('https://www.gitnotes.org/terms')}
              >
                <Text className="text-xs font-medium" style={{ color: colors.accent }}>
                  {t('paywall.footer.terms')}
                </Text>
              </Pressable>
              <Pressable
                testID="paywall.privacy-link"
                role="link"
                accessibilityRole="link"
                onPress={() => void Linking.openURL('https://www.gitnotes.org/privacy')}
              >
                <Text className="text-xs font-medium" style={{ color: colors.accent }}>
                  {t('paywall.footer.privacy')}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
