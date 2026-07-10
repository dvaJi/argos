# Argos Agent Creation Web Mode

## Problem
The `#/settings/argos-agents` page can load in the browser-backed settings app, but creating a new Argos agent fails because `configPresenter.createArgosAgent` has no web bridge mapping or shared route contract.

## Goal
Enable Argos agent creation, update, delete, and refresh in web mode so the settings page behaves the same way as the desktop renderer.

## Acceptance Criteria
- Creating an Argos agent from `#/settings/argos-agents` succeeds in web mode.
- The newly created agent appears in the list after creation.
- The bridge no longer logs `Unmapped presenter call: configPresenter.createArgosAgent` for the supported Argos agent actions.
- Existing desktop behavior remains unchanged.

## Constraints
- Keep the implementation aligned with the shared route contract pattern already used by other config operations.
- Avoid renderer-only workarounds that bypass the presenter boundary.

