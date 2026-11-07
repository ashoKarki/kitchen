import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import PublicSite from "./PublicSite";
import { ToastProvider } from "./toast";
import "./publicSite.css";

const isKitchenApp = /^\/app(?:\/|$)/.test(window.location.pathname);
const KitchenApp = lazy(() => import("./App"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isKitchenApp
      ? <BrowserRouter basename="/app">
        <ToastProvider>
          <Suspense fallback={<p className="public-loading">Opening your kitchen…</p>}>
            <KitchenApp />
          </Suspense>
        </ToastProvider>
      </BrowserRouter>
      : <BrowserRouter>
        <PublicSite />
      </BrowserRouter>}
  </React.StrictMode>
);
