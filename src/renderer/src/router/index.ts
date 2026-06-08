import {
  createRootRoute,
  createRoute,
  createRouter,
  createHashHistory,
  redirect
} from '@tanstack/react-router'

const rootRoute = createRootRoute({})

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  lazyRouteComponent: () => import('@/views/ChatTabView')
})

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/welcome',
  lazyRouteComponent: () => import('@/pages/WelcomePage')
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/chat' })
  }
})

const routeTree = rootRoute.addChildren([indexRoute, chatRoute, welcomeRoute])

export const router = createRouter({
  routeTree,
  history: createHashHistory()
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
