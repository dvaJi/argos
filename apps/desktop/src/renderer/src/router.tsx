import { createRouter, createHashHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultNotFoundComponent: (props) => {
    console.error("Route not found:", props, props.routeId);
    return (
      <div>
        <h2>Page not found</h2>
        <button onClick={() => router.navigate({ to: "/" })}>Go to Home</button>
      </div>
    );
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
