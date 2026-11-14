import { seoulFace } from "./format.ts";

export function StatusBar({ now, onClose }: { now: Date; onClose: () => void }) {
  const face = seoulFace(now);
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
