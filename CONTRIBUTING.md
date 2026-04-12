# Contributing to Stave

Thank you for your interest in contributing to Stave! This document explains how to contribute and what to expect from the process.

## License

By contributing to Stave, you agree that your contributions will be licensed under the [GNU Affero General Public License v3.0](./LICENSE).

**Stave does not use a CLA (Contributor License Agreement).** Your contributions remain yours, licensed under AGPL 3.0 in perpetuity. We will never re-license community contributions under a different license.

## Developer Certificate of Origin (DCO)

All commits must be signed off with the [Developer Certificate of Origin](https://developercertificate.org/) (DCO). This certifies that you have the right to submit the code under the project's license.

To sign off, add `-s` to your commit command:

```bash
git commit -s -m "feat: add new feature"
```

This adds a `Signed-off-by: Your Name <your@email.com>` line to the commit message. If you forget, you can amend the last commit with:

```bash
git commit --amend -s
```

## How to Contribute

### Reporting Bugs

1. Search [existing issues](https://github.com/MrityunjayBhardwaj/stave/issues) first
2. If your bug isn't already reported, open a new issue with:
   - What you expected to happen
   - What actually happened
   - Steps to reproduce
   - Browser and OS version

### Proposing Features

Open an issue describing the feature, its motivation, and how it fits into Stave's direction. Discussion before implementation saves everyone time.

### Pull Requests

1. Fork the repository
2. Create a branch from `main` with a descriptive name (`fix/`, `feat/`, `chore/` prefix)
3. Make your changes
4. Run the test suite: `cd packages/editor && npx vitest run`
5. Run type checking: `cd packages/editor && npx tsc --noEmit`
6. Sign off all commits (see DCO section above)
7. Open a PR against `main` with a clear description

### Commit Style

We use [gitmoji](https://gitmoji.dev/) prefixes in commit messages:

```
<emoji> <type>: short summary

Problem: what was broken and why
Fix: what was changed and how it solves it
```

Common prefixes: `fix:`, `feat:`, `chore:`, `docs:`, `test:`, `refactor:`

## What NOT to Commit

The `.gitignore` is comprehensive, but please double-check that your PR does not include:

- AI tool configuration files (`CLAUDE.md`, `AGENTS.md`, `.cursor*`, `.aider*`)
- Personal documents, strategy notes, or thesis drafts
- Planning framework output (`.planning/`, `.anvi/`)
- Environment files (`.env`, `.env.local`)
- IDE configuration (`.vscode/`, `.idea/`)
- OS artifacts (`.DS_Store`, `Thumbs.db`)

## Development Setup

```bash
# Clone the repo
git clone https://github.com/MrityunjayBhardwaj/stave.git
cd stave

# Install dependencies
pnpm install

# Run the editor test suite
cd packages/editor && npx vitest run

# Start the dev server
cd packages/app && pnpm dev
```

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Questions?

Open an issue or start a discussion. We're happy to help.
