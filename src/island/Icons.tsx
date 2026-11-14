import type { SVGProps } from "react";

function Glyph({ filled = false, ...props }: SVGProps<SVGSVGElement> & { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function PlusIcon() {
  return (
    <Glyph>
      <path d="M12 5v14M5 12h14" />
    </Glyph>
  );
}

export function HomeIcon() {
  return (
    <Glyph>
      <path d="M4.5 10.8 12 4.5l7.5 6.3V20a1 1 0 0 1-1 1h-4.2v-5.2H9.7V21H5.5a1 1 0 0 1-1-1z" />
    </Glyph>
  );
}

export function SparkIcon() {
  return (
    <Glyph filled>
      <path d="M12 2.8 13.6 8.7 19.6 10.2 13.6 11.8 12 17.8 10.4 11.8 4.4 10.2 10.4 8.7z" />
      <path d="M18.2 14.2 18.8 16.4 21 17 18.8 17.6 18.2 19.8 17.6 17.6 15.4 17 17.6 16.4z" />
    </Glyph>
  );
}

export function NoteIcon() {
  return (
    <Glyph>
      <path d="M9 17.8V6.2L19 4.2v11.2" />
      <circle cx="6.6" cy="17.8" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="16.6" cy="15.4" r="2.2" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function RadioIcon() {
  return (
    <Glyph>
      <rect x="4" y="8" width="16" height="11" rx="2" />
      <path d="M8 8 14.5 3.5" />
      <circle cx="9" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
      <path d="M13 12.2h4M13 15h3" />
    </Glyph>
  );
}

export function WeatherIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.7 5.7l1.5 1.5M16.8 16.8l1.5 1.5M18.3 5.7l-1.5 1.5M7.2 16.8l-1.5 1.5" />
    </Glyph>
  );
}

export function MoonIcon() {
  return (
    <Glyph>
      <path d="M15.8 14.8A6.2 6.2 0 0 1 9.2 6.4 6.3 6.3 0 1 0 15.8 14.8z" />
    </Glyph>
  );
}

export function PhoneIcon() {
  return (
    <Glyph>
      <rect x="7" y="3.4" width="10" height="17.2" rx="2" />
      <path d="M11 17.6h2" />
    </Glyph>
  );
}

export function PhotoIcon() {
  return (
    <Glyph>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <path d="m7 16.2 3-3a1 1 0 0 1 1.4 0L16 17" />
    </Glyph>
  );
}

export function CalendarIcon() {
  return (
    <Glyph>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5V6.2M16 3.5V6.2M4 10h16" />
    </Glyph>
  );
}

export function MailIcon() {
  return (
    <Glyph>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="m4 7.2 8 5.6 8-5.6" />
    </Glyph>
  );
}

export function PlayIcon({ size = 18 }: { size?: number }) {
  return (
    <Glyph filled width={size} height={size}>
      <path d="M8.2 5.8v12.4L19 12z" />
    </Glyph>
  );
}

export function PauseIcon({ size = 18 }: { size?: number }) {
  return (
    <Glyph filled width={size} height={size}>
      <path d="M7 5.5h3.2v13H7zM13.8 5.5H17v13h-3.2z" />
    </Glyph>
  );
}

export function PrevIcon() {
  return (
    <Glyph filled width="22" height="22">
      <path d="M7 6h2.2v12H7zM18.5 6.8 10.2 12l8.3 5.2z" />
    </Glyph>
  );
}

export function NextIcon() {
  return (
    <Glyph filled width="22" height="22">
      <path d="M14.8 6H17v12h-2.2zM5.5 6.8 13.8 12 5.5 17.2z" />
    </Glyph>
  );
}

export function AirplayIcon() {
  return (
    <Glyph width="20" height="20">
      <path d="M4 15.2V7.4A1.4 1.4 0 0 1 5.4 6h13.2A1.4 1.4 0 0 1 20 7.4v7.8" />
      <path d="m8 19 4-4.2L16 19" />
    </Glyph>
  );
}
