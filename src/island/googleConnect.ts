declare global {
  interface Window {
    islandDesktop?: {
      setInteractive: (interactive: boolean) => void;
      connectGoogle?: () => Promise<boolean>;
    };
  }
}

export async function connectGoogle() {
  if (window.islandDesktop?.connectGoogle) {
    return window.islandDesktop.connectGoogle();
  }
  window.location.assign("/api/auth/google");
  return true;
}
