import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { createDialogClient } from "@api/DialogClient";
import { DialogRequest, DialogResponse } from "@shared/presenter";

interface DialogState {
  dialogRequest: DialogRequest | null;
  showDialog: boolean;
  timeoutMilliseconds: number;
}

const dialogClient = createDialogClient();
let unsubscribeDialogRequested: (() => void) | null = null;
let timer: NodeJS.Timeout | null = null;

export const dialogStore = new Store<DialogState>({
  dialogRequest: null,
  showDialog: false,
  timeoutMilliseconds: 0,
});

const clearTimer = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

const startCountdown = (timeout: number, defaultResponse: DialogResponse) => {
  dialogStore.setState((prev) => ({ ...prev, timeoutMilliseconds: timeout }));
  clearTimer();
  timer = setInterval(() => {
    const current = dialogStore.state.timeoutMilliseconds;
    if (current > 0) {
      dialogStore.setState((prev) => ({
        ...prev,
        timeoutMilliseconds: prev.timeoutMilliseconds - 100,
      }));
    } else {
      clearTimer();
      handleResponse(defaultResponse);
    }
  }, 100);
};

const handleDialogError = async (id: string) => {
  try {
    clearTimer();
    await dialogClient.handleDialogError(id);
  } catch (error) {
    console.error("[DialogStore] Error handling dialog error:", error);
  } finally {
    dialogStore.setState((prev) => ({ ...prev, dialogRequest: null, showDialog: false }));
  }
};

export const handleResponse = async (response: DialogResponse) => {
  try {
    clearTimer();
    if (!dialogStore.state.dialogRequest) {
      console.warn("No dialog request to respond");
      return;
    }
    await dialogClient.handleDialogResponse(response);
  } catch (error) {
    console.error("[DialogStore] Error handling dialog response:", error);
  } finally {
    dialogStore.setState((prev) => ({ ...prev, dialogRequest: null, showDialog: false }));
  }
};

const handleDialogRequested = async (event: DialogRequest) => {
  try {
    if (!event || !event.id || !event.title) {
      console.error("[DialogStore] Invalid dialog request:", event);
      return;
    }

    if (dialogStore.state.dialogRequest) {
      try {
        await handleDialogError(dialogStore.state.dialogRequest.id);
      } catch (error) {
        console.error("[DialogStore] Failed to clear previous dialog:", error);
      }
    }

    const { timeout, buttons } = event;
    const defaultButton = buttons.find((btn) => btn.default);
    if (timeout > 0 && buttons && defaultButton) {
      startCountdown(timeout, {
        id: event.id,
        button: defaultButton.key,
      });
    }

    dialogStore.setState((prev) => ({ ...prev, dialogRequest: event, showDialog: true }));
  } catch (error) {
    console.error("[DialogStore] Error processing dialog request:", error);
  }
};

export const setupDialogListener = () => {
  unsubscribeDialogRequested = dialogClient.onRequested(handleDialogRequested);
};

export const removeDialogListener = () => {
  clearTimer();
  unsubscribeDialogRequested?.();
  unsubscribeDialogRequested = null;
};

export function useDialogStore() {
  const state = useStore(dialogStore);
  return {
    ...state,
    handleResponse,
    setupDialogListener,
    removeDialogListener,
  };
}
