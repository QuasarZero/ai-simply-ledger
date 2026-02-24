import { createTheme } from "@mui/material/styles";

export function buildTheme(mode: "light" | "dark") {
  return createTheme({
    palette: { mode },
    shape: { borderRadius: 10 }
  });
}

