import { hasArgosRouteContract, ARGOS_ROUTE_CATALOG } from "@argos/shared-contracts/routes";
import type { ArgosRouteName } from "@argos/shared-contracts/routes";

export type RouteDispatchRequest = {
  route: ArgosRouteName;
  input: unknown;
};

export type RouteDispatchResponse =
  | { ok: true; output: unknown }
  | { ok: false; error: { code: string; message: string } };

export type RouteDispatcher = (route: ArgosRouteName, input: unknown) => Promise<unknown>;

let routeDispatcher: RouteDispatcher | null = null;

export function setRouteDispatcher(dispatcher: RouteDispatcher): void {
  routeDispatcher = dispatcher;
}

export async function handleRouteDispatch(request: Request): Promise<Response> {
  let body: RouteDispatchRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: { code: "invalid_json", message: "Request body must be valid JSON" } },
      { status: 400 },
    );
  }

  const { route, input } = body;

  if (!hasArgosRouteContract(route)) {
    return Response.json(
      { ok: false, error: { code: "unknown_route", message: `Unknown route: ${String(route)}` } },
      { status: 400 },
    );
  }

  const contract = ARGOS_ROUTE_CATALOG[route];
  if (!contract) {
    return Response.json(
      { ok: false, error: { code: "no_contract", message: `No contract for route: ${String(route)}` } },
      { status: 500 },
    );
  }

  if (!routeDispatcher) {
    return Response.json(
      { ok: false, error: { code: "not_initialized", message: "Route dispatcher not initialized" } },
      { status: 503 },
    );
  }

  try {
    const parsedInput = contract.input.parse(input);
    const output = await routeDispatcher(route, parsedInput);
    const parsedOutput = contract.output.parse(output);
    return Response.json({ ok: true, output: parsedOutput });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.includes("validation") ? "validation_error" : "dispatch_error";
    return Response.json({ ok: false, error: { code, message } }, { status: 500 });
  }
}
