import type { TFunction } from 'i18next';

export type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type ShowAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: { onDismiss?: () => void },
) => void;

export function confirmUnverifiedWrite(
  t: TFunction,
  onConfirm: () => void,
  showAlert: ShowAlert,
  pendingConfirmationRef?: React.MutableRefObject<boolean>,
): void {
  if (pendingConfirmationRef) pendingConfirmationRef.current = true;
  showAlert(
    t('settings.writeAccessNotVerifiedTitle'),
    t('settings.writeAccessNotVerifiedBody'),
    [
      {
        text: t('common.cancel'),
        style: 'cancel',
        onPress: () => {
          if (pendingConfirmationRef) pendingConfirmationRef.current = false;
        },
      },
      {
        text: t('settings.addAnyway'),
        onPress: () => {
          if (pendingConfirmationRef) pendingConfirmationRef.current = false;
          onConfirm();
        },
      },
    ],
    {
      onDismiss: () => {
        if (pendingConfirmationRef) pendingConfirmationRef.current = false;
      },
    },
  );
}

export function showTransientAccessConfirmation(
  t: TFunction,
  showAlert: ShowAlert,
  pendingConfirmationRef: React.MutableRefObject<boolean>,
  onRetry: () => void,
): void {
  pendingConfirmationRef.current = true;
  showAlert(
    t('settings.repositoryAccessTitle'),
    t('settings.transientAccessErrorBody'),
    [
      {
        text: t('common.cancel'),
        style: 'cancel',
        onPress: () => {
          pendingConfirmationRef.current = false;
        },
      },
      {
        text: t('common.retry'),
        onPress: () => {
          pendingConfirmationRef.current = false;
          onRetry();
        },
      },
    ],
  );
}
