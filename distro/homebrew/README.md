# argos-daemon Homebrew formula

This directory holds the **source of truth** for the `argos-daemon` Homebrew formula.
It is published to the live tap repository [`dvaJi/homebrew-tap`][tap] by
`scripts/bump-tap.mjs` whenever a release is published.

[tap]: https://github.com/dvaJi/homebrew-tap

## For users

```bash
brew tap dvaJi/tap
brew install argos-daemon
```

Then:

```bash
argos-daemon --help
```

## For maintainers

The formula is regenerated from `Formula/argos-daemon.rb` on each release:

1. Publish the draft GitHub release (so assets are publicly downloadable).
2. Run:

   ```bash
   ARGOS_TAP_TOKEN=<github-token-with-repo-scope> pnpm run distro:bump-tap -- 0.1.0
   ```

   This resolves the published release assets, computes each `sha256`, rewrites
   `version` / `url` / `sha256`, and pushes the formula to `dvaJi/homebrew-tap`.

`brew audit --strict` validates the live tap. `ruby -c Formula/argos-daemon.rb`
validates syntax locally without brew.
