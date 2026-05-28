"use client";

import { useEffect } from "react";

export default function ThemeProvider() {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  return null;
}
