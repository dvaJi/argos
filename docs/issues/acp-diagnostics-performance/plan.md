# Plan

1. Confirm the compiler configuration and partition the supplied profile into React and non-React work.
2. Trace the diagnostic request through the daemon and ACP process manager.
3. Preserve the existing per-agent/workspace warmup reuse path and improve only user-visible responsiveness where needed.
4. Stabilize the daemon client identity so the diagnostics refresh effect only runs when its agent or workspace changes.
5. Ask for matching React Scan Optimize-tab formatted data after reproducing the exact interaction, then compare the result before a deeper runtime optimization.
