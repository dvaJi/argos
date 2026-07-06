# ACP Existing Thread Inline Options

## Goal

Ensure ACP thread sessions show `ChatStatusBar` inline config options when the user opens an existing thread, not only when starting a new thread.

## Problem

- Existing ACP threads can activate in the renderer before their ACP runtime session has been prepared.
- `ChatStatusBar` requests ACP config options immediately and receives an empty state, leaving `acpInlineOptions` empty.

## Acceptance Criteria

- Opening an existing ACP-backed thread hydrates ACP config options before returning the session config state.
- `acpInlineOptions` is populated for reopened ACP threads when options exist for that session.
- New ACP thread behavior remains unchanged.

## Constraints

- Keep the fix minimal and within the existing ACP presenter/session flow.
- Do not add new IPC contracts unless they are required.

## Non-Goals

- Redesigning the ACP config UI.
- Changing how non-ACP sessions load status bar settings.
