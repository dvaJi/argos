import { describe, expect, it } from "bun:test";
import { ModelType } from "@argos/shared/model";
import { deriveListedModelCapabilities, deriveListedModelType } from "../src/host/daemonConfigPresenter";

describe("deriveListedModelCapabilities", () => {
  it("maps OpenRouter metadata to capability flags", () => {
    expect(
      deriveListedModelCapabilities({
        id: "vendor/model",
        architecture: { input_modalities: ["text", "image"] },
        supported_parameters: ["tools", "reasoning", "temperature"],
        pricing: { prompt: "0.000001", completion: "0.000002" },
      }),
    ).toEqual({ vision: true, functionCall: true, reasoning: true, isFree: false });
  });

  it("reports missing capabilities as false when metadata is present", () => {
    expect(
      deriveListedModelCapabilities({
        id: "vendor/plain",
        architecture: { input_modalities: ["text"] },
        supported_parameters: ["temperature"],
        pricing: { prompt: "0", completion: "0" },
      }),
    ).toEqual({ vision: false, functionCall: false, reasoning: false, isFree: true });
  });

  it("treats :free ids as free and negative router pricing as not free", () => {
    expect(deriveListedModelCapabilities({ id: "x/y:free" }).isFree).toBe(true);
    expect(
      deriveListedModelCapabilities({ id: "openrouter/auto", pricing: { prompt: "-1", completion: "-1" } }).isFree,
    ).toBe(false);
  });

  it("leaves flags undefined for plain OpenAI-compatible payloads", () => {
    expect(deriveListedModelCapabilities({ id: "gpt-x" })).toEqual({
      vision: undefined,
      functionCall: undefined,
      reasoning: undefined,
      isFree: undefined,
    });
  });
});

describe("deriveListedModelCapabilities pricing", () => {
  it("does not mark models free when another price field is billed", () => {
    expect(
      deriveListedModelCapabilities({
        id: "recraft/x",
        pricing: { prompt: "0", completion: "0", image_output: "0.0000016" },
      }).isFree,
    ).toBe(false);
  });
});

describe("deriveListedModelType", () => {
  const withOutputs = (outputs: string[]) => ({ architecture: { output_modalities: outputs } });

  it("maps non-text output modalities to model types", () => {
    expect(deriveListedModelType(withOutputs(["decisions"]))).toBe(ModelType.Decisions);
    expect(deriveListedModelType(withOutputs(["embeddings"]))).toBe(ModelType.Embedding);
    expect(deriveListedModelType(withOutputs(["rerank"]))).toBe(ModelType.Rerank);
    expect(deriveListedModelType(withOutputs(["image"]))).toBe(ModelType.ImageGeneration);
    expect(deriveListedModelType(withOutputs(["video"]))).toBe(ModelType.VideoGeneration);
    expect(deriveListedModelType(withOutputs(["speech"]))).toBe(ModelType.TTS);
  });

  it("keeps text-output models as chat and drops unsupported types", () => {
    expect(deriveListedModelType(withOutputs(["image", "text"]))).toBeUndefined();
    expect(deriveListedModelType(withOutputs(["text"]))).toBeUndefined();
    expect(deriveListedModelType(withOutputs(["transcription"]))).toBeNull();
    expect(deriveListedModelType({ type: "text-embedding" })).toBe(ModelType.Embedding);
  });
});
