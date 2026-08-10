import { KhungTrangCon, O } from "@/components/Skeletons";

/**
 * Hộp thư — khung so le trái/phải để nhìn ra ngay đây là một cuộc trò chuyện,
 * không phải một danh sách. Ô soạn tin ở đáy vẽ luôn cho khỏi nhảy chỗ.
 */
export default function Loading() {
  return (
    <KhungTrangCon>
      <div className="grid gap-2.5">
        {[["64%", false], ["52%", true], ["74%", false], ["46%", true]].map(([w, phai], i) => (
          <div key={i} className={phai ? "flex justify-end" : ""}>
            <O h={46} w={w as string} r={14} />
          </div>
        ))}
      </div>
      <div className="mt-4"><O h={46} r={12} /></div>
    </KhungTrangCon>
  );
}
