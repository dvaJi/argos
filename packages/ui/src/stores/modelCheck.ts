import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";

interface ModelCheckState {
  isDialogOpen: boolean;
  currentProviderId: string;
}

export const modelCheckStore = new Store<ModelCheckState>({
  isDialogOpen: false,
  currentProviderId: "",
});

const openDialog = (providerId: string) => {
  modelCheckStore.setState((prev) => ({ ...prev, isDialogOpen: true, currentProviderId: providerId }));
};

const closeDialog = () => {
  modelCheckStore.setState((prev) => ({ ...prev, isDialogOpen: false, currentProviderId: "" }));
};

export function useModelCheckStore() {
  const state = useStore(modelCheckStore);
  return {
    ...state,
    openDialog,
    closeDialog,
  };
}
