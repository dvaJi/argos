import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";

function RerenderingScrollArea() {
  const [count, setCount] = useState(0);

  return (
    <ScrollArea data-testid="scroll-area" className="h-20">
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Count {count}
      </button>
    </ScrollArea>
  );
}

describe("ScrollArea", () => {
  it("survives state-driven rerenders without a callback-ref update loop", () => {
    render(<RerenderingScrollArea />);

    fireEvent.click(screen.getByRole("button", { name: "Count 0" }));

    expect(screen.getByRole("button", { name: "Count 1" })).toBeTruthy();
    expect(screen.getByTestId("scroll-area").className).toContain("overflow-auto");
  });
});
