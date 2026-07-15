import type { RemotePendingInteraction } from "../types";

export const buildPendingInteractionText = (interaction: RemotePendingInteraction): string => {
  if (interaction.type === "permission") {
    const permission = interaction.permission;
    const command = permission?.command || permission?.commandInfo?.command || "";
    return [
      "Permission Required",
      permission?.permissionType ? `Type: ${permission.permissionType}` : "",
      interaction.toolName ? `Tool: ${interaction.toolName}` : "",
      command ? `Command: ${command}` : interaction.toolArgs ? `Arguments: ${interaction.toolArgs}` : "",
      permission?.serverName ? `Server: ${permission.serverName}` : "",
      "",
      permission?.description?.trim() || "",
      "",
      "Reply with ALLOW or DENY.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const question = interaction.question;
  return [
    "Question",
    question?.header?.trim() || "",
    question?.question?.trim() || interaction.toolName || "Answer required",
    "",
    ...(question?.options?.map((option, index) =>
      option.description?.trim()
        ? `${index + 1}. ${option.label} - ${option.description.trim()}`
        : `${index + 1}. ${option.label}`,
    ) ?? []),
    "",
    question?.multiple
      ? "Reply with your answer in plain text."
      : question?.custom !== false
        ? "Reply with the option number / label / your own answer."
        : "Reply with the option number or exact label.",
  ]
    .filter(Boolean)
    .join("\n");
};
