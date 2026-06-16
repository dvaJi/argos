import { BaseFileAdapter } from "./BaseFileAdapter";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
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
      const metadata = await sharp(this.filePath).metadata();
      this.imageMetadata = {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
      };
    } catch (error) {
      console.error("Error extracting image metadata:", error);
      // If sharp fails, at least get format from file extension
      this.imageMetadata.format = path.extname(this.filePath).substring(1).toLowerCase();
    }
  }

  public async getThumbnail(): Promise<string | undefined> {
    // Compress image and convert to JPG format
    const compressedImage = await sharp(this.filePath)
      .resize(256, 256, {
        // Limit max dimensions
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        // Convert to JPG uniformly
        quality: 70, // Compression quality
        mozjpeg: true, // Use mozjpeg optimization
      });

    const buffer = await compressedImage.toBuffer();

    const base64ImageString = buffer.toString("base64");
    return `data:image/jpeg;base64,${base64ImageString}`;
  }

  public async getLLMContent(): Promise<string | undefined> {
    const stats = await fs.stat(this.filePath);
    if (stats.size > this.maxFileSize) {
      return undefined;
    }

    // Extract image metadata
    await this.extractImageMetadata();

    // Compress image and convert to JPG format
    const compressedImage = await sharp(this.filePath)
      .resize(1200, 1200, {
        // Limit max dimensions
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        // Convert to JPG uniformly
        quality: 70, // Compression quality
        mozjpeg: true, // Use mozjpeg optimization
      });
    this.imageMetadata.compressWidth = (await compressedImage.metadata()).width ?? this.imageMetadata.width;
    this.imageMetadata.compressHeight = (await compressedImage.metadata()).height ?? this.imageMetadata.height;

    const buffer = await compressedImage.toBuffer();

    const base64ImageString = buffer.toString("base64");
    return `data:image/jpeg;base64,${base64ImageString}`;
  }

  async getContent(): Promise<string | undefined> {
    // if (this.visionDescription === undefined) {
    //   this.visionDescription = await this.generateImageDescription()
    // }
    // return this.visionDescription
    return "";
  }
}
