# Plan

1. Resolve the daemon backup directory from `DaemonConfigPresenter`, with the current managed directory as fallback.
2. Use the resolved directory consistently across local and cloud backup operations.
3. Pass the displayed sync path through the native open-folder route.
4. Let backup errors reach DataSettings and show actionable feedback.
5. Add daemon and renderer regression coverage, then validate.
