import { seoulFace } from "./format.ts";

export function StatusBar({
  now,
  onClose,
  menuOpen,
  onMenu,
  celsius,
}: {
  now: Date;
  onClose: () => void;
  menuOpen: boolean;
  onMenu: () => void;
  celsius: number | null;
}) {
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
        <button
          type="button"
          className={menuOpen ? "more on" : "more"}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={(event) => {
            event.stopPropagation();
            onMenu();
          }}
        >
          ···
        </button>
      </span>
    </div>
  );
}
