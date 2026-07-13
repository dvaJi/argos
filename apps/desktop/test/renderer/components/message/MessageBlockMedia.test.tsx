import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MessageBlockAudio from "#/components/message/MessageBlockAudio";
import MessageBlockImage from "#/components/message/MessageBlockImage";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";

const createBlock = (overrides: Partial<DisplayAssistantMessageBlock> = {}): DisplayAssistantMessageBlock => ({
  type: "image",
  status: "success",
  timestamp: Date.now(),
  ...overrides,
});

describe("MessageBlock media", () => {
  it("renders image from image_data url payload", () => {
    const { container } = render(
      <MessageBlockImage
        block={createBlock({
          type: "image",
          image_data: {
            data: "https://example.com/image.png",
            mimeType: "argos/image-url",
          },
        })}
      />,
    );

    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://example.com/image.png");
  });

  it("renders image from legacy persisted payload", () => {
    const { container } = render(
      <MessageBlockImage
        block={createBlock({
          type: "image",
          content: {
            data: "data:image/png;base64,AAAA",
            mimeType: "image/png",
          } as never,
        })}
      />,
    );

    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });

  it("renders audio from image_data payload", () => {
    const { container } = render(
      <MessageBlockAudio
        block={createBlock({
          type: "audio",
          image_data: {
            data: "data:audio/wav;base64,BBBB",
            mimeType: "audio/wav",
          },
        })}
      />,
    );

    const audio = container.querySelector("audio")!;
    expect(audio.getAttribute("src")).toBe("data:audio/wav;base64,BBBB");
  });

  it("renders audio from legacy persisted payload", () => {
    const { container } = render(
      <MessageBlockAudio
        block={createBlock({
          type: "audio",
          content: {
            data: "CCCC",
            mimeType: "audio/mpeg",
          } as never,
        })}
      />,
    );

    const audio = container.querySelector("audio")!;
    expect(audio.getAttribute("src")).toBe("data:audio/mpeg;base64,CCCC");
  });
});
