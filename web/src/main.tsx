import "./instrument";   // MUST be the very first import — side-effect Sentry.init()

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./styles.css";

function ErrorFallback() {
  return (
    <div className="error-fallback">
      <h1>Something broke.</h1>
      <p>FreightDesk hit an unexpected error. Try reloading the page.</p>
      <button onClick={() => window.location.reload()}>Reload</button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />} showDialog={false}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
