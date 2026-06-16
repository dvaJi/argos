import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

let traceDebugEnabled = true;

vi.mock("@/stores/uiSettingsStore", () => ({
  useUiSettingsStore: () => ({
    get traceDebugEnabled() {
      return traceDebugEnabled;
    },
  }),
}));

vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@shadcn/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: Record<string, any>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@shadcn/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: Record<string, any>) => <div>{children}</div>,
  Tooltip: ({ children }: Record<string, any>) => <div>{children}</div>,
  TooltipTrigger: ({ children }: Record<string, any>) => <div>{children}</div>,
  TooltipContent: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

import MessageToolbar from "@/components/message/MessageToolbar";

const baseProps = {
  usage: {
    context_usage: 0,
    tokens_per_second: 0,
    total_tokens: 0,
    reasoning_start_time: 0,
    reasoning_end_time: 0,
    input_tokens: 0,
    output_tokens: 0,
  },
  loading: false,
  isAssistant: true,
  isCapturingImage: false,
  showTrace: true,
  isInGeneratingThread: false,
  isReadOnly: false,
};

const mountToolbar = (overrides: Record<string, any> = {}) => render(<MessageToolbar {...baseProps} {...overrides} />);

describe("MessageToolbar trace button visibility", () => {
  it("shows trace button only when trace debug is enabled and message allows trace", async () => {
    traceDebugEnabled = true;
    const { container } = mountToolbar();

    const traceIcon = container.querySelector('[data-icon="lucide:bug"]')!;
    expect(traceIcon).toBeTruthy();

    await act(async () => {
      fireEvent.click(traceIcon);
    });
  });

  it("hides trace button when trace debug is disabled", () => {
    traceDebugEnabled = false;
    const { container } = mountToolbar();

    expect(container.querySelector('[data-icon="lucide:bug"]')).toBeNull();
  });

  it("hides trace button when message does not have trace", () => {
    traceDebugEnabled = true;
    const { container } = mountToolbar({ showTrace: false });

    expect(container.querySelector('[data-icon="lucide:bug"]')).toBeNull();
  });

  it("hides mutating actions in read-only mode but keeps copy", () => {
    traceDebugEnabled = true;
    const { container } = mountToolbar({ isReadOnly: true });

    expect(container.querySelector('[data-icon="lucide:refresh-cw"]')).toBeNull();
    expect(container.querySelector('[data-icon="lucide:git-branch"]')).toBeNull();
    expect(container.querySelector('[data-icon="lucide:trash-2"]')).toBeNull();
    expect(container.querySelector('[data-icon="lucide:copy"]')).toBeTruthy();
  });
});
