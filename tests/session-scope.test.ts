import { describe, it, expect } from "vitest";
import { childPathAllowed, isChildPath } from "../src/lib/scope-path";

describe("CC-B08 · allowlist đường dẫn khu bé", () => {
  it.each(["/be/c1", "/be/c1/mong-muon", "/be/c1/nhat-ky", "/be/c1/khoanh-khac/m1"])("mở %s", (path) => {
    expect(childPathAllowed(path, "c1")).toBe(true);
  });
  it.each(["/cho", "/gia-dinh", "/admin", "/tai-khoan", "/be/c10", "/be/c2/nhat-ky",
    "/be/c1/new-route", "/be/c1/khoanh-khac/../cho", "/be/c1/khoanh-khac/a/b", "/be/c1/khoanh-khac/%2fcho"])("đóng %s", (path) => {
    expect(childPathAllowed(path, "c1")).toBe(false);
  });
  it("tiền tố chuỗi không phải tiền tố đường dẫn", () => {
    expect(isChildPath("/be/c1")).toBe(true);
    expect(isChildPath("/be")).toBe(true);
    expect(isChildPath("/be-something")).toBe(false);
  });
});
