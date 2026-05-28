# Dev Startup Troubleshooting

Use this guide when `npm run dev` fails to start or exits with code 1.

## Fast Recovery (Clean Reinstall + Cache Reset)

Run from the repo root:

```bash
rm -rf node_modules .next
npm cache clean --force
npm cache verify
npm ci
npm run dev
```

Expected success signal:

- Next.js logs `Ready` and shows `http://localhost:4200`

## Confirm the App Is Serving

In another terminal:

```bash
curl -I -s http://localhost:4200 | head -n 1
```

Expected output:

- `HTTP/1.1 200 OK`

## Common Causes of Transient Failures

- Stale `.next` artifacts from interrupted runs
- Corrupted or partial `node_modules` state after interrupted install
- npm cache inconsistency after abrupt process termination
- Existing process already bound to port `4200`

## Port 4200 Conflict Check

```bash
lsof -i :4200
```

If another process owns the port, stop it and re-run `npm run dev`.

## Baseline Environment Expectations

- Node.js `22.13.0` or newer
- Repo dependencies installed via `npm ci`
- Optional local backend path initialized with `npm run setup:local`

## Escalation Checklist

If startup still fails after fast recovery:

1. Capture the full terminal output from `npm run dev`.
2. Confirm runtime version with `node -v`.
3. Run `npm run lint` and `npm run build` to detect project-level breakage.
4. Open an issue with error output and the command history used.
