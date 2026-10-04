-- S22: AI usage and cost logging for the OpenRouter gateway (ADR 0027).
--
-- ai_interactions (ministry tools) and hq_sessions (Project HQ advisor and
-- Council) record the provider, the model that actually answered, token counts
-- and the cost OpenRouter reports. A Council session stores the sum over its six
-- calls, and model_used lists the distinct models joined by ", ". Cost is null
-- on the direct-Anthropic path (the API returns tokens, not price) and for any
-- row written before this migration.
-- Additive, nullable, idempotent; no RLS or policy change (existing row policies
-- cover the new columns).
--
-- Rollback (loses only the usage figures; the app then fails to log these columns,
-- so revert the code first):
--   alter table public.ai_interactions
--     drop column if exists prompt_tokens, drop column if exists completion_tokens,
--     drop column if exists cost_usd, drop column if exists provider;
--   alter table public.hq_sessions
--     drop column if exists model_used, drop column if exists prompt_tokens,
--     drop column if exists completion_tokens, drop column if exists cost_usd,
--     drop column if exists provider;

alter table public.ai_interactions
  add column if not exists prompt_tokens int,
  add column if not exists completion_tokens int,
  add column if not exists cost_usd numeric(12,6),
  add column if not exists provider text;

alter table public.hq_sessions
  add column if not exists model_used text,
  add column if not exists prompt_tokens int,
  add column if not exists completion_tokens int,
  add column if not exists cost_usd numeric(12,6),
  add column if not exists provider text;
