# Contributing

Thank you for your interest in contributing to this open-source project. Everyone is welcome—whether you are fixing a bug, improving documentation, or adding a feature.

Please follow the guidelines below to make the review and merge process smooth and fast.

**Where to start**
- Fork the repository from the `main` branch on the upstream repository.
- Work on your fork and create a descriptive branch name (for example: `feature/add-foo`, `fix/issue-123`).
- When your change is ready, open a Pull Request (PR) against the upstream `dev` branch.

**Pull Request checklist**
- Link the PR to an existing issue when applicable, or describe the problem the PR solves.
- Provide a short, clear PR description explaining what changed and why.
- Include before/after screenshots for any UI changes or a short screencast when helpful. For bugs, include additional screenshots that clearly show the issue and the steps to reproduce it.
- If the PR introduces or fixes a bug, include a short reproduction section: steps to reproduce, expected behavior, and actual behavior.

**Screenshots and attachments**
- Please attach screenshots directly to the PR description or upload them to the issue. If you include multiple screenshots, clearly label them (e.g., "before", "after", "error-output").

**Code quality**
- Write clear, well-structured code that follows the repository's style and guidelines.
- Keep TypeScript strictness and typing in mind; prefer explicit interfaces and avoid `any` unless absolutely necessary.
- Follow the existing project patterns for components, services, and utilities.
- Add or update tests where appropriate. Run `npx tsc --noEmit` to ensure the TypeScript build passes locally.

**Before opening a PR — quick local checks**
- Run the type checker: `npx tsc --noEmit`.
- Start the dev server to smoke-test UI changes: `npm install` then `npm run dev`.
- Run any existing tests or linters if available.

**Commit messages and history**
- Use clear, descriptive commit messages. Group related changes into single commits when possible.

**Review process**
- Project maintainers will review PRs and may request changes. Please respond to feedback and update your branch as needed.
- Small, focused PRs are easier to review and get merged faster.

**Security and sensitive data**
- Do not include API keys, credentials, or other secrets in commits. Use environment variables and `.env.local` for local development.

**Questions or help**
- If you need help getting started or want to discuss a larger change, open an issue or contact a maintainer before starting work.

**More guidance**
- See [AGENTS.md](AGENTS.md) for additional development conventions and style guidance used by this project.

Thanks again for contributing — your help improves the project for everyone!
