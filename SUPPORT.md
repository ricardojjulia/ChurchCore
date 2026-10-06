# Support

ChurchCore is a multi-tenant church operations platform licensed under AGPL-3.0. This page explains where to ask for help and what to include.

---

## Where to Ask for Help

- **Running it locally:** start with [HOWTO.md](HOWTO.md), then [docs/setup/dev-startup-troubleshooting.md](docs/setup/dev-startup-troubleshooting.md) and [docs/setup/local-supabase.md](docs/setup/local-supabase.md).
- **Bug reports:** open an issue with the **Bug report** template (`.github/ISSUE_TEMPLATE/bug-report.md`).
- **Feature proposals:** open an issue with the **Feature request** template, describing the ministry or operational problem and the [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) section it belongs to.
- **Security issues:** do not open a public issue. Report privately as described in [SECURITY.md](SECURITY.md).
- **Trying the product:** the hosted demo and its accounts are in the [README](README.md#-try-the-demo) and [docs/setup/demo-install.md](docs/setup/demo-install.md).

---

## What to Include When Opening an Issue

To help us investigate quickly, please provide:

1. **Environment:** operating system, `node -v`, `npm -v`, and whether you ran preview mode, local Supabase, or a hosted deploy.
2. **Commit SHA** or release tag.
3. **Role and route:** which role you were signed in as and the exact route (for example `/app/church-admin/giving` as Church Administrator).
4. **Exact reproduction steps**, and any commands you ran (`npm run test`, `npm run test:e2e:local -- <spec>`).
5. **Sanitized error output.** Never include API keys, `.env.local` contents, `.demo-credentials.local`, or real church, member, child or donor data.

---

## Response Expectations

ChurchCore is working toward its November 6, 2026 MVP. Issues are triaged into the [`DEVELOPMENT_PLAN.md` §0](DEVELOPMENT_PLAN.md#0-mvp-roadmap-to-november-6-2026-tracker) tracker and ranked like any other work; beta feedback becomes a `B-n` tracker row.
