export type View = "idle" | "home" | "music" | "claude" | "focus" | "peek";

export type PeekId =
  | "plus"
  | "messages"
  | "moon"
  | "phone"
  | "photos"
  | "calendar"
  | "mail";

export type Compact = "eyes" | "music" | "focus" | "claude";

export type ClaudeTab = "read" | "edit" | "test" | "done";

export type CoverTheme = "day" | "gold" | "dusk";

export type Frame = {
  width: number;
  height: number;
  radius: number;
};
