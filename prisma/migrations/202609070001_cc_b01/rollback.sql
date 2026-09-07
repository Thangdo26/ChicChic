-- Chỉ gỡ schema khi CHƯA có dữ liệu v2. Có dữ liệu: đóng cửa ghi, giữ lịch sử.
BEGIN;
LOCK TABLE "LifecycleRequest", "FlockOutcome", "BarnTask", "HarvestLot" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "LifecycleRequest") OR EXISTS (SELECT 1 FROM "FlockOutcome")
    OR EXISTS (SELECT 1 FROM "BarnTask" WHERE "lifecycleRequestId" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "HarvestLot" WHERE "lifecycleRequestId" IS NOT NULL) THEN
    RAISE EXCEPTION 'CC-B01: da co du lieu lifecycle; giu schema va tat cua ghi, khong xoa lich su';
  END IF;
END $$;
ALTER TABLE "BarnTask" DROP COLUMN "lifecycleRequestId";
ALTER TABLE "HarvestLot" DROP COLUMN "lifecycleRequestId";
DROP TABLE "FlockOutcome";
DROP TABLE "LifecycleRequest";
ALTER TABLE "Flock" DROP COLUMN "version";
DROP TYPE "LifecycleRequestStatus";
-- Giữ giá trị TaskKind.RETIRE: PostgreSQL không hỗ trợ DROP VALUE an toàn.
COMMIT;
