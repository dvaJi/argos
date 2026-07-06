# Tasks

Relay is the final piece; these are design/decision tasks for a future implementation SDD, not immediate work.

- [ ] Define relay threat model (reachability ≠ trust; relay never sees session secrets).
- [ ] Decide identity provider strategy (first-party, GitHub OAuth, Clerk-like, or pluggable).
- [ ] Define environment registration data and what metadata is safe to publish to cloud.
- [ ] Define tunnel protocol options and recommendation (WS reverse tunnel, HTTP CONNECT, QUIC, managed binary).
- [ ] Define local daemon link/unlink lifecycle + environment keypair.
- [ ] Define client environment discovery flow (cloud lookup → relay endpoint → daemon pairing/session).
- [ ] Verify `relay` exposure mode (`DaemonExposureConfig`) enforces `bearer-session` only.
- [ ] Split implementation into service/repo milestones (cloud API, relay service, daemon tunnel client, client discovery).
