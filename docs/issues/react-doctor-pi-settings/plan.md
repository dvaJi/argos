# Plan

1. Convert affected async handlers to promise chains whose `finally` callbacks retain the loading cleanup.
2. Preserve sequential ACP health-check behavior and existing error notifications.
3. Leave Pi package errors unchanged until a request resolves or rejects, avoiding the synchronous effect update.
4. Validate the changed renderer code and React Doctor diff scan.
