# Plan

## Approach

Patch `AgentSessionPresenter.getAcpSessionConfigOptions()` so that ACP-backed sessions with empty config state proactively initialize/prepare their ACP runtime before the config state is returned.

## Flow

1. Read the stored session record.
2. Return early for non-ACP sessions.
3. Fetch the current ACP config state.
4. If the state is empty and the session has a project directory, ensure the session runtime is initialized and call ACP session preparation.
5. Read and return the config state again.

## Compatibility

- Existing ACP draft/new-thread flow keeps using the current preparation path.
- Existing sessions only pay the extra prepare call when their config options are still empty.

## Validation

- Run `pnpm run format`.
- Run `pnpm run i18n`.
- Run `pnpm run lint`.
