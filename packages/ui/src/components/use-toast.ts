import { toast as sonnerToast } from "sonner";
import type { ReactNode } from "react";

type StringOrVNode = ReactNode;

type ToastVariant = "default" | "destructive";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastOptions = {
  id?: string | number;
  title?: StringOrVNode;
  description?: StringOrVNode;
  variant?: ToastVariant;
  duration?: number;
  action?: ToastAction;
  onOpenChange?: (open: boolean) => void;
};

type ToastInput = Omit<ToastOptions, "id">;

const buildSonnerOptions = (options: ToastOptions) => ({
  id: options.id,
  description: options.description,
  duration: options.duration ?? 5000,
  action: options.action ? { label: options.action.label, onClick: options.action.onClick } : undefined,
  onDismiss: () => options.onOpenChange?.(false),
  onAutoClose: () => options.onOpenChange?.(false),
});

const showToast = (options: ToastOptions): string | number => {
  const message = options.title ?? options.description ?? " ";

  options.onOpenChange?.(true);

  if (options.variant === "destructive") {
    return sonnerToast.error(message, buildSonnerOptions(options));
  }

  return sonnerToast(message, buildSonnerOptions(options));
};

function toast(props: ToastInput) {
  const merged: ToastOptions = { ...props };
  const id = showToast(merged);

  const update = (next: ToastInput) => {
    Object.assign(merged, next);
    showToast({ ...merged, id });
  };

  const dismiss = () => {
    sonnerToast.dismiss(id);
  };

  return { id, dismiss, update };
}

function useToast() {
  return {
    toast,
    dismiss: (toastId?: string | number) => sonnerToast.dismiss(toastId),
  };
}

export { toast, useToast };
