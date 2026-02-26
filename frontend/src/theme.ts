import { createTheme } from "@mui/material/styles";

export function buildTheme(mode: "light" | "dark") {
  return createTheme({
    palette: {
      mode,
      primary: { main: "#6f42c1" } // purple
    },
    shape: { borderRadius: 10 }
  });
}
