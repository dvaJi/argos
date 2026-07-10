# DeepSeek Provider Model Save

## Problem
In web mode at `/#/settings/provider/deepseek`, the provider page shows the Connection and Models tabs, but model enable/disable changes do not persist.

## Goal
Make provider model changes for DeepSeek persist in browser/web mode the same way they do in the desktop IPC path.

## Acceptance Criteria
- The provider models list can load in web mode.
- Enabling or disabling DeepSeek models persists after refresh.
- The existing connection tab behavior is unchanged.

## Non-goals
- No redesign of the provider settings UI.
- No change to the model-store data model.
