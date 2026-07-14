# Plan

1. Make daemon `settings.open` validate the contribution and return its hosted URL.
2. Add a traversal-safe resolver for the contribution entry and sibling assets.
3. Serve the entry, assets, and a generic postMessage bridge from authenticated daemon HTTP routes.
4. Add a sandboxed dialog in Plugin settings and forward bridge requests through `PluginClient`.
5. Cover the daemon action/resource resolution and renderer dialog/action bridge.
6. Run focused tests, typechecks, React Doctor, formatting, and linting.
