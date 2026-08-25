# ACP Daemon State Ownership Tasks

- [x] Remove desktop ACP state stack from `ConfigPresenter` (stores, registry
      service, launch spec service, migration hooks).
- [x] Rewire ACP methods to daemon routes; delete routeless/no-caller members.
- [x] Update `IConfigPresenter` interface.
- [x] Remove desktop-duplicate ACP tests.
- [x] Verify desktop + daemon suites, typecheck, lint, format.
