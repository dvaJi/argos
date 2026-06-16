import "../src/assets/main.css";
import React from "react";
import { createRoot } from "react-dom/client";
import Loading from "./Loading";

createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <Loading />
  </React.StrictMode>,
);
