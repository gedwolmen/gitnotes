# gitnotes

gitnotes is a Dioxus + Rust app for viewing and editing `.org`, `.norg`, and `.md` files stored in GitHub repositories.

## Workspace Layout

- `app`: Dioxus application shell and routes
- `crates/gn-core`: shared domain types (`DocumentFormat`, repository/file refs)
- `crates/gn-parser`: parser facade and format modules (markdown/org/neorg stubs)
- `crates/gn-github`: GitHub client foundation and file filtering helpers

## Quickstart

1. Install toolchain requirements:

```bash
rustup toolchain install stable
rustup target add wasm32-unknown-unknown
```

2. Build and test the workspace:

```bash
cargo fmt --all
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
cargo check --workspace
```

3. Run the app shell (desktop):

```bash
cargo run -p app
```

To load repositories from GitHub in the `Repos` route, set a token:

```bash
export GITNOTES_GITHUB_TOKEN="<github-token-with-repo-scope>"
```

## Current Status

This repository now includes the foundation scaffold:

- workspace Cargo setup
- Dioxus route skeleton (`/`, `/repos`, `/files`, `/viewer`, `/settings`)
- parser and GitHub integration crates ready for implementation
- CI pipeline for format, lint, test, and check
- repository route wired to fetch authenticated GitHub repositories
