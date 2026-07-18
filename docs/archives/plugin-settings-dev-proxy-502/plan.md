# Plan

1. Let the daemon plugin presenter receive an optional settings origin after server startup.
2. Prefix `settings.open` URLs with that origin for loopback hosts.
3. Keep relative URLs for non-loopback hosts.
4. Cover both URL forms and rerun daemon validation.
