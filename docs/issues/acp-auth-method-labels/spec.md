# ACP authentication method labels

## Problem

ACP agents may advertise multiple authentication methods. The runtime currently removes each method's `name` while creating diagnostics, so the settings UI can only render repeated generic “Authenticate” buttons. Distinct choices therefore look like accidental duplicates.

## Acceptance criteria

- Preserve the ACP-provided authentication method name in diagnostics.
- Give every authentication action a distinct, understandable accessible name.
- Fall back to a readable form of the method ID when an older agent omits a name.
- Preserve the method ID sent to the existing authenticate action.
- Cover multiple authentication methods and the fallback behavior with tests.

## Constraints

- Do not merge methods solely because their type or visible name matches; different IDs may represent different credentials.
- Do not change the ACP wire protocol or authentication action payload.

## Non-goals

- Redesigning the authentication protocol.
- Automatically choosing an authentication method for the user.

