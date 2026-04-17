# Private Repo Launch Checklist

Use this checklist immediately after creating the private GitHub repository for ChurchForge.

## Repository Settings

- Keep the repository private.
- Protect `main` and require pull requests for direct changes.
- Require the CI workflow to pass before merge.
- Require at least one review on pull requests.
- Restrict force pushes and branch deletion on protected branches.

## Security Features

Enable the following GitHub security features if your plan supports them:

- Dependency graph
- Dependabot alerts
- Dependabot security updates
- Code scanning
- Secret scanning
- Secret scanning push protection

The repository already includes workflow-level checks for CI, CodeQL, dependency review, and secret scanning. Native GitHub security features should still be enabled in the repository settings after the first push.

## Local Demo Workflow

- Copy `.env.example` to `.env.local` and fill local Supabase values from `npx supabase status --output env`.
- Run `npx supabase start`.
- Run `npx supabase db reset`.
- Run `./supabase/scripts/create-dev-users.sh`.
- Read the generated local demo credentials from `.demo-credentials.local`.

## First Review Pass

- Confirm `README.md` reflects the intended private evaluation posture.
- Confirm no machine-local files are staged.
- Confirm the seeded demo routes load locally for both preview mode and local Supabase mode.
- Confirm GitHub Actions are enabled for the repository after the first push.
