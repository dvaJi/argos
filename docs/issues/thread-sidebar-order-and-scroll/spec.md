# Thread sidebar order and scrolling

- Show Working above Active, with Pinned retaining its existing priority.
- Keep keyboard navigation and numbered shortcuts in visual order.
- Scroll session rows independently so the bottom controls stay visible.
- Verify how saved lifecycle settings affect older threads and preserve their existing retention rules.
- Keep `docs/features/thread-sidebar-v3` in sync with the new order and the verified retention rule.
- Guard the order with a render test: DOM sections, published rows (`onVisibleRowsChange`), shortcut badges and
  ArrowDown navigation all follow the same sequence.

## Verified retention rules (preserved, no code change)

- Defaults: settle after 7 idle days, archive 30 days after settling, auto-delete Off.
- The inactivity clock is max(last activity, `updatedAt`). The daemon bumps `updatedAt` on view/rename/pin, so
  opening an older thread can restart the clock.
