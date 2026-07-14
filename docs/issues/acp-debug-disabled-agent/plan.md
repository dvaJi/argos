# Plan

1. Keep the existing backend invariant: only enabled agents are returned by `getAcpAgents`.
2. Gate the installed-agent Debug button on the same enabled state and give the user a clear explanation.
3. Safely read optional saved replay metadata in the ACP debug import path.
4. Validate the UI TypeScript surface, formatting, and linting.
