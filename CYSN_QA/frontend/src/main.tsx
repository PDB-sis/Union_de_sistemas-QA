import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthContext";
import "./index.css";
import App from "./App.tsx";
import { instalarAutenticacionQaLegacy } from "./services/qaLegacyAuthBridge";


instalarAutenticacionQaLegacy();

createRoot(
  document.getElementById("root")!
).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
