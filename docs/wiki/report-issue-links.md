# Report Bugs & Feature Requests Links

## What

Users can now surface bugs and feature requests directly from inside the app:
both the Settings screen and the onboarding flow link out to the project's
GitHub issues page.

Target URL: `https://github.com/gedwolmen/gitnotes/issues`

## Where

### Settings (`src/components/settings/SettingsContent.tsx`)

A new row in the **About** group, directly under the Version row:

- Label: `t('settings.reportIssue')` — "Report bugs and feature requests"
  (added to all six locales: en/es/fr/de/ja/ko)
- Trailing `open-outline` icon in accent color
- `testID="settings.row.report-issue"`
- `onPress` → `Linking.openURL('https://github.com/gedwolmen/gitnotes/issues')`

### Onboarding (`src/screens/OnboardingScreen.tsx`)

A persistent footer link below the navigation buttons, rendered on every
onboarding step:

- Text: "Found a bug or have a feature request? **Report it on GitHub Issues**"
- `testID="onboarding.button.report-issue"` on the tappable inner `Text`
- `onPress` → `Linking.openURL('https://github.com/gedwolmen/gitnotes/issues')`

Unlike the Settings row, the onboarding footer is plain English by design —
the rest of the onboarding screen is not i18n'd.

## Tests

- `__tests__/screens/SettingsScreen.test.tsx` — presses
  `settings.row.report-issue` and asserts `Linking.openURL` is called with the
  issues URL.
- `__tests__/screens/OnboardingScreen.pro-gate.test.tsx` — asserts the footer
  link renders on the first step and opens the issues URL on press.

Both spy on `Linking.openURL` with `jest.spyOn(...).mockResolvedValue(undefined)`.
