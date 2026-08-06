export default function Loading() {
  return (
    <div className="screen" aria-busy="true" aria-label="Đang tải">
      <div className="skel" style={{ height: 168, borderRadius: 22 }} />
      <div className="skel mt-4" style={{ height: 22, width: "62%" }} />
      <div className="skel mt-2.5" style={{ height: 62, borderRadius: 18 }} />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3.5">
        <div className="skel" style={{ height: 84, borderRadius: 14 }} />
        <div className="skel" style={{ height: 84, borderRadius: 14 }} />
      </div>
      <div className="skel mt-3.5" style={{ height: 140, borderRadius: 18 }} />
    </div>
  );
}
