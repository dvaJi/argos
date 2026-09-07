# Plan

1. Extend `AcpAgentDiagnostics.authMethods` with the optional protocol-provided name.
2. Preserve that name in `computeAcpDiagnostics`.
3. Render the name as the action label, with a humanized ID fallback.
4. Add runtime mapping and renderer interaction tests.
5. Run formatting, focused tests, typecheck, lint, and React Doctor.

