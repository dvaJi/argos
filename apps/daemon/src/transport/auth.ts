export function authenticate(request: Request, expectedToken: string): { ok: true } | { ok: false; error: string } {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return { ok: false, error: "Missing Authorization header" };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, error: "Invalid Authorization format. Use: Bearer <token>" };
  }

  const token = match[1];
  if (token !== expectedToken) {
    return { ok: false, error: "Invalid token" };
  }

  return { ok: true };
}
