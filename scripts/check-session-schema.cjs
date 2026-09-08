// Gate chỉ đọc: không để deploy code scope lên DB chưa migrate.
const { PrismaClient } = require("@prisma/client");

async function assertSessionSchema(db) {
  const columns = await db.$queryRaw`SELECT table_name, column_name, udt_name, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema = current_schema()
    AND table_name IN ('Session', 'SessionScopeEvent')`;
  const constraints = await db.$queryRaw`SELECT conname FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace AND convalidated`;
  const indexes = await db.$queryRaw`SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relnamespace = current_schema()::regnamespace AND i.indisvalid AND i.indisunique AND i.indpred IS NULL`;
  const enums = await db.$queryRaw`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typnamespace = current_schema()::regnamespace AND t.typname = 'SessionScope'`;
  const missing = [];
  for (const [table, fields] of Object.entries({
    Session: ["scope", "scopeChildId", "scopeVersion"],
    SessionScopeEvent: ["id", "sessionId", "userId", "fromScope", "toScope", "version", "createdAt"],
  })) {
    for (const field of fields) if (!columns.some((c) => c.table_name === table && c.column_name === field)) missing.push(`${table}.${field}`);
  }
  for (const [field, type, initial] of [["scope", "SessionScope", "ADULT"], ["scopeVersion", "int4", "0"]]) {
    const col = columns.find((c) => c.table_name === "Session" && c.column_name === field);
    if (col && (col.udt_name !== type || col.is_nullable !== "NO" || !col.column_default?.includes(initial))) missing.push(`Session.${field} type/default`);
  }
  if (!constraints.some((c) => c.conname === "Session_scope_check")) missing.push("Session_scope_check");
  if (!indexes.some((i) => i.relname === "SessionScopeEvent_sessionId_version_key")) missing.push("SessionScopeEvent_sessionId_version_key");
  for (const value of ["ADULT", "CHILD"]) if (!enums.some((e) => e.enumlabel === value)) missing.push(`SessionScope.${value}`);
  if (missing.length) {
    const error = new Error(`CC-B08: thiếu schema ${missing.join(", ")}. Áp migration 202609080001_session_scope theo docs/engineering/CC-B08-SECURITY.md trước khi deploy.`);
    error.code = "CC_B08_SCHEMA_MISSING";
    throw error;
  }
}
module.exports = { assertSessionSchema };

if (require.main === module) {
  require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const db = new PrismaClient();
  assertSessionSchema(db).then(() => console.log("CC-B08: schema scope và audit đã sẵn sàng."))
    .catch((error) => {
      console.error(error.code === "CC_B08_SCHEMA_MISSING" ? error.message : "CC-B08: không kết nối được DB runtime; chưa cho deploy.");
      process.exitCode = 1;
    }).finally(() => db.$disconnect());
}
