# Plan

1. Define pure UI-state helpers for install and enable lifecycle labels.
2. Enable newly installed registry agents as part of the install flow.
3. Flatten registry and manual agent presentation into divided rows.
4. Replace the nested diagnostics card with an always-visible connection summary and progressive details.
5. Rework registry actions so installed agents are not presented primarily as an uninstall target.
6. Add skeleton, empty, error, and disabled feedback using existing shadcn primitives.
7. Add focused regression tests and run formatting, lint, typecheck, and React Doctor.
8. Send a one-shot connection-check request after a successful enable or fresh install, without treating initial page load as an enable action.
9. Reduce the resting height of each agent row with compact spacing, icon actions with accessible tooltips, and one
   progressive disclosure for technical connection details.

## Compatibility

- Existing saved ACP configuration remains valid.
- Existing disabled agents remain disabled; only fresh installs opt into enablement.
- Repair and update preserve the current enabled state.
- Existing enabled agents are not started when settings opens. Only an explicit off-to-on action or fresh install requests an automatic check.
- Compact presentation changes do not remove any action or diagnostic field; they only change its default visibility.
