import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";

const stored = localStorage.getItem("bulwark-theme");
const preferred = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
document.documentElement.dataset.theme = stored === "light" || stored === "dark" ? stored : preferred;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
