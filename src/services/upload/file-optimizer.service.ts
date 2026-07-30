import { $ } from "bun";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import {
  GHOSTSCRIPT_BIN,
  UPLOAD_IMAGE_MAX_HEIGHT,
  UPLOAD_IMAGE_MAX_WIDTH,
  UPLOAD_IMAGE_QUALITY,
} from "@constants";
import type { OptimizedFile } from "./upload.types";

const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function isImage(file: File) {
  return imageMimeTypes.has(file.type);
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function withOptimizedName(fileName: string, extension: string) {
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
  return `${baseName}-optimized.${extension}`;
}

async function optimizeImage(file: File): Promise<OptimizedFile> {
  const input = Buffer.from(await file.arrayBuffer());
  const output = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: UPLOAD_IMAGE_MAX_WIDTH,
      height: UPLOAD_IMAGE_MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: UPLOAD_IMAGE_QUALITY,
      mozjpeg: true,
    })
    .toBuffer();

  if (output.length >= input.length) {
    return {
      file,
      optimized: false,
      reason: "optimized image was not smaller than original",
      originalSize: input.length,
      optimizedSize: input.length,
    };
  }

  return {
    file: new File([output], withOptimizedName(file.name, "jpg"), { type: "image/jpeg" }),
    optimized: true,
    originalSize: input.length,
    optimizedSize: output.length,
  };
}

async function optimizePdf(file: File): Promise<OptimizedFile> {
  if (!GHOSTSCRIPT_BIN) {
    return {
      file,
      optimized: false,
      reason: "GHOSTSCRIPT_BIN is not configured",
      originalSize: file.size,
      optimizedSize: file.size,
    };
  }

  const tempId = crypto.randomUUID();
  const inputPath = `${process.cwd()}/tmp/${tempId}-input.pdf`;
  const outputPath = `${process.cwd()}/tmp/${tempId}-output.pdf`;

  await mkdir(`${process.cwd()}/tmp`, { recursive: true });
  await Bun.write(inputPath, file);

  try {
    await $`${GHOSTSCRIPT_BIN} -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile=${outputPath} ${inputPath}`.quiet();

    const outputFile = Bun.file(outputPath);
    const output = await outputFile.arrayBuffer();

    if (output.byteLength >= file.size) {
      return {
        file,
        optimized: false,
        reason: "optimized PDF was not smaller than original",
        originalSize: file.size,
        optimizedSize: file.size,
      };
    }

    return {
      file: new File([output], withOptimizedName(file.name, "pdf"), { type: "application/pdf" }),
      optimized: true,
      originalSize: file.size,
      optimizedSize: output.byteLength,
    };
  } finally {
    await Promise.all([
      Bun.file(inputPath).delete().catch(() => undefined),
      Bun.file(outputPath).delete().catch(() => undefined),
    ]);
  }
}

export const fileOptimizerService = {
  canOptimize(file: File) {
    return isImage(file) || isPdf(file);
  },

  async optimize(file: File): Promise<OptimizedFile> {
    if (isImage(file)) return optimizeImage(file);
    if (isPdf(file)) return optimizePdf(file);

    return {
      file,
      optimized: false,
      reason: "unsupported file type",
      originalSize: file.size,
      optimizedSize: file.size,
    };
  },
};
