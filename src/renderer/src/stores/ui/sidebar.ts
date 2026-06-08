import { Store } from '@tanstack/store'

export const sidebarStore = new Store({
  collapsed: false
})

export const toggleSidebar = () => {
  sidebarStore.setState((prev) => ({ ...prev, collapsed: !prev.collapsed }))
}

export const setCollapsed = (value: boolean) => {
  sidebarStore.setState((prev) => ({ ...prev, collapsed: value }))
}
