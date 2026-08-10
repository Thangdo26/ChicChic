"use client";
// Cô chú nông dân tự sửa hồ sơ + đăng ảnh/video giới thiệu bản thân.
// Ảnh chụp thẳng từ điện thoại (MediaUpload), vẫn giữ lối dán đường dẫn cho ai cần.
import { useState, useTransition } from "react";
import { addIntroMedia, deleteIntroMedia, updateMyProfile } from "@/app/worker-profile-actions";
import { useToast } from "@/components/Toast";
import MediaUpload from "@/components/MediaUpload";
import type { MediaVM } from "@/components/MediaGallery";
import WorkerProfileDialog from "@/components/WorkerProfileDialog";
import { ageFromBirthYear, MAX_INTRO_MEDIA } from "@/lib/decor";

const CLS = "rounded-[11px] px-3 py-2.5 text-[14px] w-full";
const BORDER = { border: "1.5px solid var(--line)", background: "#fff" } as const;

export type WorkerProfileData = {
  id: string;
  name: string;
  area: string;
  bio: string | null;
  birthYear: number | null;
  yearsExp: number;
  consentMedia: boolean;
  load: number;
  maxBarns: number;
  active: boolean;
  intro: MediaVM[];
};

export default function WorkerProfileForm({ profile }: { profile: WorkerProfileData }) {
  const toast = useToast();
  const [savingProfile, startProfile] = useTransition();
  const [savingMedia, startMedia] = useTransition();

  const [name, setName] = useState(profile.name);
  const [area, setArea] = useState(profile.area);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [birthYear, setBirthYear] = useState(profile.birthYear ? String(profile.birthYear) : "");
  const [yearsExp, setYearsExp] = useState(profile.yearsExp);
  const [consentMedia, setConsentMedia] = useState(profile.consentMedia);

  const [type, setType] = useState<"PHOTO" | "VIDEO">("PHOTO");
  const [url, setUrl] = useState("");
  const [poster, setPoster] = useState("");
  const [caption, setCaption] = useState("");
  const [preview, setPreview] = useState(false);

  const age = ageFromBirthYear(Number(birthYear) || null);
  const full = profile.intro.length >= MAX_INTRO_MEDIA;

  const saveProfile = () =>
    startProfile(async () => {
      try {
        const r = await updateMyProfile({
          name, area, bio,
          birthYear: birthYear ? Number(birthYear) : null,
          yearsExp, consentMedia,
        });
        toast(r.message, r.ok ? "ok" : "warn");
      } catch {
        toast("Không lưu được hồ sơ. Thử lại giúp mình nhé.", "err");
      }
    });

  const addMedia = () =>
    startMedia(async () => {
      try {
        const r = await addIntroMedia({ url, type, caption, posterUrl: poster || undefined });
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) { setUrl(""); setPoster(""); setCaption(""); }
      } catch {
        toast("Không thêm được. Kiểm tra đường dẫn rồi thử lại.", "err");
      }
    });

  const removeMedia = (id: string) =>
    startMedia(async () => {
      try {
        const r = await deleteIntroMedia(id);
        toast(r.message, r.ok ? "ok" : "warn");
      } catch {
        toast("Không xoá được. Thử lại giúp mình nhé.", "err");
      }
    });

  return (
    <>
      {/* ---------- Thông tin cá nhân ---------- */}
      <div className="card">
        <div className="font-bold text-[14px] mb-0.5">Thông tin cá nhân</div>
        <p className="text-[12.2px] mb-2.5" style={{ color: "var(--ink-soft)" }}>
          Đây là những gì khách nhìn thấy khi chọn người chăm chuồng cho mình.
        </p>

        <div className="grid gap-2.5">
          <div>
            <div className="text-[12px] mb-1" style={{ color: "var(--ink-soft)" }}>Tên hiển thị</div>
            <input className={CLS} style={BORDER} maxLength={80} value={name}
              onChange={(e) => setName(e.target.value)} placeholder="VD: Cô Lan" />
          </div>

          <div className="flex gap-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] mb-1" style={{ color: "var(--ink-soft)" }}>
                Năm sinh {age ? `(${age} tuổi)` : ""}
              </div>
              <input className={CLS} style={BORDER} inputMode="numeric" maxLength={4} value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="VD: 1978" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] mb-1" style={{ color: "var(--ink-soft)" }}>Số năm nuôi gà</div>
              <input className={CLS} style={BORDER} type="number" min={0} max={60} value={yearsExp}
                onChange={(e) => setYearsExp(Number(e.target.value))} />
            </div>
          </div>

          <div>
            <div className="text-[12px] mb-1" style={{ color: "var(--ink-soft)" }}>Khu vực</div>
            <input className={CLS} style={BORDER} maxLength={120} value={area}
              onChange={(e) => setArea(e.target.value)} placeholder="VD: Ba Vì, Hà Nội" />
          </div>

          <div>
            <div className="text-[12px] mb-1" style={{ color: "var(--ink-soft)" }}>
              Đôi lời giới thiệu <span style={{ opacity: .7 }}>({bio.length}/600)</span>
            </div>
            <textarea className={CLS} style={BORDER} rows={4} maxLength={600} value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="VD: Tôi nuôi gà thả vườn ở Ba Vì hơn 8 năm. Sáng nào cũng ra chuồng lúc 6 giờ, chụp ảnh gửi các bạn ngay sau cữ ăn." />
          </div>

          <label className="flex items-start gap-2.5 text-[12.8px] cursor-pointer">
            <input type="checkbox" checked={consentMedia} className="mt-0.5"
              onChange={(e) => setConsentMedia(e.target.checked)} />
            <span style={{ color: "var(--ink-soft)" }}>
              Tôi đồng ý xuất hiện trong ảnh/video gửi tới khách.
              <b> Không tích cũng không sao</b> - vẫn nhận chuồng và làm việc bình thường.
            </span>
          </label>

          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" onClick={saveProfile}
              disabled={savingProfile || name.trim().length < 2 || area.trim().length < 2}>
              {savingProfile ? "Đang lưu…" : "Lưu hồ sơ"}
            </button>
            <button className="btn btn-ghost flex-none" onClick={() => setPreview(true)}>👀 Xem thử</button>
          </div>
        </div>
      </div>

      {/* ---------- Ảnh & video giới thiệu ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-0.5">
          Ảnh & video giới thiệu ({profile.intro.length}/{MAX_INTRO_MEDIA})
        </div>
        <p className="text-[12.2px] mb-2.5" style={{ color: "var(--ink-soft)" }}>
          Một tấm ảnh cô/chú đứng ở chuồng, một clip ngắn kể vài câu về mình - khách yên tâm
          hơn nhiều khi biết ai đang chăm đàn gà của họ.
        </p>

        {profile.intro.length > 0 && (
          <div className="grid gap-2 mb-3">
            {profile.intro.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 py-1.5"
                style={{ borderBottom: "1px solid var(--line-soft)" }}>
                <span className="flex-none text-[16px]">{m.type === "VIDEO" ? "🎬" : "🖼️"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.9px] truncate">{m.caption ?? m.url}</div>
                  <div className="text-[11.4px] truncate" style={{ color: "var(--ink-soft)" }}>{m.url}</div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm flex-none"
                  style={{ color: "#B4472F", borderColor: "#F0CFC6" }}
                  disabled={savingMedia}
                  onClick={() => { if (window.confirm("Xoá mục này khỏi hồ sơ?")) removeMedia(m.id); }}
                >Xoá</button>
              </div>
            ))}
          </div>
        )}

        {full ? (
          <div className="soft text-[12.8px]" style={{ color: "var(--ink-soft)" }}>
            Hồ sơ đã đủ {MAX_INTRO_MEDIA} mục. Muốn thêm mục mới thì xoá bớt mục cũ nhé.
          </div>
        ) : (
          <div className="grid gap-2.5">
            <div className="seg">
              <button type="button" className={type === "PHOTO" ? "on" : ""} onClick={() => setType("PHOTO")}>🖼️ Ảnh</button>
              <button type="button" className={type === "VIDEO" ? "on" : ""} onClick={() => setType("VIDEO")}>🎬 Video</button>
            </div>

            {url ? (
              <div className="flex items-center gap-2.5 rounded-[11px] p-2" style={{ background: "var(--paper2)", border: "1px solid var(--line)" }}>
                <div className="w-12 h-12 flex-none rounded-[9px] overflow-hidden grid place-items-center" style={{ background: "#fff" }}>
                  {type === "PHOTO"
                    ? <img src={url} alt="Ảnh vừa tải lên" className="w-full h-full object-cover" />
                    : <span className="text-[20px]">🎬</span>}
                </div>
                <div className="flex-1 min-w-0 text-[12.3px] truncate" style={{ color: "var(--ink-soft)" }}>{url}</div>
                <button type="button" className="btn btn-ghost btn-sm flex-none" onClick={() => setUrl("")}>Đổi</button>
              </div>
            ) : (
              <MediaUpload folder="ho-so" kind={type} onUploaded={setUrl} />
            )}

            <details>
              <summary className="text-[11.8px] cursor-pointer" style={{ color: "var(--ink-soft)" }}>
                Hoặc dán đường dẫn có sẵn
              </summary>
              <input className={`${CLS} mt-1.5`} style={BORDER} value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder={type === "VIDEO" ? "https://youtu.be/…  hoặc  https://…/clip.mp4" : "https://…/anh.jpg"} />
            </details>

            {type === "VIDEO" && (
              <input className={CLS} style={BORDER} value={poster} onChange={(e) => setPoster(e.target.value)}
                placeholder="Ảnh bìa cho video (tuỳ chọn)" />
            )}

            <input className={CLS} style={BORDER} maxLength={200} value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Chú thích - VD: Tôi và đàn gà mái buổi sáng" />

            <button className="btn btn-primary" onClick={addMedia} disabled={savingMedia || !url.trim()}>
              {savingMedia ? "Đang thêm…" : "Thêm vào hồ sơ"}
            </button>
            <p className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
              Chưa có chỗ tải ảnh trực tiếp - cô/chú gửi ảnh cho nông trại, nông trại đưa lên kho
              rồi đưa lại đường dẫn để dán vào đây. Bấm thử một ảnh mẫu ở trên để xem nó hiện thế nào.
            </p>
          </div>
        )}
      </div>

      {/* Xem đúng khung mà khách sẽ thấy ở /nhan-chuong */}
      <WorkerProfileDialog
        open={preview}
        onClose={() => setPreview(false)}
        worker={{
          id: profile.id, name, area, bio: bio || null, yearsExp,
          age, load: profile.load, maxBarns: profile.maxBarns,
          free: Math.max(0, profile.maxBarns - profile.load),
          open: profile.active && profile.load < profile.maxBarns,
          paused: !profile.active,
          intro: profile.intro,
        }}
      />
    </>
  );
}
