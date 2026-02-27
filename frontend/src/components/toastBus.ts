export type ToastSeverity = "error" | "warning" | "info" | "success";

export type ToastPayload = {
  severity: ToastSeverity;
  message: string;
};

type Listener = (payload: ToastPayload) => void;

const listeners = new Set<Listener>();

export function emitToast(payload: ToastPayload) {
  listeners.forEach((l) => l(payload));
}

export function subscribeToast(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
