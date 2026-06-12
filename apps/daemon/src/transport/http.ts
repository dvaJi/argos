import { hasDeepchatRouteContract, DEEPCHAT_ROUTE_CATALOG } from "@argos/shared-contracts/routes";
import type { DeepchatRouteName, DeepchatRouteInput, DeepchatRouteOutput } from "@argos/shared-contracts/routes";

type RouteDispatchRequest = {
  route: DeepchatRouteName;
  input: DeepchatRouteInput<DeepchatRouteName>;
};

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

  if (!hasDeepchatRouteContract(route)) {
    return Response.json(
      { ok: false, error: { code: "unknown_route", message: `Unknown route: ${String(route)}` } },
      { status: 400 },
    );
  }

  const contract = DEEPCHAT_ROUTE_CATALOG[route];
  if (!contract) {
    return Response.json(
      { ok: false, error: { code: "no_contract", message: `No contract found for route: ${String(route)}` } },
      { status: 500 },
    );
  }

  try {
    const parsedInput = contract.input.parse(input);
    const output = await dispatchRoute(route, parsedInput);
    const parsedOutput = contract.output.parse(output);
    return Response.json({ ok: true, output: parsedOutput });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.includes("validation") ? "validation_error" : "dispatch_error";
    return Response.json({ ok: false, error: { code, message } }, { status: 500 });
  }
}

async function dispatchRoute(_route: DeepchatRouteName, _input: unknown): Promise<unknown> {
  return { message: "Daemon route dispatch not yet implemented. Backend core extraction in progress." };
}
