-- ============================================================
-- Security: tenant_connections credential hardening
-- Ref: docs/security-assessment.md (C-1)
-- Ref: docs/security-mitigation-plan.md (P1-D)
--
-- db_url stores raw connection strings (including passwords)
-- in plaintext. This migration prepares the schema to move
-- credentials into Supabase Vault (pgsodium).
--
-- Adds: vault_secret_name text
--   When set, this is the name of a Vault secret that holds
--   the actual connection string. The application should
--   prefer vault_secret_name over db_url when both are set.
--
-- Migration path (requires Vault enabled on project):
--   select vault.create_secret(db_url, 'tenant_db_' || tenant_id::text, 'ChurchCore tenant DB URL')
--   update tenant_connections set vault_secret_name = 'tenant_db_' || tenant_id::text where ...;
--   update tenant_connections set db_url = null where vault_secret_name is not null;
--
-- Until Vault is provisioned, db_url continues to function.
-- ============================================================

-- Add vault reference column
alter table public.tenant_connections
  add column if not exists vault_secret_name text;

-- Ensure at least one connection method is always set.
-- db_url OR vault_secret_name must be non-null — prevents
-- silent misconfiguration during the migration window.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_connections_has_credential_source'
  ) then
    alter table public.tenant_connections
      add constraint tenant_connections_has_credential_source
      check (db_url is not null or vault_secret_name is not null);
  end if;
end $$;

-- Add a column to flag that db_url has been migrated to Vault
-- so operators know which rows still need rotation.
alter table public.tenant_connections
  add column if not exists credentials_migrated_to_vault boolean not null default false;

comment on column public.tenant_connections.db_url is
  'DEPRECATED — Plaintext connection string. Migrate to vault_secret_name. '
  'Set to null once vault_secret_name is confirmed working.';

comment on column public.tenant_connections.vault_secret_name is
  'Supabase Vault secret name holding the tenant DB connection string. '
  'Use vault.decrypted_secrets to fetch the actual value server-side.';
