import { Store } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";

export const sidebarStore = new Store({
  collapsed: false,
});

export const toggleSidebar = () => {
  sidebarStore.setState((prev) => ({ ...prev, collapsed: !prev.collapsed }));
};

const setCollapsed = (value: boolean) => {
  sidebarStore.setState((prev) => ({ ...prev, collapsed: value }));
};

export function useSidebarStore() {
  const state = useSelector(sidebarStore);
  return {
    ...state,
    toggleSidebar,
    setCollapsed,
  };
}
