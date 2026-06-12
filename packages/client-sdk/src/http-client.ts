import {
  getDeepchatRouteContract,
  type DeepchatRouteName,
  type DeepchatRouteInput,
  type DeepchatRouteOutput,
  hasDeepchatRouteContract,
} from "@argos/shared-contracts/routes";

export type HttpClientOptions = {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
};

export class HttpClient {
  private baseUrl: string;
  private token: string;
  private timeoutMs: number;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token ?? "";
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  async invoke<T extends DeepchatRouteName>(
    routeName: T,
    input: DeepchatRouteInput<T>,
  ): Promise<DeepchatRouteOutput<T>> {
    if (!hasDeepchatRouteContract(routeName)) {
      throw new Error(`Unknown route: ${routeName}`);
    }

    const contract = getDeepchatRouteContract(routeName);
    const normalizedInput = contract.input.parse(input);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.token) {
        headers["Authorization"] = `Bearer ${this.token}`;
      }

      const response = await fetch(`${this.baseUrl}/api/v1/route`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          route: routeName,
          input: normalizedInput,
        }),
        signal: controller.signal,
      });

      const body = await response.json();

      if (!body.ok) {
        const error = new Error(body.error?.message ?? "Route invocation failed");
        (error as any).code = body.error?.code;
        throw error;
      }

      return contract.output.parse(body.output) as DeepchatRouteOutput<T>;
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<{ status: string; version: string; uptime: number }> {
    const response = await fetch(`${this.baseUrl}/health`);
    return response.json();
  }
}
