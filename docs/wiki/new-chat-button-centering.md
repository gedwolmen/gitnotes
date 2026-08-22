# New Chat Button — Label Centering Fix

The Chat list's **New Chat** button rendered its label off-center: with the
leading `+` icon, the icon+label pair was centered as a unit, so "New Chat"
sat ~half-an-icon **right** of the button's true center.

Root cause: `Button`'s optical-centering logic only handled the trailing-icon
case. `iconAlign="edge"` pins the trailing icon to the right edge and wraps the
label in a flex-row with **equal-width spacers** on both sides, keeping the
text dead-center (the onboarding "Next" bug). The same shift applies to a
leading icon, but `Button` never treated `leadingIcon` as an edge case —
`useEdgeIcon` was gated on `hasTrailingIcon` alone.

Fix:

- `src/components/ui/Button.tsx`: edge mode now triggers on a leading **or**
  trailing icon. A leading icon is pinned `absolute left-5` (mirroring the
  trailing `right-5`), and the centered label row reserves the same 20px
  spacer on both sides, so the label stays at the button's true center.
- `src/screens/ChatThreadListScreen.tsx`: the New Chat button opts into the
  edge alignment with `iconAlign="edge"` (it is full-width, so the pinned icon
  has room).

Behavior is unchanged for `iconAlign="inline"` (default): narrow buttons keep
the icon inline next to the label.

## Tests

- `__tests__/ui/Button.test.tsx`: leading-icon + `iconAlign="edge"` renders
  through the centeredContent spacer path (mirrors the trailing-icon test).
