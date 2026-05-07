# testID Naming Contract

## Convention

Pattern: `scope.elementType.action[-variant]`

All kebab-case. No camelCase. No spaces. No special characters.

### Examples

- `home.button.create-note`
- `notes-list.search-bar.search`
- `todo-card.checkbox.toggle`
- `settings.toggle.biometric-lock`
- `canvas-editor.toolbar.undo`
- `chat-message-bubble.button.long-press`

## Rules

1. Every interactive element MUST have a testID
2. testID MUST follow `scope.elementType.action` pattern
3. Scope = component name or screen name in kebab-case
4. ElementType: button, icon-button, input, toggle, checkbox, tab, search-bar, filter, sort, picker, toolbar-action, modal-trigger, context-menu-item, drag-handle, swipe-action
5. Action = handler name or descriptive action in kebab-case

## Dynamic List Rule

For repeated elements in lists (todo items, note cards, template items):

- Use: `scope.elementType.action-${uniqueKey}`
- Example: `template-list-item.icon-button.pin-${templateId}`
- NEVER use index-only: `todo-card-${0}` ← FORBIDDEN
- ALWAYS use stable key: `todo-card.checkbox.toggle-${todoId}` ← CORRECT

## Validation

Run: `yarn e2e:testid:validate`

Checks:

- No duplicate testIDs across the codebase
- No empty testID values
- No index-only testID patterns (`-${number}` at end without stable key)
- All testIDs follow `scope.elementType.action` pattern
