import { alpha, createTheme } from "@mui/material/styles";

export function buildTheme(mode: "light" | "dark") {
  return createTheme({
    palette: {
      mode,
      primary: { main: "#6f42c1" } // purple
    },
    shape: { borderRadius: 10 },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none"
          }
        }
      },
      MuiTableBody: {
        styleOverrides: {
          root: ({ theme }) => ({
            "& .MuiTableRow-root:nth-of-type(odd)": {
              backgroundColor: alpha(
                theme.palette.primary.main,
                theme.palette.mode === "dark" ? 0.12 : 0.04
              )
            },
            "& .MuiTableRow-root:hover": {
              backgroundColor: alpha(
                theme.palette.primary.main,
                theme.palette.mode === "dark" ? 0.2 : 0.08
              )
            }
          })
        }
      }
    }
  });
}
