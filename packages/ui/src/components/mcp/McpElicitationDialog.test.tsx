import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { multiChoiceOptions, singleChoiceOptions } from "#/lib/elicitationOptions";

const submitted = vi.fn<(decision: unknown) => Promise<void>>(async () => undefined);
let deliverRequest: ((payload: { request: unknown }) => void) | null = null;

vi.mock("#api/McpClient", () => ({
  createMcpClient: () => ({
    submitElicitationDecision: submitted,
    cancelElicitation: async () => undefined,
    onElicitationRequest: (listener: (payload: { request: unknown }) => void) => {
      deliverRequest = listener;
      return () => {
        deliverRequest = null;
      };
    },
    onElicitationCancelled: () => () => {},
    onElicitationDecision: () => () => {},
  }),
}));

describe("elicitation choice options", () => {
  it("reads enum, enumNames, and titled oneOf/anyOf shapes", () => {
    expect(singleChoiceOptions({ type: "string", enum: ["a", "b"], enumNames: ["Alpha"] })).toEqual([
      { value: "a", label: "Alpha" },
      { value: "b", label: "b" },
    ]);
    expect(singleChoiceOptions({ type: "string", oneOf: [{ const: "x", title: "Ex" }] })).toEqual([
      { value: "x", label: "Ex" },
    ]);
    expect(multiChoiceOptions({ type: "array", items: { anyOf: [{ const: "p", title: "Pee" }] } })).toEqual([
      { value: "p", label: "Pee" },
    ]);
    expect(multiChoiceOptions({ type: "array", items: { type: "string" } })).toBeNull();
    expect(singleChoiceOptions({ type: "string" })).toBeNull();
  });
});

describe("McpElicitationDialog", () => {
  it("submits enum values picked from chips (testbed ask_form schema)", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const { default: McpElicitationDialog } = await import("./McpElicitationDialog");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<McpElicitationDialog />));

    await act(async () =>
      deliverRequest!({
        request: {
          requestId: "testbed:1",
          serverName: "testbed",
          message: "Testbed form: fill in every field type",
          requestedSchema: {
            type: "object",
            properties: {
              name: { type: "string", title: "Name" },
              color: { type: "string", title: "Favorite color", enum: ["red", "green", "blue"] },
              tags: { type: "array", title: "Tags", items: { type: "string", enum: ["alpha", "beta", "gamma"] } },
            },
            required: ["name", "color"],
          },
        },
      }),
    );

    const button = (text: string) =>
      [...container.querySelectorAll("button")].find((el) => el.textContent === text) as HTMLButtonElement;
    // No free-text box for the enum fields.
    expect(container.querySelectorAll("input[type=text]")).toHaveLength(1);

    const name = container.querySelector("#mcp-elicitation-field-name") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(name, "Ada");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("green").click());
    await act(async () => button("alpha").click());
    await act(async () => button("gamma").click());
    await act(async () => button("alpha").click()); // toggles off
    await act(async () => button("Submit").click());

    expect(submitted).toHaveBeenCalledWith({
      requestId: "testbed:1",
      action: "accept",
      content: { name: "Ada", color: "green", tags: ["gamma"] },
    });

    await act(async () => root.unmount());
    container.remove();
  });
});
