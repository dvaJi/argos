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
  defaultOnCatch: (props) => {
    console.error("Route catch:", props);
    return (
      <div>
        <h2>Route catch</h2>
        <p>{JSON.stringify(props)}</p>
        <button onClick={() => router.navigate({ to: "/" })}>Go to Home</button>
      </div>
    );
  },
  defaultErrorComponent: (props) => {
    console.error("Route error:", props);
    return (
      <div>
        <h2>Route error</h2>
        <p>{props.error.message}</p>
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
