import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkillSyncDialog } from "#settings/components/skills/SkillSyncDialog";

vi.mock("#settings/components/skills/SkillSyncDialog/ImportWizard", () => ({
  default: ({ currentStep, initialToolId, initialSkills }: Record<string, unknown>) => (
    <div
      data-testid="import-wizard"
      data-current-step={String(currentStep)}
      data-tool-id={String(initialToolId)}
      data-skills={JSON.stringify(initialSkills)}
    />
  ),
}));

describe("SkillSyncDialog", () => {
  it("opens a selected external source directly at skill selection", () => {
    render(
      <SkillSyncDialog
        open
        mode="import"
        initialToolId="codex"
        initialSkills={["review", "release"]}
        onOpenChange={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    const wizard = screen.getByTestId("import-wizard");
    expect(wizard).toHaveAttribute("data-current-step", "2");
    expect(wizard).toHaveAttribute("data-tool-id", "codex");
    expect(wizard).toHaveAttribute("data-skills", '["review","release"]');
  });
});
