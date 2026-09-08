-- Cộng thêm. Phiên cũ không ghi scope: hết hạn để không tiếp tục cấp quyền parent cho máy ở khu bé.
BEGIN;
CREATE TYPE "SessionScope" AS ENUM ('ADULT', 'CHILD');
ALTER TABLE "Session"
  ADD COLUMN "scope" "SessionScope" NOT NULL DEFAULT 'ADULT',
  ADD COLUMN "scopeChildId" TEXT,
  ADD COLUMN "scopeVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Session" ADD CONSTRAINT "Session_scope_check" CHECK (
  "scopeVersion" >= 0 AND (
    ("scope" = 'ADULT' AND "scopeChildId" IS NULL) OR
    ("scope" = 'CHILD' AND "scopeChildId" IS NOT NULL AND length("scopeChildId") > 0 AND "reauthAt" IS NULL)
  )
);
CREATE TABLE "SessionScopeEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fromScope" "SessionScope" NOT NULL,
  "toScope" "SessionScope" NOT NULL,
  "version" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SessionScopeEvent_sessionId_version_key" ON "SessionScopeEvent"("sessionId", "version");
CREATE INDEX "SessionScopeEvent_userId_createdAt_idx" ON "SessionScopeEvent"("userId", "createdAt");
-- Mốc cố định tránh cast timestamptz → timestamp bị lệch timezone của DB/CLI.
UPDATE "Session" SET "expiresAt" = LEAST("expiresAt", TIMESTAMP '1970-01-01 00:00:00');
COMMIT;
