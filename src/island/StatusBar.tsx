import { seoulFace } from "./format.ts";

export function StatusBar({ now, onClose, celsius }: { now: Date; onClose: () => void; celsius: number | null }) {
  const face = seoulFace(now, celsius);
  return (
    <div className="status">
      <span className="status-date">{face.dateLine}</span>
      <button type="button" className="sensors" onClick={onClose} aria-label="Close the island">
        <i />
        <i />
        <i />
      </button>
      <span className="status-time">
        {face.timeLine}
        <button type="button" className="more" onClick={onClose} aria-label="Close the island">
          ···
        </button>
      </span>
    </div>
  );
}
