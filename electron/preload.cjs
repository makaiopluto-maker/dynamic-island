const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("islandDesktop", {
  setInteractive(interactive) {
    ipcRenderer.send("island:interactive", Boolean(interactive));
  },
});
