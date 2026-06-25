# Plan

## Implementation

1. Add a denylist for China-specific built-in providers and filter default provider catalogs in both shared backend-core and desktop main config.
2. Remove China-specific provider IDs from install deeplink custom type support and provider database-backed IDs.
3. Simplify shared i18n menu/error helper to the English locale that the renderer currently forces.
4. Remove Chinese keyword aliases from settings navigation and Spotlight actions.
5. Keep ACP registry untouched and report the likely China-affiliated entries for user selection.

## Affected Interfaces

- `DEFAULT_PROVIDERS` remains exported with the same type.
- `SUPPORTED_PROVIDER_INSTALL_CUSTOM_TYPES` remains exported with the same shape.
- `supportedLocales`, `getContextMenuLabels`, and `getErrorMessageLabels` remain exported.

## Compatibility

Existing saved providers are not deleted. This change only removes the providers from built-in defaults and install deeplink type support.

## Validation

Run formatting, i18n validation if available, and lint. If scripts are missing or fail for unrelated environment reasons, report that explicitly.

## Follow-Up Cleanup

- Remove the standalone providerDbCatalog.ts helper and keep provider install/deeplink/provider metadata in one shared module.
- Remove the duplicate desktop default provider catalog and import defaults from backend-core.

