import { readFile } from "fs/promises";

const PDF_MAGIC = Buffer.from("%PDF", "ascii");
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export interface ExtractedPdf {
  type: "pdf";
  base64: string;
}

export async function extract(filePath: string): Promise<ExtractedPdf> {
  try {
    const buffer = await readFile(filePath);

    if (buffer.length > MAX_FILE_BYTES) {
      throw new Error(
        `File too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Max ${MAX_FILE_BYTES / 1024 / 1024} MB to avoid high API cost.`
      );
    }

    if (buffer.length < PDF_MAGIC.length || !buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      throw new Error("File does not appear to be a PDF (missing %PDF header).");
    }

    const base64 = buffer.toString("base64");
    return { type: "pdf", base64 };
  } catch (err) {
    if (err instanceof Error) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Failed to read PDF: ${err.message}`);
    }
    throw err;
  }
}
