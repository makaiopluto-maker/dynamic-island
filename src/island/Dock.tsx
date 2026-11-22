import {
  CalendarIcon,
  WeatherIcon,
  HomeIcon,
  MailIcon,
  MoonIcon,
  NoteIcon,
  PhoneIcon,
  PhotoIcon,
  PlusIcon,
  RadioIcon,
  SparkIcon,
} from "./Icons.tsx";
import type { PeekId, View } from "./types.ts";

type DockItem = {
  id: string;
  label: string;
  icon: "plus" | "home" | "gemini" | "music" | "radio" | "weather" | "moon" | "phone" | "photos" | "calendar" | "mail";
};

const items: DockItem[] = [
  { id: "plus-left", label: "Settings", icon: "plus" },
  { id: "home", label: "Home", icon: "home" },
  { id: "gemini", label: "OpenClaw", icon: "gemini" },
  { id: "music", label: "Music", icon: "music" },
  { id: "radio", label: "Radio", icon: "radio" },
  { id: "weather", label: "Weather", icon: "weather" },
  { id: "moon", label: "Lights", icon: "moon" },
  { id: "phone", label: "Phone", icon: "phone" },
  { id: "photos", label: "Photos", icon: "photos" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "mail", label: "Mail", icon: "mail" },
  { id: "plus-right", label: "Settings", icon: "plus" },
];

const icons = {
  plus: PlusIcon,
  home: HomeIcon,
  gemini: SparkIcon,
  music: NoteIcon,
  radio: RadioIcon,
  weather: WeatherIcon,
  moon: MoonIcon,
  phone: PhoneIcon,
  photos: PhotoIcon,
  calendar: CalendarIcon,
  mail: MailIcon,
};

export function Dock({
  view,
  peek,
  dim,
  onOpen,
  onPeek,
  onMoon,
}: {
  view: View;
  peek: PeekId;
  dim: boolean;
  onOpen: (view: View) => void;
  onPeek: (id: PeekId) => void;
  onMoon: () => void;
}) {
  return (
    <div className="dock" role="toolbar" aria-label="Island activities">
      {items.map((item) => {
        const Icon = icons[item.icon];
        const current =
          (item.icon === "home" && view === "home") ||
          (item.icon === "gemini" && view === "gemini") ||
          (item.icon === "music" && view === "music") ||
          (item.icon === "radio" && view === "radio") ||
          (item.icon === "plus" && view === "peek" && peek === "plus") ||
          (item.icon !== "plus" &&
            item.icon !== "moon" &&
            view === "peek" &&
            peek === item.icon) ||
          (item.icon === "moon" && view === "peek" && peek === "moon");

        return (
          <button
            key={item.id}
            type="button"
            className="dock-btn"
            aria-label={item.label}
            aria-current={current ? "true" : undefined}
            aria-pressed={item.icon === "moon" ? dim : undefined}
            onClick={() => {
              if (item.icon === "home") onOpen("home");
              else if (item.icon === "gemini") onOpen("gemini");
              else if (item.icon === "music") onOpen("music");
              else if (item.icon === "radio") onOpen("radio");
              else if (item.icon === "moon") onMoon();
              else if (item.icon === "plus") onPeek("plus");
              else onPeek(item.icon);
            }}
          >
            <Icon />
            {current && (item.icon !== "plus" || item.id === "plus-left") ? <span>{item.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
