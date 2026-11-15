import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import App from "./App.tsx";
import "./styles.css";

if (new URLSearchParams(window.location.search).get("overlay") === "1") {
  document.documentElement.classList.add("overlay");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
