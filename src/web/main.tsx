import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import "./styles/main.scss";

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.documentElement.classList.remove("preload")),
  );
}
