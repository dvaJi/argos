import { hasArgosRouteContract, ARGOS_ROUTE_CATALOG } from "@argos/shared-contracts/routes";
import type { ArgosRouteName } from "@argos/shared-contracts/routes";

type RouteDispatchRequest = {
  route: ArgosRouteName;
  input: unknown;
};

export type RouteDispatchResponse =
  | { ok: true; output: unknown }
  | { ok: false; error: { code: string; message: string } };

export type RouteDispatcher = (route: ArgosRouteName, input: unknown) => Promise<unknown>;

let routeDispatcher: RouteDispatcher | null = null;

export function ensureJsonSerializableRouteResponse(result: RouteDispatchResponse): RouteDispatchResponse {
  try {
    JSON.stringify(result);
    return result;
  } catch {
    return {
      ok: false,
      error: {
        code: "serialization_error",
        message: "Route returned a value that cannot be sent to the client",
      },
    };
  }
}

export function setRouteDispatcher(dispatcher: RouteDispatcher): void {
  routeDispatcher = dispatcher;
}

/**
 * Core route dispatch logic shared by HTTP and WebSocket transports.
 * Validates input/output against the route catalog contract.
 */
export async function dispatchRoute(route: string, input: unknown): Promise<RouteDispatchResponse> {
  if (!hasArgosRouteContract(route)) {
    return { ok: false, error: { code: "unknown_route", message: `Unknown route: ${String(route)}` } };
  }

  const contract = ARGOS_ROUTE_CATALOG[route as ArgosRouteName];
  if (!contract) {
    return { ok: false, error: { code: "no_contract", message: `No contract for route: ${String(route)}` } };
  }

  if (!routeDispatcher) {
    return { ok: false, error: { code: "not_initialized", message: "Route dispatcher not initialized" } };
  }

  try {
    const parsedInput = contract.input.parse(input);
    const output = await routeDispatcher(route as ArgosRouteName, parsedInput);
    const parsedOutput = contract.output.parse(output);
    return ensureJsonSerializableRouteResponse({ ok: true, output: parsedOutput });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.includes("validation") ? "validation_error" : "dispatch_error";
    return { ok: false, error: { code, message } };
  }
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

  const result = await dispatchRoute(body.route, body.input);
  const status = result.ok
    ? 200
    : result.error.code === "unknown_route" || result.error.code === "validation_error"
      ? 400
      : 500;
  return Response.json(result, { status });
}
