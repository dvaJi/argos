import { BaseFileAdapter } from "./BaseFileAdapter";
import fs from "fs/promises";
import path from "path";
import { callImageProcessingRoute } from "./imageProcessingRoute";
// import { VisionService } from '../llm/VisionService'
// import { loadVisionConfig } from '../../utils/env'

export class ImageFileAdapter extends BaseFileAdapter {
  private maxFileSize: number;
  imageMetadata: {
    width?: number;
    height?: number;
    format?: string;
    compressWidth?: number;
    compressHeight?: number;
  } = {};
  // private visionDescription: string | undefined

  constructor(filePath: string, maxFileSize: number) {
    super(filePath);
    this.maxFileSize = maxFileSize;
  }

  protected getFileDescription(): string | undefined {
    return "Image File";
  }

  /**
   * Extract basic image information
   */
  private async extractImageMetadata(): Promise<void> {
    try {
      const buffer = await fs.readFile(this.filePath);
      const result = await callImageProcessingRoute<{
        imageBase64: string;
        metadata?: { width?: number; height?: number; format?: string };
      }>("image.process", {
        imageBase64: buffer.toString("base64"),
        operations: [{ type: "metadata" }],
      });
      this.imageMetadata = {
        width: result.metadata?.width,
        height: result.metadata?.height,
        format: result.metadata?.format,
      };
    } catch (error) {
      console.error("Error extracting image metadata:", error);
      // Fallback to file extension
      this.imageMetadata.format = path.extname(this.filePath).substring(1).toLowerCase();
    }
  }

  public async getThumbnail(): Promise<string | undefined> {
    const buffer = await fs.readFile(this.filePath);
    const result = await callImageProcessingRoute<{ imageBase64: string }>("image.process", {
      imageBase64: buffer.toString("base64"),
      operations: [
        { type: "resize", width: 256, height: 256, fit: "inside", withoutEnlargement: true },
        { type: "jpeg", quality: 70 },
      ],
    });
    return `data:image/jpeg;base64,${result.imageBase64}`;
  }

  public async getLLMContent(): Promise<string | undefined> {
    const stats = await fs.stat(this.filePath);
    if (stats.size > this.maxFileSize) {
      return undefined;
    }

    // Extract image metadata
    await this.extractImageMetadata();

    const buffer = await fs.readFile(this.filePath);
    const result = await callImageProcessingRoute<{
      imageBase64: string;
      metadata?: { width?: number; height?: number; format?: string };
    }>("image.process", {
      imageBase64: buffer.toString("base64"),
      operations: [
        { type: "resize", width: 1200, height: 1200, fit: "inside", withoutEnlargement: true },
        { type: "jpeg", quality: 70 },
        { type: "metadata" },
      ],
    });

    this.imageMetadata.compressWidth = result.metadata?.width ?? this.imageMetadata.width;
    this.imageMetadata.compressHeight = result.metadata?.height ?? this.imageMetadata.height;

    return `data:image/jpeg;base64,${result.imageBase64}`;
  }

  async getContent(): Promise<string | undefined> {
    // if (this.visionDescription === undefined) {
    //   this.visionDescription = await this.generateImageDescription()
    // }
    // return this.visionDescription
    return "";
  }
}
