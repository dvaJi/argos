// Re-export the canonical scheduled-task helpers from @argos/backend-core so the
// desktop runtime shares one recurrence/normalization implementation with the
// daemon. Keeping a second copy here caused the daily/weekly `lastFiredAt` floor
// fix to drift between runtimes (the desktop scheduler kept refiring the same
// occurrence in a loop). Any future change only needs to land in backend-core.
export {
  computeNextFireAt,
  normalizeScheduledTasksConfig,
  shouldBackfillOneShot,
  startOfMinuteForTests,
} from "@argos/backend-core/scheduled/normalize";
