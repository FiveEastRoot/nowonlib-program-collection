export type HwpxDocumentType =
  | "day10_city"
  | "day20_city"
  | "day20_foundation";

export interface HwpxRequest {
  collectionId: string;
  documentType: HwpxDocumentType;
  reviewedOnly: boolean;
  excludeWarnings: boolean;
}

export interface HwpxPreview {
  title: string;
  fileName: string;
  documentType: HwpxDocumentType;
  programCount: number;
  reviewedOnly: boolean;
  excludeWarnings: boolean;
  programs: Array<{
    libraryName: string;
    libraryAbbreviation: string;
    programType?: string;
    title: string;
    schedule: string;
    location: string;
    audience: string;
    capacity: number | null;
    description: string;
    managerName: string;
  }>;
  storageStatus: "drive_on_generate";
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

interface RawPreview {
  title: string;
  file_name: string;
  document_type: HwpxDocumentType;
  program_count: number;
  reviewed_only: boolean;
  exclude_warnings: boolean;
  programs: HwpxPreview["programs"];
  storage_status: "drive_on_generate";
}

export class HwpxClient {
  constructor(private readonly endpoint = "/api/hwpx") {}

  async preview(request: HwpxRequest): Promise<HwpxPreview> {
    const response = await this.call(request, "preview");
    const envelope = (await response.json()) as Envelope<RawPreview>;
    if (!response.ok || !envelope.ok || !envelope.data) {
      throw new HwpxClientError(
        envelope.error?.code ?? "HWPX_PREVIEW_FAILED",
        envelope.error?.message ?? "HWPX 미리보기를 만들지 못했습니다.",
      );
    }
    return {
      title: envelope.data.title,
      fileName: envelope.data.file_name,
      documentType: envelope.data.document_type,
      programCount: envelope.data.program_count,
      reviewedOnly: envelope.data.reviewed_only,
      excludeWarnings: envelope.data.exclude_warnings,
      programs: envelope.data.programs,
      storageStatus: envelope.data.storage_status,
    };
  }

  async generate(request: HwpxRequest): Promise<string> {
    const response = await this.call(request, "generate");
    if (!response.ok) {
      const envelope = (await response.json()) as Envelope<never>;
      throw new HwpxClientError(
        envelope.error?.code ?? "HWPX_GENERATION_FAILED",
        envelope.error?.message ?? "HWPX 파일을 생성하지 못했습니다.",
      );
    }
    const blob = await response.blob();
    const fileName = responseFileName(response) ?? "노원구립도서관_수합.hwpx";
    downloadBlob(blob, fileName);
    return fileName;
  }

  async download(fileId: string): Promise<string> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "download", file_id: fileId }),
    });
    if (!response.ok) {
      const envelope = (await response.json()) as Envelope<never>;
      throw new HwpxClientError(
        envelope.error?.code ?? "HWPX_DOWNLOAD_FAILED",
        envelope.error?.message ?? "보관된 HWPX 파일을 내려받지 못했습니다.",
      );
    }
    const blob = await response.blob();
    const fileName = responseFileName(response) ?? "보관된_수합문서.hwpx";
    downloadBlob(blob, fileName);
    return fileName;
  }

  downloadLocalFixture(fileName: string): void {
    if (!import.meta.env.DEV) return;
    downloadBlob(
      new Blob([new Uint8Array([80, 75, 3, 4])], {
        type: "application/hwp+zip",
      }),
      fileName,
    );
  }

  private call(
    request: HwpxRequest,
    mode: "preview" | "generate",
  ): Promise<Response> {
    return fetch(this.endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collection_id: request.collectionId,
        document_type: request.documentType,
        reviewed_only: request.reviewedOnly,
        exclude_warnings: request.excludeWarnings,
        mode,
      }),
    });
  }
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export class HwpxClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function responseFileName(response: Response): string | null {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return disposition.match(/filename="([^"]+)"/i)?.[1] ?? null;
}
