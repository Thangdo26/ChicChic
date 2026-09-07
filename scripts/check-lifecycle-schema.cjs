// Chỉ đọc DB mà runtime sẽ dùng. Build thành công không chứng minh migration đã chạy.
const { Prisma, PrismaClient } = require("@prisma/client");

async function assertLifecycleSchema(db) {
  const [columns, constraints, indexes, enums] = await Promise.all([
    db.$queryRaw`SELECT table_name, column_name, is_nullable, udt_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name IN ('Flock','BarnTask','HarvestLot','LifecycleRequest','FlockOutcome')`,
    db.$queryRaw`SELECT c.conname, c.contype::text AS contype, c.confdeltype::text AS confdeltype, c.convalidated FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = current_schema()`,
    db.$queryRaw`SELECT c.relname, i.indisunique, i.indisvalid, (i.indpred IS NULL) AS unfiltered
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema()`,
    db.$queryRaw`SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = current_schema()`,
  ]);
  const missing = [];
  const required = { Flock: ["version"], BarnTask: ["lifecycleRequestId"], HarvestLot: ["lifecycleRequestId"] };
  for (const name of ["LifecycleRequest", "FlockOutcome"]) {
    required[name] = Prisma.dmmf.datamodel.models.find((m) => m.name === name).fields
      .filter((f) => f.kind !== "object").map((f) => f.dbName || f.name);
  }
  for (const [table, fields] of Object.entries(required)) {
    for (const field of fields) {
      if (!columns.some((c) => c.table_name === table && c.column_name === field)) missing.push(`${table}.${field}`);
    }
  }
  const version = columns.find((c) => c.table_name === "Flock" && c.column_name === "version");
  if (version && (version.udt_name !== "int4" || version.is_nullable !== "NO")) missing.push("Flock.version INTEGER NOT NULL");
  for (const name of ["LifecycleRequest_snapshot_check", "FlockOutcome_measurements_check"]) {
    if (!constraints.some((c) => c.conname === name && c.contype === "c" && c.convalidated)) missing.push(name);
  }
  for (const name of [
    "LifecycleRequest_barnId_fkey", "LifecycleRequest_flockId_fkey", "FlockOutcome_requestId_fkey",
    "FlockOutcome_flockId_fkey", "FlockOutcome_proofMediaId_fkey", "BarnTask_lifecycleRequestId_fkey", "HarvestLot_lifecycleRequestId_fkey",
  ]) {
    if (!constraints.some((c) => c.conname === name && c.contype === "f" && c.confdeltype === "r" && c.convalidated)) missing.push(name);
  }
  for (const name of [
    "LifecycleRequest_activeFlockId_key", "LifecycleRequest_requestedById_idempotencyKey_key",
    "BarnTask_lifecycleRequestId_key", "HarvestLot_lifecycleRequestId_key", "FlockOutcome_requestId_key", "FlockOutcome_proofMediaId_key",
  ]) {
    if (!indexes.some((i) => i.relname === name && i.indisunique && i.indisvalid && i.unfiltered)) missing.push(name);
  }
  for (const [name, values] of Object.entries({
    TaskKind: ["RETIRE"], LifecycleRequestStatus: ["REQUESTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "DECLINED", "CANCELLED"],
  })) {
    for (const value of values) if (!enums.some((e) => e.typname === name && e.enumlabel === value)) missing.push(`${name}.${value}`);
  }
  if (missing.length) {
    const error = new Error(`CC-B01: database runtime thiếu schema/constraint: ${missing.join(", ")}. Chạy migration theo docs/engineering/CC-B01-LIFECYCLE.md trước khi deploy; db push không tạo đủ CHECK.`);
    error.code = "CC_B01_SCHEMA_MISSING";
    throw error;
  }
}

module.exports = { assertLifecycleSchema };

if (require.main === module) {
  require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const db = new PrismaClient();
  assertLifecycleSchema(db)
    .then(() => console.log("CC-B01: schema runtime đủ cột, enum, unique, FK và CHECK; kiểm tra chỉ đọc đã đạt."))
    .catch((error) => {
      // Không in connection string hoặc lỗi gốc có thể chứa thông tin kết nối.
      console.error(error.code === "CC_B01_SCHEMA_MISSING" ? error.message : `CC-B01: không kiểm tra được database runtime (${error.code || "connection error"}). Kiểm tra DATABASE_URL và kết nối trước khi deploy.`);
      process.exitCode = 1;
    }).finally(() => db.$disconnect());
}
