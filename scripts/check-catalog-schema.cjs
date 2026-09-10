// Chỉ đọc; build phải dừng trước khi phát hành code dùng cột chưa migrate.
const { PrismaClient } = require("@prisma/client");
async function assertCatalogSchema(db) {
  const columns = await db.$queryRaw`SELECT column_name, udt_name, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'DecorItem'`;
  const checks = await db.$queryRaw`SELECT conname FROM pg_constraint WHERE connamespace = current_schema()::regnamespace AND convalidated`;
  const missing = [];
  for (const [name, type, initial] of [["active", "bool", "true"], ["version", "int4", "0"]]) {
    const c = columns.find((c) => c.column_name === name);
    if (!c || c.udt_name !== type || c.is_nullable !== "NO" || !c.column_default?.includes(initial)) missing.push(`DecorItem.${name}`);
  }
  if (!checks.some((c) => c.conname === "DecorItem_version_check")) missing.push("DecorItem_version_check");
  if (missing.length) { const e = new Error(`Chưa có schema danh mục: ${missing.join(", ")}. Áp migration 202609080002_experience_catalog trước khi deploy.`); e.code = "CC_CATALOG_SCHEMA_MISSING"; throw e; }
}
module.exports = { assertCatalogSchema };
if (require.main === module) {
  require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const db = new PrismaClient();
  assertCatalogSchema(db).then(() => console.log("Schema danh mục đã sẵn sàng."))
    .catch((e) => { console.error(e.code === "CC_CATALOG_SCHEMA_MISSING" ? e.message : "Không kiểm tra được DB runtime; chưa cho deploy."); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
