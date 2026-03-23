/**
 * Image Handler — Extracts, stores, and manages images from Figma
 * for use in the HTML preview environment.
 */

import { writeFile, mkdir } from "fs/promises";
import { join, basename } from "path";
import { createLogger } from "../engine/logger.js";

const log = createLogger("figma-images");

export interface ExtractedImage {
  nodeId: string;
  name: string;
  format: "png" | "svg";
  localPath: string;
  width: number;
  height: number;
}

export class ImageStore {
  private outputDir: string;
  private images = new Map<string, ExtractedImage>();

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  async save(
    nodeId: string,
    name: string,
    data: Buffer,
    format: "png" | "svg",
    dimensions: { width: number; height: number }
  ): Promise<ExtractedImage> {
    await mkdir(this.outputDir, { recursive: true });

    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
    const fileName = `${safeName}.${format}`;
    const filePath = join(this.outputDir, fileName);

    await writeFile(filePath, data);

    const image: ExtractedImage = {
      nodeId,
      name,
      format,
      localPath: filePath,
      width: dimensions.width,
      height: dimensions.height,
    };

    this.images.set(nodeId, image);
    log.info(`Saved image: ${fileName} (${dimensions.width}x${dimensions.height})`);

    return image;
  }

  get(nodeId: string): ExtractedImage | undefined {
    return this.images.get(nodeId);
  }

  getAll(): ExtractedImage[] {
    return Array.from(this.images.values());
  }

  /**
   * Generate an HTML img tag for use in previews.
   */
  toImgTag(nodeId: string, className?: string): string {
    const image = this.images.get(nodeId);
    if (!image) return "";

    const cls = className ? ` class="${className}"` : "";
    const relativePath = `assets/${basename(image.localPath)}`;

    return `<img src="${relativePath}" alt="${image.name}" width="${image.width}" height="${image.height}"${cls} />`;
  }
}
