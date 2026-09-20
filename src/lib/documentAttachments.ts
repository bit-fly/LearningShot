import mammoth from "mammoth";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  ATTACHMENT_CONTEXT_END,
  ATTACHMENT_CONTEXT_START,
} from "./types";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_TEXT_CHARS = 100_000;

export type DocumentAttachmentErrorCode =
  | "too-large"
  | "unsupported"
  | "empty"
  | "text-too-long"
  | "parse-failed";

export class DocumentAttachmentError extends Error {
  constructor(public readonly code: DocumentAttachmentErrorCode) {
    super(code);
    this.name = "DocumentAttachmentError";
  }
}

export interface ParsedDocumentAttachment {
  id: string;
  name: string;
  size: number;
  text: string;
}

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "html", "htm", "xml"]);
const PDF_WORKER_FILENAME = "pdf.worker.min.mjs";

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(PDF_WORKER_FILENAME);

export async function parseDocumentAttachment(file: File): Promise<ParsedDocumentAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new DocumentAttachmentError("too-large");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!TEXT_EXTENSIONS.has(extension) && extension !== "pdf" && extension !== "docx") {
    throw new DocumentAttachmentError("unsupported");
  }

  try {
    let text: string;
    if (extension === "pdf") {
      text = await extractPdfText(await file.arrayBuffer());
    } else if (extension === "docx") {
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      text = result.value;
    } else {
      text = await extractTextFile(file, extension);
    }

    text = normalizeDocumentText(text);
    if (!text) {
      throw new DocumentAttachmentError("empty");
    }
    if (text.length > MAX_ATTACHMENT_TEXT_CHARS) {
      throw new DocumentAttachmentError("text-too-long");
    }

    return {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      text,
    };
  } catch (err) {
    if (err instanceof DocumentAttachmentError) {
      throw err;
    }
    throw new DocumentAttachmentError("parse-failed");
  }
}

export function buildAttachmentPrompt(question: string, attachments: ParsedDocumentAttachment[]): string {
  const blocks = attachments
    .map((attachment) => `--- ${attachment.name} ---\n${attachment.text}\n--- End ${attachment.name} ---`)
    .join("\n");
  return `${question}${ATTACHMENT_CONTEXT_START}${blocks}${ATTACHMENT_CONTEXT_END}`;
}

export function formatAttachmentNames(attachments: ParsedDocumentAttachment[]): string {
  return attachments.map((attachment) => attachment.name).join(", ");
}

async function extractTextFile(file: File, extension: string): Promise<string> {
  const text = await file.text();
  if (extension !== "html" && extension !== "htm") {
    return text;
  }

  const document = new DOMParser().parseFromString(text, "text/html");
  return document.body.textContent || "";
}

async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const loadingTask = getDocument({ data });
  let pdf: Awaited<typeof loadingTask.promise> | undefined;
  try {
    pdf = await loadingTask.promise;
    const pages: string[] = [];
    let totalLength = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      pages.push(pageText);
      totalLength += pageText.length;
      if (totalLength > MAX_ATTACHMENT_TEXT_CHARS) {
        throw new DocumentAttachmentError("text-too-long");
      }
    }

    return pages.join("\n\n");
  } finally {
    await loadingTask.destroy();
  }
}

function normalizeDocumentText(text: string): string {
  return text.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim();
}
