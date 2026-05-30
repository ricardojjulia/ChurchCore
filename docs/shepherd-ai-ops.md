# ShepherdAI for ChurchCore

**ShepherdAI for ChurchCore is an explainable workflow recommendation engine, not an AI chatbot. It uses structured ministry signals from Ops to generate Suggested Ministry Workflows for human review and action, with optional LLM assistance limited to wording and support content. It is product-specific and must not use or imply access to Academy or Care data.**

## Product Boundary

- Scope: ChurchCore only
- Data boundary: Ops tenant tables and Ops-approved domain logic only
- Prohibited sources: ChurchCore Academy and ChurchCore Care data
- Inference boundary: no cross-product assumptions or merged context

## Core Flow

1. Ops domain data is normalized into structured signals in `ai_signals`.
2. Deterministic signal scoring evaluates concern patterns.
3. Explainable suggestions are generated in `ai_suggestions`.
4. Suggestions can be promoted into `workflows`.
5. Human users assign, defer, dismiss, complete, and provide feedback.
6. Action and feedback history is persisted for audit and tuning.

## V1 Workflow Codes

- `reconnect_inactive_member`
- `volunteer_fatigue`
- `first_time_visitor_follow_up`
- `member_disengagement_trend`

## Guardrails

- Core triggering and scoring are deterministic and rule-based.
- Suggestions are advisory and must use non-diagnostic ministry-safe language.
- No hidden-cause inference and no certainty claims about spiritual condition.
- Message draft text is editable by users before any communication.
- ShepherdAI logic is centralized in `lib/shepherd-ai` and not scattered in UI controllers.

## Scheduled Evaluation (Cron)

- API endpoint: `GET /api/cron/shepherd-ai`
- Scheduler implementation: `lib/shepherd-ai/scheduler.ts`
- Cron trigger config: `vercel.json` (currently every 6 hours)

### Auth and Safety

- Set `CRON_SECRET` in deployment environment variables.
- Trigger with `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`.
- In production, requests are rejected if auth is missing or invalid.

### Runtime Requirements

- If local tenant DB fallback is active (`SUPABASE_DB_URL` on local setup), scheduler can enumerate tenants from `public.churches`.
- If local fallback is not active, set `TENANT_SUPABASE_SERVICE_ROLE_KEY` (or shared `SUPABASE_SERVICE_ROLE_KEY`) so scheduler can enumerate tenant churches and run jobs server-side.

### Optional Query Parameters

- `tenantId=<uuid>` to run for a single tenant.
- `maxTenants=<number>` to cap a multi-tenant pass.
