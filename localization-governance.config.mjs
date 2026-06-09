import { createGovernanceService } from "@localization-governance/core";
import { createPostgresStorage } from "@localization-governance/storage-postgres";
import { createGoogleTranslationProvider } from "@localization-governance/provider-google";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.LOCGOV_DATABASE_URL });

const providers = {};
if (process.env.GOOGLE_TRANSLATE_API_KEY) {
  providers.google = createGoogleTranslationProvider({
    apiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
  });
}

const CHURCH_ID = process.env.LOCGOV_CHURCH_ID;
if (!CHURCH_ID) throw new Error("LOCGOV_CHURCH_ID is required for CLI operations.");

const storage = createPostgresStorage({ client: pool, tenantId: CHURCH_ID });
const service = createGovernanceService({
  storage,
  providers,
  // Produce bare UUIDs so IDs are compatible with the uuid column type in the migration.
  idGenerator: () => crypto.randomUUID(),
});

export default {
  service,
  actor: {
    id: process.env.LOCGOV_ACTOR_ID ?? "00000000-0000-0000-0000-000000000001",
    role: "church-admin",
  },
  sourceLocale: "en",
  defaultProvider: "google",
  requiredLocales: ["es"],
  glossaries: {},
  untranslatedAllowlist: [],
};
