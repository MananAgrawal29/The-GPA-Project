import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import "./index.css";

const container = document.getElementById("root");

if (container === null) {
  throw new Error("Root container #root was not found");
}

const publishableKey: string | undefined = import.meta.env
  .VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const root = createRoot(container);

if (publishableKey === undefined || publishableKey === "") {
  // Without a key there is no sign-in to render, so Clerk is never
  // fetched and the app simply runs: the screens that need a session
  // show what is missing instead of pretending to know the user.
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
} else {
  // Loaded on demand so a build without a key ships no Clerk code at all.
  void import("@clerk/react").then(({ ClerkProvider }) => {
    root.render(
      <StrictMode>
        <BrowserRouter>
          <ClerkProvider publishableKey={publishableKey}>
            <App />
          </ClerkProvider>
        </BrowserRouter>
      </StrictMode>,
    );
  });
}
