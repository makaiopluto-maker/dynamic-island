export type View = "idle" | "home" | "music" | "gemini" | "radio" | "peek";

export type PeekId =
  | "plus"
  | "messages"
  | "moon"
  | "phone"
  | "photos"
  | "calendar"
  | "mail";

export type Compact = "eyes" | "music" | "radio" | "mail" | "event";

export type CoverTheme = "day" | "gold" | "dusk";

export type Frame = {
  width: number;
  height: number;
  radius: number;
};
