import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertLifecycleChoice, assertLifecycleCount, assertLifecycleWeight, LIFECYCLE_STATUS_VI } from "@/lib/lifecycle";
import { TASK_META } from "@/lib/tasks";

const flock = { productLine: "LAYER" as const, lifecyclePolicy: "STANDARD" as const, stage: "END_OF_LAY" };

describe("CC-B01 · chính sách và đối soát", () => {
  it.each(["LAYER", "BROILER"] as const)("%s: Family vẫn chỉ RETIRE", (productLine) => {
    const family = { ...flock, productLine, lifecyclePolicy: "FAMILY_RETIRE_ONLY" as const };
    expect(() => assertLifecycleChoice(family, "RETIRE")).not.toThrow();
    expect(() => assertLifecycleChoice(family, "MEAT")).toThrow();
    expect(() => assertLifecycleChoice(family, "RENEW")).toThrow();
  });
  it("RENEW chưa mở cả với STANDARD, không reset lịch sử", () => {
    expect(() => assertLifecycleChoice(flock, "RENEW")).toThrow(/chưa mở/);
    const action = readFileSync("src/app/actions.ts", "utf8").split("export async function decideEndOfLay")[1].split("export async function cancelLifecycleRequest")[0];
    expect(action).not.toMatch(/(?:bird|product|flock|healthEvent|harvestLot|domainEvent)\.(?:delete|update)/);
  });
  it.each(["BROODING", "GROWING", "LAYING", "FINISHING", "HARVESTED", "RETIRED"])("chưa/đã khép chu kỳ %s thì từ chối", (stage) => {
    expect(() => assertLifecycleChoice({ ...flock, stage }, "MEAT")).toThrow();
  });
  it("đối soát theo danh tính, không chỉ theo số con", () => {
    expect(() => assertLifecycleCount(["a", "b"], ["b", "a"], 2)).not.toThrow();
    expect(() => assertLifecycleCount(["a", "b"], ["a", "c"], 2)).toThrow();
    expect(() => assertLifecycleCount(["a", "a"], ["a", "b"], 2)).toThrow();
  });
  it.each([0, -1, 1.5, NaN, Infinity, 3])("từ chối số con lệch %s", (n) => {
    expect(() => assertLifecycleCount(["a", "b"], ["a", "b"], n)).toThrow();
  });
  it.each([null, NaN, Infinity, 0, -1, 1000])("từ chối số cân %s", (weight) => {
    expect(() => assertLifecycleWeight(3, weight)).toThrow();
  });
  it("cân đủ đàn được chấp nhận", () => expect(() => assertLifecycleWeight(3, 4.5)).not.toThrow());
  it("copy pending không khẳng định kết quả; loại RETIRE có hướng dẫn và proof", () => {
    expect(LIFECYCLE_STATUS_VI.REQUESTED).toContain("chờ");
    expect(LIFECYCLE_STATUS_VI.ACCEPTED).toContain("chờ");
    expect(TASK_META.RETIRE.proof).toContain("số con");
  });
});
