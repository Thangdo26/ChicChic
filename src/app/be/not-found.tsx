import ExitGate from "@/components/be/ExitGate";

export default function ChildSpaceClosed() {
  return <div className="screen space-y-4">
    <h1 className="font-display text-xl">Mình nghỉ một chút nhé 🌱</h1>
    <p>Khu của bé chưa mở được. Gọi bố mẹ giúp nhé.</p>
    <ExitGate />
  </div>;
}
