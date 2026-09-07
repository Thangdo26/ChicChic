# ChicChic — content contract mẫu cho developer và reviewer

Đây là fixture/copy contract, chưa phải nội dung được publish. Mỗi unit phải có reviewer giáo dục/ag-vet phù hợp trước khi bật flag.

## 1. Schema unit

```ts
type LearningUnit = {
  key: string; chapter: string; ageBand: "5_6" | "7_8";
  childText: string; parentPrompt: string; expectedEvidence: string[];
  offlineActivity?: string; safetyNote?: string;
  prohibitedTerms: string[]; reviewer: { role: string; version: string };
}
```

`childText` tối đa 50 ký tự, câu khẳng định trung tính, không tiền/điểm/xếp hạng/đe dọa. `expectedEvidence` chỉ mô tả event/proof đã có; unknown phải nói unknown.

## 2. Mẫu 5–6 tuổi

```yaml
key: water-observation-5-6-v1
childText: "Máng nước hôm nay thế nào?"
parentPrompt: "Cùng xem ảnh cô/chú đã gửi và kể một điều con nhận ra."
expectedEvidence: [CARE_TASK_COMPLETED, UONG_NUOC]
offlineActivity: "Vẽ một chiếc máng nước sạch."
safetyNote: "Bé quan sát cùng bố mẹ; không tự vào chuồng."
```

## 3. Mẫu 7–8 tuổi

```yaml
key: egg-record-7-8-v1
childText: "Con đoán hôm nay có mấy quả?"
parentPrompt: "Xem lại sổ thu hoạch: số nào đã được ghi, ngày nào chưa có dữ liệu?"
expectedEvidence: [HARVEST_LOT_RECORDED]
offlineActivity: "Gom hình trứng theo nhóm và đếm."
safetyNote: "Không suy ra ngày im lặng là không có trứng."
```

## 4. Nội dung cấm

Không viết: “nếu không… sẽ bị…”, “gà buồn vì con”, “mua ngay”, “con gà sắp chết”, điểm/leaderboard/streak, hướng dẫn cho thuốc/vaccine, địa chỉ/điện thoại, hoặc lời kể chắc chắn về bệnh/chết khi chưa có expert-approved parent flow.

## 5. Review checklist

- event/proof reference tồn tại và có privacy classification;
- copy đúng age band, đọc được khi parent co-use;
- không dùng tag để chọn bài mới nếu chưa reviewer;
- offline alternative có thể làm không cần đăng nhập;
- safety note không khuyến khích trẻ chạm/đi vào khu nuôi;
- versioned, rollbackable, audit người duyệt/ngày duyệt.
