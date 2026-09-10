/** Chụp đúng bản vẽ nông dân đang xem; không dùng URL ảnh làm phiên bản yêu cầu. */
export type DecorProofRow = {
  id: string; itemId: string; x: number; y: number; scale: number; z: number;
  flipped: boolean; text: string | null; colorHex: string | null; variant: string | null;
};

export function decorProofSnapshot(rows: DecorProofRow[], barnLabel: string): string {
  return JSON.stringify([barnLabel, [...rows].sort((a, b) => a.id.localeCompare(b.id)).map((d) =>
    [d.id, d.itemId, d.x, d.y, d.scale, d.z, d.flipped, d.text, d.colorHex, d.variant])]);
}
