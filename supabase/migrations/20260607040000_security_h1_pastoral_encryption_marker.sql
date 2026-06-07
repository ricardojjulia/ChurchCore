-- Security H-1: pastoral encryption deployment marker
-- pastoral_notes.content and care_assignments.summary remain text columns.
-- Application layer (lib/crypto/pastoral.ts) encrypts before write, decrypts after read.
-- Ciphertext format: base64(iv[12 bytes] || authTag[16 bytes] || ciphertext)
-- Existing plaintext rows are NOT retroactively encrypted; a backfill job is required.

comment on column public.pastoral_notes.content is
  'AES-256-GCM encrypted ciphertext after 2026-06-07. '
  'Format: base64(iv[12] || authTag[16] || ciphertext). '
  'Encrypted by lib/crypto/pastoral.ts. Plaintext rows pre-dating migration require backfill.';

comment on column public.care_assignments.summary is
  'AES-256-GCM encrypted ciphertext after 2026-06-07. '
  'Format: base64(iv[12] || authTag[16] || ciphertext). '
  'Encrypted by lib/crypto/pastoral.ts. Plaintext rows pre-dating migration require backfill.';
