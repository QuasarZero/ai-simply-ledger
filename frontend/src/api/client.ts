import axios from "axios";
import { emitToast } from "../components/toastBus";

const baseURL = (import.meta.env.VITE_API_BASE_URL as string) || "/api";

export const api = axios.create({
  baseURL
});

function formatApiError(err: any) {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const detail =
    typeof data?.detail === "string"
      ? data.detail
      : typeof data?.message === "string"
        ? data.message
        : typeof data === "string"
          ? data
          : null;
  const msg = detail || err?.message || "Request failed";
  return status ? `[${status}] ${msg}` : msg;
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      window.dispatchEvent(new Event("auth:401"));
      return Promise.reject(err);
    }

    // best-effort toast for API errors (unless explicitly silenced)
    const silent = Boolean((err?.config as any)?.meta?.silentToast);
    if (!silent) {
      emitToast({ severity: "error", message: formatApiError(err) });
    }
    return Promise.reject(err);
  }
);
