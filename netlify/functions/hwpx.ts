import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { Config, Context } from "@netlify/functions";
import {
  buildHwpx,
  documentFileName,
  documentTitle,
  type HwpxDocumentType,
} from "./_shared/hwpxBuilder";
import {
  selectHwpxModel,
  type HwpxSnapshot,
} from "./_shared/hwpxSelection";
import {
  requireSession,
  SessionError,
  type SessionPrincipal,
} from "./_shared/session";

const MAX_BODY_BYTES = 16_384;
const UPSTREAM_TIMEOUT_MS = 25_000;
const DOCUMENT_TYPES = new Set<HwpxDocumentType>([
  "day10_city",
  "day20_city",
  "day20_foundation",
]);

interface HwpxRequest {
  collection_id?: string;
  document_type?: HwpxDocumentType;
  mode?: "preview" | "generate" | "download";
  file_id?: string;
  reviewed_only?: boolean;
  exclude_warnings?: boolean;
}

type ParsedHwpxRequest =
  | {
      mode: "download";
      file_id: string;
    }
  | {
      mode: "preview" | "generate";
      collection_id: string;
      document_type: HwpxDocumentType;
      reviewed_only: boolean;
      exclude_warnings: boolean;
    };

export default async function hwpx(
  request: Request,
  context: Context,
): Promise<Response> {
  if (request.method !== "POST") {
    return json(
      {
        ok: false,
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "허용되지 않은 요청 방식입니다.",
        },
      },
      405,
      { Allow: "POST" },
    );
  }

  try {
    assertSameOrigin(request);
    const principal = await requireSession(context);
    if (principal.role !== "admin") {
      throw new HwpxError(
        "FORBIDDEN",
        "관리자만 HWPX를 생성할 수 있습니다.",
        403,
      );
    }
    const body = await readRequest(request);
    if (body.mode === "download") {
      const archived = await fetchGeneratedFile(
        body.file_id,
        principal,
        context.requestId,
      );
      return new Response(archived.bytes.slice().buffer as ArrayBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/hwp+zip",
          "Content-Length": String(archived.bytes.byteLength),
          "Content-Disposition": `attachment; filename="archive.hwpx"; filename*=UTF-8''${encodeURIComponent(archived.fileName)}`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-HWPX-Archive-Status": "verified",
        },
      });
    }
    const snapshot = await fetchSnapshot(principal, context.requestId);
    const model = selectHwpxModel(snapshot, {
      collectionId: body.collection_id,
      documentType: body.document_type,
      reviewedOnly: body.reviewed_only,
      excludeWarnings: body.exclude_warnings,
    });

    if (body.mode === "preview") {
      return json({
        ok: true,
        data: {
          title: documentTitle(model),
          file_name: documentFileName(model),
          document_type: model.documentType,
          program_count: model.programs.length,
          reviewed_only: model.reviewedOnly,
          exclude_warnings: model.excludedWarnings,
          programs: model.programs,
          storage_status: "drive_on_generate",
        },
      });
    }

    const template = await readTemplate(model.documentType);
    const generated = buildHwpx(template, model);
    const fileName = documentFileName(model);
    const checksum = sha256(generated);
    const sourceRevision = sha256(
      new TextEncoder().encode(JSON.stringify(model)),
    );
    await archiveGeneratedFile(
      {
        collectionId: body.collection_id,
        documentType: model.documentType,
        fileName,
        generated,
        checksum,
        sourceRevision,
        notes: [
          `program_count=${model.programs.length}`,
          `reviewed_only=${model.reviewedOnly}`,
          `exclude_warnings=${model.excludedWarnings}`,
        ].join("; "),
      },
      principal,
      context.requestId,
    );
    const responseBody = generated.slice().buffer as ArrayBuffer;

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/hwp+zip",
        "Content-Length": String(generated.byteLength),
        "Content-Disposition": `attachment; filename="report.hwpx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-HWPX-Archive-Status": "stored",
      },
    });
  } catch (error) {
    if (error instanceof SessionError) {
      const status = error.code === "SERVER_NOT_CONFIGURED" ? 503 : 401;
      return json(
        { ok: false, error: { code: error.code, message: error.message } },
        status,
      );
    }
    if (error instanceof HwpxError) {
      return json(
        { ok: false, error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    const code =
      error instanceof Error ? error.message : "HWPX_GENERATION_FAILED";
    return json(
      {
        ok: false,
        error: {
          code,
          message: "HWPX 생성 중 오류가 발생했습니다.",
        },
      },
      500,
    );
  }
}

export const config: Config = {
  path: "/api/hwpx",
};

async function readRequest(request: Request): Promise<ParsedHwpxRequest> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    throw new HwpxError(
      "UNSUPPORTED_MEDIA_TYPE",
      "application/json 요청만 허용됩니다.",
      415,
    );
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new HwpxError(
      "PAYLOAD_TOO_LARGE",
      "요청 본문이 허용 크기를 초과했습니다.",
      413,
    );
  }
  let body: HwpxRequest;
  try {
    body = JSON.parse(raw) as HwpxRequest;
  } catch {
    throw new HwpxError("INVALID_JSON", "요청을 해석할 수 없습니다.", 400);
  }
  if (body.mode === "download") {
    if (
      !body.file_id ||
      body.file_id.length > 128 ||
      !/^file_[A-Za-z0-9._:-]+$/.test(body.file_id)
    ) {
      throw new HwpxError(
        "INVALID_FILE_ID",
        "생성 파일 ID를 확인해주세요.",
        400,
      );
    }
    return { mode: "download", file_id: body.file_id };
  }
  if (!body.collection_id || body.collection_id.length > 80) {
    throw new HwpxError(
      "INVALID_COLLECTION_ID",
      "수합 회차를 확인해주세요.",
      400,
    );
  }
  if (!body.document_type || !DOCUMENT_TYPES.has(body.document_type)) {
    throw new HwpxError(
      "INVALID_DOCUMENT_TYPE",
      "출력 문서 종류를 확인해주세요.",
      400,
    );
  }
  if (body.mode !== "preview" && body.mode !== "generate") {
    throw new HwpxError(
      "INVALID_MODE",
      "미리보기 또는 생성 작업을 선택해주세요.",
      400,
    );
  }
  return {
    collection_id: body.collection_id,
    document_type: body.document_type,
    mode: body.mode,
    reviewed_only: body.reviewed_only ?? true,
    exclude_warnings: body.exclude_warnings ?? false,
  };
}

async function fetchGeneratedFile(
  fileId: string,
  principal: SessionPrincipal,
  requestId: string,
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const { endpoint, serviceSecret } = appsScriptConfiguration();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_secret: serviceSecret,
        request_id: `hwpx-download-${requestId}`,
        action: "get_generated_file",
        actor: {
          role: principal.role,
          actor_ref: principal.actorRef,
        },
        payload: { file_id: fileId },
      }),
      redirect: "follow",
      signal: controller.signal,
    });
    const envelope = (await response.json()) as {
      ok?: boolean;
      data?: {
        file_name?: string;
        file_base64?: string;
        checksum?: string;
      };
      error?: { code?: string; message?: string };
    };
    if (
      !response.ok ||
      !envelope.ok ||
      !envelope.data?.file_name ||
      !envelope.data.file_base64 ||
      !envelope.data.checksum
    ) {
      throw new HwpxError(
        envelope.error?.code ?? "ARCHIVED_FILE_DOWNLOAD_FAILED",
        envelope.error?.message ?? "보관된 HWPX 파일을 불러오지 못했습니다.",
        502,
      );
    }
    const bytes = new Uint8Array(
      Buffer.from(envelope.data.file_base64, "base64"),
    );
    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > 5 * 1024 * 1024 ||
      bytes[0] !== 80 ||
      bytes[1] !== 75 ||
      sha256(bytes) !== envelope.data.checksum
    ) {
      throw new HwpxError(
        "INVALID_ARCHIVED_FILE",
        "보관된 HWPX 파일의 무결성을 확인하지 못했습니다.",
        502,
      );
    }
    return { fileName: envelope.data.file_name, bytes };
  } catch (error) {
    if (error instanceof HwpxError) throw error;
    throw new HwpxError(
      "ARCHIVED_FILE_UNAVAILABLE",
      "보관된 HWPX 파일 서비스에 연결할 수 없습니다.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSnapshot(
  principal: SessionPrincipal,
  requestId: string,
): Promise<HwpxSnapshot> {
  const endpoint = Netlify.env.get("APPS_SCRIPT_WEB_APP_URL");
  const serviceSecret = Netlify.env.get("APPS_SCRIPT_SERVICE_SECRET");
  if (!endpoint || !serviceSecret) {
    throw new HwpxError(
      "SERVER_NOT_CONFIGURED",
      "Google Sheets 연계 설정이 완료되지 않았습니다.",
      503,
    );
  }
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" ||
    !["script.google.com", "script.googleusercontent.com"].includes(
      url.hostname,
    )
  ) {
    throw new HwpxError(
      "SERVER_NOT_CONFIGURED",
      "Apps Script URL 설정이 올바르지 않습니다.",
      503,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_secret: serviceSecret,
        request_id: `hwpx-read-${requestId}`,
        action: "get_snapshot",
        actor: {
          role: principal.role,
          actor_ref: principal.actorRef,
        },
        payload: {},
      }),
      redirect: "follow",
      signal: controller.signal,
    });
    const envelope = (await response.json()) as {
      ok?: boolean;
      data?: HwpxSnapshot;
      error?: { code?: string; message?: string };
    };
    if (!response.ok || !envelope.ok || !envelope.data) {
      throw new HwpxError(
        envelope.error?.code ?? "UPSTREAM_ERROR",
        envelope.error?.message ?? "운영 데이터를 불러오지 못했습니다.",
        502,
      );
    }
    return envelope.data;
  } catch (error) {
    if (error instanceof HwpxError) throw error;
    throw new HwpxError(
      "UPSTREAM_UNAVAILABLE",
      "Google Sheets 저장 서비스에 연결할 수 없습니다.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function archiveGeneratedFile(
  input: {
    collectionId: string;
    documentType: HwpxDocumentType;
    fileName: string;
    generated: Uint8Array;
    checksum: string;
    sourceRevision: string;
    notes: string;
  },
  principal: SessionPrincipal,
  requestId: string,
): Promise<void> {
  const { endpoint, serviceSecret } = appsScriptConfiguration();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_secret: serviceSecret,
        request_id: `hwpx-generate-${requestId}`,
        action: "store_generated_file",
        actor: {
          role: principal.role,
          actor_ref: principal.actorRef,
        },
        payload: {
          collection_id: input.collectionId,
          document_type: input.documentType,
          file_name: input.fileName,
          file_base64: Buffer.from(input.generated).toString("base64"),
          checksum: input.checksum,
          source_revision: input.sourceRevision,
          notes: input.notes,
        },
      }),
      redirect: "follow",
      signal: controller.signal,
    });
    const envelope = (await response.json()) as {
      ok?: boolean;
      data?: { status?: string; duplicate?: boolean };
      error?: { code?: string; message?: string };
    };
    if (!response.ok || !envelope.ok || !envelope.data) {
      throw new HwpxError(
        envelope.error?.code ?? "DRIVE_ARCHIVE_FAILED",
        envelope.error?.message ?? "생성 파일을 Drive에 보관하지 못했습니다.",
        502,
      );
    }
    if (
      envelope.data.status !== "generated" &&
      envelope.data.duplicate !== true
    ) {
      throw new HwpxError(
        "DRIVE_ARCHIVE_INVALID_RESPONSE",
        "Drive 보관 결과를 확인할 수 없습니다.",
        502,
      );
    }
  } catch (error) {
    if (error instanceof HwpxError) throw error;
    throw new HwpxError(
      "DRIVE_ARCHIVE_UNAVAILABLE",
      "생성 파일 보관 서비스에 연결할 수 없습니다.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function appsScriptConfiguration(): {
  endpoint: string;
  serviceSecret: string;
} {
  const endpoint = Netlify.env.get("APPS_SCRIPT_WEB_APP_URL");
  const serviceSecret = Netlify.env.get("APPS_SCRIPT_SERVICE_SECRET");
  if (!endpoint || !serviceSecret) {
    throw new HwpxError(
      "SERVER_NOT_CONFIGURED",
      "Google Sheets 연계 설정이 완료되지 않았습니다.",
      503,
    );
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new HwpxError(
      "SERVER_NOT_CONFIGURED",
      "Apps Script URL 설정이 올바르지 않습니다.",
      503,
    );
  }
  if (
    url.protocol !== "https:" ||
    !["script.google.com", "script.googleusercontent.com"].includes(
      url.hostname,
    )
  ) {
    throw new HwpxError(
      "SERVER_NOT_CONFIGURED",
      "Apps Script URL 설정이 올바르지 않습니다.",
      503,
    );
  }
  return { endpoint, serviceSecret };
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function readTemplate(
  documentType: HwpxDocumentType,
): Promise<Uint8Array> {
  const fileName =
    documentType === "day10_city"
      ? "day10-city.hwpx"
      : documentType === "day20_city"
        ? "day20-city.hwpx"
        : "day20-foundation.hwpx";
  return readFile(new URL(`./_assets/${fileName}`, import.meta.url));
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const configuredOrigin = Netlify.env.get("APP_ORIGIN");
  const expectedOrigin = configuredOrigin || new URL(request.url).origin;
  if (!origin || origin !== expectedOrigin) {
    throw new HwpxError(
      "INVALID_ORIGIN",
      "허용되지 않은 요청 출처입니다.",
      403,
    );
  }
}

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

class HwpxError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
