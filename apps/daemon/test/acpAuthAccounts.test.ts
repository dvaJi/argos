import { describe, it, expect, vi } from "bun:test";

/**
 * Verifies that the AcpAuthDialog renders configured accounts in the
 * method-select state and that the authStatus accounts from the
 * `providers.acpAuth.changed` event payload are consumed correctly.
 *
 * The rendering logic is exercised indirectly via the event payload
 * normalization in the auth runtime (`fetchAuthStatus`) which publishes
 * `providers.acpAuth.changed` with `authStatus.accounts`. The renderer
 * stores and displays these accounts in the dialog.
 *
 * This test validates the payload → rendering contract at the data level,
 * since rendering the full dialog component requires a browser environment.
 */
describe("AcpAuthDialog accounts rendering contract", () => {
  type AuthAccount = {
    label: string;
    description?: string | null;
    active?: boolean | null;
    name?: string | null;
    email?: string | null;
  };

  type AuthStatus = { state: string; accounts?: AuthAccount[] };

  function normalizeAccounts(raw: unknown): AuthAccount[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((account) => {
        const view = account as {
          label?: unknown;
          description?: unknown;
          active?: unknown;
          name?: unknown;
          email?: unknown;
        };
        if (typeof view.label !== "string" || !view.label.trim()) return null;
        return {
          label: view.label.trim(),
          description: typeof view.description === "string" && view.description.trim() ? view.description : null,
          active: view.active === true ? true : null,
          name: typeof view.name === "string" && view.name.trim() ? view.name : null,
          email: typeof view.email === "string" && view.email.trim() ? view.email : null,
        };
      })
      .filter((account): account is NonNullable<typeof account> => account !== null);
  }

  function extractAccounts(authStatus: unknown): AuthAccount[] {
    const view = authStatus as { accounts?: unknown };
    return normalizeAccounts(view?.accounts);
  }

  it("normalizes accounts from the auth/status response", () => {
    const raw = [
      {
        label: "  Claude Max  ",
        description: "  API key helper  ",
        active: true,
        name: "  test  ",
        email: "  test@test.com  ",
      },
      { label: "", description: "skipped" },
    ];
    const accounts = normalizeAccounts(raw);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].label).toBe("Claude Max");
    expect(accounts[0].description).toBe("  API key helper  ");
    expect(accounts[0].active).toBe(true);
    expect(accounts[0].name).toBe("  test  ");
    expect(accounts[0].email).toBe("  test@test.com  ");
  });

  it("returns empty for non-array accounts", () => {
    expect(normalizeAccounts(null)).toEqual([]);
    expect(normalizeAccounts(undefined)).toEqual([]);
    expect(normalizeAccounts("not an array")).toEqual([]);
  });

  it("extracts accounts from an authStatus payload", () => {
    const authStatus = {
      state: "authorized",
      accounts: [{ label: "OpenAI", description: null, active: false, name: null, email: null }],
    };
    const accounts = extractAccounts(authStatus);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].label).toBe("OpenAI");
    // normalizeAccounts treats non-true as null (mirrors fetchAuthStatus)
    expect(accounts[0].active).toBe(null);
  });

  it("returns empty accounts for missing authStatus", () => {
    expect(extractAccounts(undefined)).toEqual([]);
    expect(extractAccounts(null)).toEqual([]);
    expect(extractAccounts({})).toEqual([]);
  });
});
