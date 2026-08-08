import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

type CellValue = string | number | boolean | Date;

class FakeRange {
  constructor(
    private readonly sheet: FakeSheet,
    private readonly row: number,
    private readonly column: number,
    private readonly rowCount: number,
    private readonly columnCount: number,
  ) {}

  getValues(): CellValue[][] {
    return Array.from({ length: this.rowCount }, (_, rowOffset) =>
      Array.from({ length: this.columnCount }, (_, columnOffset) =>
        this.sheet.getCell(this.row + rowOffset, this.column + columnOffset),
      ),
    );
  }

  setValues(values: CellValue[][]): FakeRange {
    expect(values).toHaveLength(this.rowCount);
    values.forEach((row) => expect(row).toHaveLength(this.columnCount));
    values.forEach((row, rowOffset) => {
      row.forEach((value, columnOffset) => {
        this.sheet.setCell(
          this.row + rowOffset,
          this.column + columnOffset,
          value,
        );
      });
    });
    return this;
  }

  clearContent(): FakeRange {
    for (let rowOffset = 0; rowOffset < this.rowCount; rowOffset += 1) {
      for (
        let columnOffset = 0;
        columnOffset < this.columnCount;
        columnOffset += 1
      ) {
        this.sheet.setCell(
          this.row + rowOffset,
          this.column + columnOffset,
          "",
        );
      }
    }
    return this;
  }
}

class FakeSheet {
  private cells: CellValue[][];

  constructor(
    readonly name: string,
    headers: string[],
    rows: CellValue[][] = [],
  ) {
    this.cells = [
      [...headers],
      ...rows.map((row) => [
        ...row,
        ...Array(Math.max(0, headers.length - row.length)).fill(""),
      ]),
    ];
  }

  getDataRange(): FakeRange {
    return new FakeRange(
      this,
      1,
      1,
      Math.max(this.getLastRow(), 1),
      this.cells[0]?.length ?? 1,
    );
  }

  getRange(
    row: number,
    column: number,
    rowCount: number,
    columnCount: number,
  ): FakeRange {
    return new FakeRange(this, row, column, rowCount, columnCount);
  }

  getLastRow(): number {
    for (let index = this.cells.length - 1; index >= 0; index -= 1) {
      if (this.cells[index]?.some((value) => value !== "")) {
        return index + 1;
      }
    }
    return 1;
  }

  appendRow(row: CellValue[]): void {
    this.cells.push([...row]);
  }

  deleteRow(row: number): void {
    this.cells.splice(row - 1, 1);
  }

  getCell(row: number, column: number): CellValue {
    return this.cells[row - 1]?.[column - 1] ?? "";
  }

  setCell(row: number, column: number, value: CellValue): void {
    const width = this.cells[0]?.length ?? column;
    while (this.cells.length < row) {
      this.cells.push(Array(width).fill(""));
    }
    while ((this.cells[row - 1]?.length ?? 0) < column) {
      this.cells[row - 1]!.push("");
    }
    this.cells[row - 1]![column - 1] = value;
  }

  records(): Record<string, CellValue>[] {
    const headers = this.cells[0]!.map(String);
    return this.cells
      .slice(1, this.getLastRow())
      .map((row) =>
        Object.fromEntries(
          headers.map((header, index) => [header, row[index] ?? ""]),
        ),
      );
  }
}

class FakeSpreadsheet {
  constructor(private readonly sheets: Map<string, FakeSheet>) {}

  getSheetByName(name: string): FakeSheet | null {
    return this.sheets.get(name) ?? null;
  }

  sheet(name: string): FakeSheet {
    const sheet = this.sheets.get(name);
    if (!sheet) {
      throw new Error(`Missing fake sheet: ${name}`);
    }
    return sheet;
  }
}

interface FakeBlob {
  bytes: number[];
  contentType: string;
  name: string;
}

class FakeDriveFile {
  trashed = false;

  constructor(
    private readonly id: string,
    readonly blob: FakeBlob,
  ) {}

  getId(): string {
    return this.id;
  }

  getBlob() {
    return {
      getBytes: () => this.blob.bytes.slice(),
    };
  }

  setTrashed(trashed: boolean): void {
    this.trashed = trashed;
  }
}

class FakeFolder {
  readonly folders: FakeFolder[] = [];
  readonly files: FakeDriveFile[] = [];

  constructor(
    private readonly drive: FakeDriveApp,
    private readonly id: string,
    readonly name: string,
  ) {}

  getId(): string {
    return this.id;
  }

  getFoldersByName(name: string) {
    const matches = this.folders.filter((folder) => folder.name === name);
    let index = 0;
    return {
      hasNext: () => index < matches.length,
      next: () => matches[index++]!,
    };
  }

  createFolder(name: string): FakeFolder {
    const folder = this.drive.createFolder(name);
    this.folders.push(folder);
    return folder;
  }

  createFile(blob: FakeBlob): FakeDriveFile {
    const file = this.drive.createFile(blob);
    this.files.push(file);
    return file;
  }
}

class FakeDriveApp {
  private folderSequence = 0;
  private fileSequence = 0;
  private readonly folders = new Map<string, FakeFolder>();
  readonly files: FakeDriveFile[] = [];

  createFolder(name: string): FakeFolder {
    this.folderSequence += 1;
    const id = `drive-folder-${this.folderSequence}`;
    const folder = new FakeFolder(this, id, name);
    this.folders.set(id, folder);
    return folder;
  }

  getFolderById(id: string): FakeFolder {
    const folder = this.folders.get(id);
    if (!folder) throw new Error(`Missing folder: ${id}`);
    return folder;
  }

  getFileById(id: string): FakeDriveFile {
    const file = this.files.find((candidate) => candidate.getId() === id);
    if (!file || file.trashed) throw new Error(`Missing file: ${id}`);
    return file;
  }

  createFile(blob: FakeBlob): FakeDriveFile {
    this.fileSequence += 1;
    const file = new FakeDriveFile(`drive-file-${this.fileSequence}`, blob);
    this.files.push(file);
    return file;
  }
}

const codePath = path.resolve(import.meta.dirname, "Code.gs");
const source = fs.readFileSync(codePath, "utf8");
const context = vm.createContext({});
vm.runInContext(source, context, { filename: codePath });

const headers = context.SHEET_HEADERS as Record<string, string[]>;
const dispatchRequest = context.dispatchRequest_ as (
  request: unknown,
  services: unknown,
) => {
  data: Record<string, unknown>;
  meta: Record<string, unknown>;
};

function rowFor(
  sheetName: string,
  record: Record<string, CellValue>,
): CellValue[] {
  return headers[sheetName]!.map((header) => record[header] ?? "");
}

function createFixture(options?: {
  status?: string;
  collectionStatus?: string;
  deadlineAt?: string;
  now?: string;
  version?: number;
  withProgram?: boolean;
}) {
  const submissionId = "2026-08-day10-nowon-central";
  const sheets = new Map<string, FakeSheet>();
  Object.entries(headers).forEach(([name, sheetHeaders]) => {
    sheets.set(name, new FakeSheet(name, sheetHeaders));
  });

  sheets.set(
    "SETTINGS",
    new FakeSheet("SETTINGS", headers.SETTINGS!, [
      rowFor("SETTINGS", {
        setting_key: "schema_version",
        setting_value: "0.1.0",
        value_type: "string",
        storage_scope: "sheet",
      }),
      rowFor("SETTINGS", {
        setting_key: "drive_root_folder_id",
        setting_value: "",
        value_type: "string",
        storage_scope: "sheet",
      }),
    ]),
  );
  sheets.set(
    "LIBRARIES",
    new FakeSheet("LIBRARIES", headers.LIBRARIES!, [
      rowFor("LIBRARIES", {
        library_id: "nowon-central",
        official_name: "노원중앙도서관",
        abbreviation: "노중",
        output_order: 1,
        active: true,
      }),
    ]),
  );
  sheets.set(
    "COLLECTIONS",
    new FakeSheet("COLLECTIONS", headers.COLLECTIONS!, [
      rowFor("COLLECTIONS", {
        collection_id: "2026-08-day10",
        collection_type: "day10",
        target_month: "2026-08",
        title: "10일 수합",
        deadline_at: options?.deadlineAt ?? "2020-08-10T07:00:00.000Z",
        status: options?.collectionStatus ?? "open",
      }),
    ]),
  );
  sheets.set(
    "SUBMISSIONS",
    new FakeSheet("SUBMISSIONS", headers.SUBMISSIONS!, [
      rowFor("SUBMISSIONS", {
        submission_id: submissionId,
        collection_id: "2026-08-day10",
        library_id: "nowon-central",
        status: options?.status ?? "draft",
        version: options?.version ?? 1,
        program_count: options?.withProgram ? 1 : 0,
      }),
    ]),
  );
  if (options?.withProgram) {
    sheets.set(
      "PROGRAMS",
      new FakeSheet("PROGRAMS", headers.PROGRAMS!, [
        rowFor("PROGRAMS", {
          program_id: "program-existing",
          submission_id: submissionId,
          library_id: "nowon-central",
          program_type: "행사",
          title_original: "독서 프로그램",
          schedule_type: "single",
          schedule_original: "2026. 8. 12. 10:00",
          start_date: "2026-08-12",
          end_date: "2026-08-12",
          location: "어린이자료실",
          audience: "초등학생",
          capacity: 20,
          manager_name: "김담당",
          description_original: "독후활동",
          validation_status: "valid",
        }),
      ]),
    );
  }

  const spreadsheet = new FakeSpreadsheet(sheets);
  const driveApp = new FakeDriveApp();
  const cacheValues = new Map<string, string>();
  const stats = { spreadsheetOpens: 0, cacheRemoves: 0 };
  let uuid = 0;
  const services = {
    properties: {
      getProperty(key: string) {
        if (key === "SERVICE_SECRET") return "test-service-secret";
        if (key === "SPREADSHEET_ID") return "test-spreadsheet";
        return null;
      },
    },
    spreadsheetApp: {
      openById() {
        stats.spreadsheetOpens += 1;
        return spreadsheet;
      },
    },
    lockService: {
      getScriptLock() {
        return {
          tryLock: () => true,
          releaseLock: () => undefined,
        };
      },
    },
    utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      getUuid() {
        uuid += 1;
        return `uuid-${uuid}`;
      },
      base64Decode(value: string) {
        return [...Buffer.from(value, "base64")];
      },
      base64Encode(bytes: number[]) {
        return Buffer.from(bytes).toString("base64");
      },
      computeDigest(_algorithm: string, bytes: number[]) {
        return [...createHash("sha256").update(Buffer.from(bytes)).digest()]
          .map((value) => (value > 127 ? value - 256 : value));
      },
      newBlob(bytes: number[], contentType: string, name: string): FakeBlob {
        return { bytes: [...bytes], contentType, name };
      },
    },
    driveApp,
    cache: {
      get(key: string) {
        return cacheValues.get(key) ?? null;
      },
      put(key: string, value: string) {
        cacheValues.set(key, value);
      },
      remove(key: string) {
        stats.cacheRemoves += 1;
        cacheValues.delete(key);
      },
    },
    logger: { warn: () => undefined },
    now: () => options?.now ?? "2026-08-11T00:00:00.000Z",
  };

  return { services, spreadsheet, submissionId, driveApp, stats };
}

function request(
  action: string,
  payload: Record<string, unknown>,
  overrides?: Record<string, unknown>,
) {
  return {
    service_secret: "test-service-secret",
    request_id: `request-${action}-001`,
    action,
    actor: {
      role: "submitter",
      actor_ref: "account-nowon-central",
      library_id: "nowon-central",
    },
    payload,
    ...overrides,
  };
}

function validProgram() {
  return {
    program_id: "program-new",
    program_type: "행사",
    title_original: "책과 함께 크는 아이들",
    schedule_type: "single",
    schedule_original: "2026. 8. 12.(수) 10:00~12:00",
    start_date: "2026-08-12",
    end_date: "2026-08-12",
    location: "어린이자료실",
    audience: "초등 1~3학년",
    capacity: 20,
    manager_name: "김담당",
    description_original: "그림책 독후활동",
  };
}

describe("Apps Script submission API", () => {
  it("returns only the submitter's own submission snapshot", () => {
    const fixture = createFixture({ withProgram: true });
    const input = request("get_snapshot", {});

    const result = dispatchRequest(input, fixture.services);

    expect(result.data.submissions).toHaveLength(1);
    expect(result.data.programs).toHaveLength(1);
    expect(result.data).toMatchObject({ schema_version: "0.1.0" });
    expect(fixture.spreadsheet.sheet("AUDIT_LOG").records()).toHaveLength(0);
  });

  it("serves repeated snapshots from cache without taking the write path", () => {
    const fixture = createFixture({ withProgram: true });
    const input = request(
      "get_snapshot",
      {},
      { actor: { role: "admin", actor_ref: "account-admin" } },
    );

    const first = dispatchRequest(input, fixture.services);
    const second = dispatchRequest(
      { ...input, request_id: "request-get_snapshot-002" },
      fixture.services,
    );

    expect(first.meta).toMatchObject({ cache_hit: false });
    expect(second.meta).toMatchObject({ cache_hit: true });
    expect(fixture.stats.spreadsheetOpens).toBe(1);
  });

  it("normalizes a Sheets month date and hides duplicate collection rows", () => {
    const fixture = createFixture();
    const collection = fixture.spreadsheet.sheet("COLLECTIONS");
    const submission = fixture.spreadsheet.sheet("SUBMISSIONS");
    collection.setCell(
      2,
      headers.COLLECTIONS!.indexOf("target_month") + 1,
      "2026-07-31T15:00:00.000Z",
    );
    collection.appendRow(
      rowFor("COLLECTIONS", {
        collection_id: "2026-08-day10",
        collection_type: "day10",
        target_month: "2026-07-31T15:00:00.000Z",
      }),
    );
    submission.appendRow(
      rowFor("SUBMISSIONS", {
        submission_id: fixture.submissionId,
        collection_id: "2026-08-day10",
        library_id: "nowon-central",
        status: "draft",
        version: 1,
      }),
    );

    const result = dispatchRequest(
      request(
        "get_snapshot",
        {},
        { actor: { role: "admin", actor_ref: "account-admin" } },
      ),
      fixture.services,
    );

    expect(result.data.collections).toHaveLength(1);
    expect(result.data.submissions).toHaveLength(1);
    expect(result.data.collections[0]).toMatchObject({
      target_month: "2026-08",
    });
  });

  it("normalizes Sheets program dates and times for the snapshot", () => {
    const fixture = createFixture({ withProgram: true });
    const programs = fixture.spreadsheet.sheet("PROGRAMS");
    programs.setCell(
      2,
      headers.PROGRAMS!.indexOf("start_date") + 1,
      new Date("2026-07-31T15:00:00.000Z"),
    );
    programs.setCell(
      2,
      headers.PROGRAMS!.indexOf("start_time") + 1,
      new Date("1899-12-30T01:32:08.000Z"),
    );
    programs.setCell(
      2,
      headers.PROGRAMS!.indexOf("end_date") + 1,
      new Date("2026-07-31T15:00:00.000Z"),
    );
    programs.setCell(
      2,
      headers.PROGRAMS!.indexOf("end_time") + 1,
      new Date("1899-12-30T03:00:00.000Z"),
    );

    const result = dispatchRequest(request("get_snapshot", {}), fixture.services);

    expect(result.data.programs[0]).toMatchObject({
      start_date: "2026-08-01",
      start_time: "10:32",
      end_date: "2026-08-01",
      end_time: "12:00",
    });
  });

  it("invalidates the snapshot cache after a successful mutation", () => {
    const fixture = createFixture();
    dispatchRequest(
      request(
        "get_snapshot",
        {},
        { actor: { role: "admin", actor_ref: "account-admin" } },
      ),
      fixture.services,
    );

    dispatchRequest(
      request("save_submission", {
        submission_id: fixture.submissionId,
        expected_version: 1,
        programs: [validProgram()],
      }),
      fixture.services,
    );
    dispatchRequest(
      request(
        "get_snapshot",
        {},
        {
          request_id: "request-get_snapshot-after-save",
          actor: { role: "admin", actor_ref: "account-admin" },
        },
      ),
      fixture.services,
    );

    expect(fixture.stats.cacheRemoves).toBe(1);
    expect(fixture.stats.spreadsheetOpens).toBe(3);
  });

  it("saves a draft, replaces programs, increments the version, and audits", () => {
    const fixture = createFixture();
    const input = request("save_submission", {
      submission_id: fixture.submissionId,
      expected_version: 1,
      programs: [validProgram()],
    });

    const result = dispatchRequest(input, fixture.services);

    expect(result.data).toMatchObject({
      submission_id: fixture.submissionId,
      status: "draft",
      version: 2,
      program_count: 1,
    });
    expect(fixture.spreadsheet.sheet("PROGRAMS").records()).toHaveLength(1);
    expect(
      fixture.spreadsheet.sheet("SUBMISSIONS").records()[0],
    ).toMatchObject({
      version: 2,
      program_count: 1,
      last_request_id: "request-save_submission-001",
    });
    expect(fixture.spreadsheet.sheet("AUDIT_LOG").records()[0]).toMatchObject({
      request_id: "request-save_submission-001",
      action: "save_submission",
    });
  });

  it("deletes a saved program when the replacement list omits it", () => {
    const fixture = createFixture({ withProgram: true });

    dispatchRequest(
      request("save_submission", {
        submission_id: fixture.submissionId,
        expected_version: 1,
        programs: [],
      }),
      fixture.services,
    );

    expect(fixture.spreadsheet.sheet("PROGRAMS").records()).toHaveLength(0);
    expect(
      fixture.spreadsheet.sheet("SUBMISSIONS").records()[0],
    ).toMatchObject({ version: 2, program_count: 0 });
  });

  it("derives a required schedule string from structured dates and times", () => {
    const fixture = createFixture();
    const program = validProgram();
    delete program.schedule_original;
    Object.assign(program, {
      start_time: "10:00",
      end_time: "12:00",
    });

    dispatchRequest(
      request("save_submission", {
        submission_id: fixture.submissionId,
        expected_version: 1,
        programs: [program],
      }),
      fixture.services,
    );

    expect(
      fixture.spreadsheet.sheet("PROGRAMS").records()[0],
    ).toMatchObject({
      schedule_original: "2026. 8. 12.(수) 10:00~12:00",
      validation_status: "valid",
    });
  });

  it("returns the prior result marker for a duplicate request id", () => {
    const fixture = createFixture();
    const input = request("save_submission", {
      submission_id: fixture.submissionId,
      expected_version: 1,
      programs: [validProgram()],
    });

    dispatchRequest(input, fixture.services);
    const duplicate = dispatchRequest(input, fixture.services);

    expect(duplicate.data).toMatchObject({
      duplicate: true,
      request_id: "request-save_submission-001",
      entity_id: fixture.submissionId,
    });
    expect(
      fixture.spreadsheet.sheet("SUBMISSIONS").records()[0]?.version,
    ).toBe(2);
    expect(fixture.spreadsheet.sheet("AUDIT_LOG").records()).toHaveLength(1);
  });

  it.each(["submitted", "resubmitted"])(
    "lets submitters update %s submissions before the deadline",
    (status) => {
      const fixture = createFixture({
        status,
        deadlineAt: "2026-08-12T07:00:00.000Z",
      });
      const input = request("save_submission", {
        submission_id: fixture.submissionId,
        expected_version: 1,
        programs: [validProgram()],
      });

      const result = dispatchRequest(input, fixture.services);

      expect(result.data).toMatchObject({ status, version: 2, program_count: 1 });
      expect(
        fixture.spreadsheet.sheet("AUDIT_LOG").records()[0],
      ).toMatchObject({ action: "save_submission" });
    },
  );

  it("lets submitters delete the last submitted program before the deadline", () => {
    const fixture = createFixture({
      status: "submitted",
      withProgram: true,
      deadlineAt: "2026-08-12T07:00:00.000Z",
    });

    const result = dispatchRequest(
      request("save_submission", {
        submission_id: fixture.submissionId,
        expected_version: 1,
        programs: [],
      }),
      fixture.services,
    );

    expect(result.data).toMatchObject({ version: 2, program_count: 0 });
    expect(fixture.spreadsheet.sheet("PROGRAMS").records()).toHaveLength(0);
  });

  it.each(["submitted", "resubmitted"])(
    "locks %s submission updates after the deadline",
    (status) => {
      const fixture = createFixture({ status });
      expect(() =>
        dispatchRequest(
          request("save_submission", {
            submission_id: fixture.submissionId,
            expected_version: 1,
            programs: [validProgram()],
          }),
          fixture.services,
        ),
      ).toThrowError("제출 마감 후에는 관리자 수정 요청이 있어야");
    },
  );

  it.each(["late", "reviewed"])(
    "keeps %s submissions locked for submitters",
    (status) => {
      const fixture = createFixture({ status });
      expect(() =>
        dispatchRequest(
          request("save_submission", {
            submission_id: fixture.submissionId,
            expected_version: 1,
            programs: [validProgram()],
          }),
          fixture.services,
        ),
      ).toThrowError("현재 자료는 수정할 수 없습니다");
    },
  );

  it("validates required fields when updating a completed submission", () => {
    const fixture = createFixture({
      status: "submitted",
      deadlineAt: "2026-08-12T07:00:00.000Z",
    });

    expect(() =>
      dispatchRequest(
        request("save_submission", {
          submission_id: fixture.submissionId,
          expected_version: 1,
          programs: [{ ...validProgram(), manager_name: "" }],
        }),
        fixture.services,
      ),
    ).toThrowError("필수값 또는 일정 오류를 확인해주세요");
  });

  it("validates the title prefix and audience count", () => {
    const fixture = createFixture({
      status: "submitted",
      deadlineAt: "2026-08-12T07:00:00.000Z",
    });

    expect(() =>
      dispatchRequest(
        request("save_submission", {
          submission_id: fixture.submissionId,
          expected_version: 1,
          programs: [{ ...validProgram(), program_type: "기타", capacity: 0 }],
        }),
        fixture.services,
      ),
    ).toThrowError("필수값 또는 일정 오류를 확인해주세요");
  });

  it("appends one new program without changing the existing submitted program", () => {
    const fixture = createFixture({
      status: "submitted",
      withProgram: true,
      deadlineAt: "2026-08-12T07:00:00.000Z",
    });

    const result = dispatchRequest(
      request("append_program", {
        submission_id: fixture.submissionId,
        expected_version: 1,
        program: validProgram(),
      }),
      fixture.services,
    );

    expect(result.data).toMatchObject({
      status: "submitted",
      version: 2,
      program_count: 2,
      program_id: "program-new",
    });
    expect(fixture.spreadsheet.sheet("PROGRAMS").records()).toMatchObject([
      {
        program_id: "program-existing",
        title_original: "독서 프로그램",
      },
      {
        program_id: "program-new",
        title_original: "책과 함께 크는 아이들",
      },
    ]);
    expect(
      fixture.spreadsheet.sheet("AUDIT_LOG").records()[0],
    ).toMatchObject({ action: "append_program" });
  });

  it("blocks new program appends after review is complete", () => {
    const fixture = createFixture({ status: "reviewed", withProgram: true });

    expect(() =>
      dispatchRequest(
        request("append_program", {
          submission_id: fixture.submissionId,
          expected_version: 1,
          program: validProgram(),
        }),
        fixture.services,
      ),
    ).toThrowError(
      "관리자에 의해 검토가 완료된 자료는 신규 프로그램을 별도 추가할 수 없습니다",
    );
    expect(fixture.spreadsheet.sheet("PROGRAMS").records()).toHaveLength(1);
  });

  it("rejects an append request that reuses an existing program id", () => {
    const fixture = createFixture({
      status: "submitted",
      withProgram: true,
      deadlineAt: "2026-08-12T07:00:00.000Z",
    });

    expect(() =>
      dispatchRequest(
        request("append_program", {
          submission_id: fixture.submissionId,
          expected_version: 1,
          program: { ...validProgram(), program_id: "program-existing" },
        }),
        fixture.services,
      ),
    ).toThrowError("기존 프로그램은 변경할 수 없습니다");
    expect(fixture.spreadsheet.sheet("PROGRAMS").records()).toHaveLength(1);
  });

  it("blocks legacy new-program appends after the deadline", () => {
    const fixture = createFixture({ status: "submitted", withProgram: true });

    expect(() =>
      dispatchRequest(
        request("append_program", {
          submission_id: fixture.submissionId,
          expected_version: 1,
          program: validProgram(),
        }),
        fixture.services,
      ),
    ).toThrowError("제출 마감 후에는 관리자 수정 요청이 있어야");
    expect(fixture.spreadsheet.sheet("PROGRAMS").records()).toHaveLength(1);
  });

  it("blocks new program appends while the collection is closed", () => {
    const fixture = createFixture({
      status: "submitted",
      withProgram: true,
      collectionStatus: "closed",
    });

    expect(() =>
      dispatchRequest(
        request("append_program", {
          submission_id: fixture.submissionId,
          expected_version: 1,
          program: validProgram(),
        }),
        fixture.services,
      ),
    ).toThrowError("현재 수합이 열려 있지 않아 저장하거나 제출할 수 없습니다");
    expect(fixture.spreadsheet.sheet("PROGRAMS").records()).toHaveLength(1);
  });

  it("lets an administrator permanently delete one program", () => {
    const fixture = createFixture({ status: "reviewed", withProgram: true });

    const result = dispatchRequest(
      request(
        "delete_program",
        {
          submission_id: fixture.submissionId,
          program_id: "program-existing",
          expected_version: 1,
        },
        {
          actor: { role: "admin", actor_ref: "account-admin" },
        },
      ),
      fixture.services,
    );

    expect(result.data).toMatchObject({
      deleted: true,
      status: "reviewed",
      version: 2,
      program_count: 0,
    });
    expect(fixture.spreadsheet.sheet("PROGRAMS").records()).toHaveLength(0);
    expect(
      fixture.spreadsheet.sheet("SUBMISSIONS").records()[0],
    ).toMatchObject({ version: 2, program_count: 0 });
    expect(
      fixture.spreadsheet.sheet("AUDIT_LOG").records()[0],
    ).toMatchObject({ action: "delete_program", actor_role: "admin" });
  });

  it("rejects permanent program deletion from a submitter", () => {
    const fixture = createFixture({ status: "submitted", withProgram: true });

    expect(() =>
      dispatchRequest(
        request("delete_program", {
          submission_id: fixture.submissionId,
          program_id: "program-existing",
          expected_version: 1,
        }),
        fixture.services,
      ),
    ).toThrowError("관리자만 프로그램을 삭제할 수 있습니다");
    expect(fixture.spreadsheet.sheet("PROGRAMS").records()).toHaveLength(1);
  });

  it("lets an administrator close an open collection and audits the change", () => {
    const fixture = createFixture();
    const input = request(
      "set_collection_status",
      {
        collection_id: "2026-08-day10",
        status: "closed",
      },
      {
        actor: {
          role: "admin",
          actor_ref: "account-admin",
        },
      },
    );

    const result = dispatchRequest(input, fixture.services);

    expect(result.data).toMatchObject({
      collection_id: "2026-08-day10",
      previous_status: "open",
      status: "closed",
    });
    expect(
      fixture.spreadsheet.sheet("COLLECTIONS").records()[0],
    ).toMatchObject({
      status: "closed",
      updated_at: "2026-08-11T00:00:00.000Z",
    });
    expect(
      fixture.spreadsheet.sheet("AUDIT_LOG").records()[0],
    ).toMatchObject({
      actor_role: "admin",
      action: "set_collection_status",
      entity_type: "collection",
      entity_id: "2026-08-day10",
    });
  });

  it("prepares one unified round and library submissions for a new month", () => {
    const fixture = createFixture();
    const input = request(
      "create_collection_month",
      { target_month: "2026-09" },
      { actor: { role: "admin", actor_ref: "account-admin" } },
    );

    const result = dispatchRequest(input, fixture.services);

    expect(result.data).toMatchObject({
      target_month: "2026-09",
      collection_ids: ["2026-09-monthly"],
      submission_count: 1,
      status: "planned",
    });
    expect(
      fixture.spreadsheet
        .sheet("COLLECTIONS")
        .records()
        .filter((row) => row.target_month === "2026-09"),
    ).toHaveLength(1);
    expect(
      fixture.spreadsheet
        .sheet("COLLECTIONS")
        .records()
        .find((row) => row.target_month === "2026-09"),
    ).toMatchObject({
      collection_id: "2026-09-monthly",
      collection_type: "monthly",
      deadline_at: "2026-09-10T07:00:00.000Z",
    });
    expect(
      fixture.spreadsheet
        .sheet("SUBMISSIONS")
        .records()
        .filter((row) => String(row.collection_id).startsWith("2026-09")),
    ).toHaveLength(1);
    expect(
      fixture.spreadsheet.sheet("AUDIT_LOG").records()[0],
    ).toMatchObject({
      action: "create_collection_month",
      entity_id: "2026-09",
    });
  });

  it("allows a unified round beside a legacy round stored as a date value", () => {
    const fixture = createFixture();
    fixture.spreadsheet.sheet("COLLECTIONS").setCell(
      2,
      headers.COLLECTIONS!.indexOf("target_month") + 1,
      "2026-07-31T15:00:00.000Z",
    );

    const result = dispatchRequest(
      request(
        "create_collection_month",
        { target_month: "2026-08" },
        { actor: { role: "admin", actor_ref: "account-admin" } },
      ),
      fixture.services,
    );

    expect(result.data).toMatchObject({
      collection_ids: ["2026-08-monthly"],
    });
  });

  it("rejects a month that already has a unified round", () => {
    const fixture = createFixture();
    fixture.spreadsheet.sheet("COLLECTIONS").appendRow(
      rowFor("COLLECTIONS", {
        collection_id: "2026-08-monthly",
        target_month: "2026-08",
        collection_type: "monthly",
        status: "planned",
        deadline_at: "2026-08-10T07:00:00.000Z",
      }),
    );

    expect(() =>
      dispatchRequest(
        request(
          "create_collection_month",
          { target_month: "2026-08" },
          { actor: { role: "admin", actor_ref: "account-admin" } },
        ),
        fixture.services,
      ),
    ).toThrowError("이미 준비된 대상 월입니다");
  });

  it("rejects a submitter collection status change", () => {
    const fixture = createFixture();
    const input = request("set_collection_status", {
      collection_id: "2026-08-day10",
      status: "closed",
    });

    expect(() => dispatchRequest(input, fixture.services)).toThrowError(
      "관리자만 수합 상태를 변경할 수 있습니다",
    );
  });

  it("blocks submitter saves while the collection is closed", () => {
    const fixture = createFixture({ collectionStatus: "closed" });
    const input = request("save_submission", {
      submission_id: fixture.submissionId,
      expected_version: 1,
      programs: [validProgram()],
    });

    try {
      dispatchRequest(input, fixture.services);
      throw new Error("Expected COLLECTION_NOT_OPEN");
    } catch (error) {
      expect((error as { apiCode: string }).apiCode).toBe(
        "COLLECTION_NOT_OPEN",
      );
    }
    expect(fixture.spreadsheet.sheet("PROGRAMS").records()).toHaveLength(0);
    expect(fixture.spreadsheet.sheet("AUDIT_LOG").records()).toHaveLength(0);
  });

  it("blocks submitter submission while the collection is closed", () => {
    const fixture = createFixture({
      collectionStatus: "closed",
      withProgram: true,
    });
    const input = request("submit_submission", {
      submission_id: fixture.submissionId,
      expected_version: 1,
    });

    try {
      dispatchRequest(input, fixture.services);
      throw new Error("Expected COLLECTION_NOT_OPEN");
    } catch (error) {
      expect((error as { apiCode: string }).apiCode).toBe(
        "COLLECTION_NOT_OPEN",
      );
    }
    expect(
      fixture.spreadsheet.sheet("SUBMISSIONS").records()[0],
    ).toMatchObject({
      status: "draft",
      version: 1,
    });
  });

  it("allows an administrator to edit and reorder a locked submission", () => {
    const fixture = createFixture({ status: "reviewed", withProgram: true });
    const input = request(
      "save_submission",
      {
        submission_id: fixture.submissionId,
        expected_version: 1,
        programs: [
          {
            ...validProgram(),
            title_original: "관리자 수정 행사명",
            include_day10: false,
            include_city: true,
            include_foundation: false,
            output_order_day10: 3,
            output_order_city: 2,
            output_order_foundation: 1,
          },
        ],
      },
      {
        actor: {
          role: "admin",
          actor_ref: "account-admin",
        },
      },
    );

    const result = dispatchRequest(input, fixture.services);

    expect(result.data).toMatchObject({
      status: "reviewed",
      version: 2,
      program_count: 1,
    });
    expect(
      fixture.spreadsheet.sheet("PROGRAMS").records()[0],
    ).toMatchObject({
      title_original: "관리자 수정 행사명",
      include_day10: false,
      include_city: true,
      include_foundation: false,
      output_order_day10: 3,
      output_order_city: 2,
      output_order_foundation: 1,
    });
    expect(
      fixture.spreadsheet.sheet("AUDIT_LOG").records()[0],
    ).toMatchObject({
      actor_role: "admin",
      action: "save_submission",
    });
  });

  it("marks a post-deadline submission as late and locks it", () => {
    const fixture = createFixture({ withProgram: true });
    const input = request("submit_submission", {
      submission_id: fixture.submissionId,
      expected_version: 1,
    });

    const result = dispatchRequest(input, fixture.services);

    expect(result.data).toMatchObject({
      status: "late",
      version: 2,
      locked: true,
    });
    expect(
      fixture.spreadsheet.sheet("SUBMISSIONS").records()[0],
    ).toMatchObject({
      status: "late",
      version: 2,
      locked_at: "2026-08-11T00:00:00.000Z",
    });
  });

  it("allows an admin revision request and unlocks the submission", () => {
    const fixture = createFixture({ status: "submitted" });
    const input = request(
      "request_revision",
      {
        submission_id: fixture.submissionId,
        expected_version: 1,
        message: "대상 연령을 확인해주세요.",
      },
      {
        actor: {
          role: "admin",
          actor_ref: "account-admin",
        },
      },
    );

    const result = dispatchRequest(input, fixture.services);

    expect(result.data).toMatchObject({
      status: "revision_requested",
      version: 2,
      locked: false,
    });
    expect(
      fixture.spreadsheet.sheet("REVISION_REQUESTS").records()[0],
    ).toMatchObject({
      submission_id: fixture.submissionId,
      status: "open",
      message: "대상 연령을 확인해주세요.",
    });
  });

  it.each(["submitted", "late", "resubmitted"])(
    "allows an admin to complete review for %s",
    (status) => {
      const fixture = createFixture({ status });
      const input = request(
        "complete_review",
        {
          submission_id: fixture.submissionId,
          expected_version: 1,
        },
        {
          actor: {
            role: "admin",
            actor_ref: "account-admin",
          },
        },
      );

      const result = dispatchRequest(input, fixture.services);

      expect(result.data).toMatchObject({
        status: "reviewed",
        version: 2,
        locked: true,
      });
      expect(
        fixture.spreadsheet.sheet("SUBMISSIONS").records()[0],
      ).toMatchObject({
        status: "reviewed",
        version: 2,
        reviewed_at: "2026-08-11T00:00:00.000Z",
        last_request_id: "request-complete_review-001",
      });
      expect(
        fixture.spreadsheet.sheet("AUDIT_LOG").records()[0],
      ).toMatchObject({
        action: "complete_review",
        actor_role: "admin",
      });
    },
  );

  it("rejects review completion from a submitter", () => {
    const fixture = createFixture({ status: "submitted" });
    const input = request("complete_review", {
      submission_id: fixture.submissionId,
      expected_version: 1,
    });

    try {
      dispatchRequest(input, fixture.services);
      throw new Error("Expected FORBIDDEN");
    } catch (error) {
      expect((error as { apiCode: string }).apiCode).toBe("FORBIDDEN");
    }
  });

  it("rejects review completion from a draft", () => {
    const fixture = createFixture({ status: "draft" });
    const input = request(
      "complete_review",
      {
        submission_id: fixture.submissionId,
        expected_version: 1,
      },
      {
        actor: {
          role: "admin",
          actor_ref: "account-admin",
        },
      },
    );

    try {
      dispatchRequest(input, fixture.services);
      throw new Error("Expected INVALID_STATUS_TRANSITION");
    } catch (error) {
      expect((error as { apiCode: string }).apiCode).toBe(
        "INVALID_STATUS_TRANSITION",
      );
    }
  });

  it("rejects stale optimistic-concurrency versions", () => {
    const fixture = createFixture({ version: 3 });
    const input = request("save_submission", {
      submission_id: fixture.submissionId,
      expected_version: 2,
      programs: [validProgram()],
    });

    try {
      dispatchRequest(input, fixture.services);
      throw new Error("Expected VERSION_CONFLICT");
    } catch (error) {
      expect((error as { apiCode: string }).apiCode).toBe("VERSION_CONFLICT");
    }
  });

  it("stores a generated HWPX in Drive and records one idempotent audit", () => {
    const fixture = createFixture();
    const bytes = Buffer.from([80, 75, 3, 4, 20, 26]);
    const checksum =
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const input = request(
      "store_generated_file",
      {
        collection_id: "2026-08-day10",
        document_type: "day10_city",
        file_name: "2026-08_10일_주요업무현황보고.hwpx",
        file_base64: bytes.toString("base64"),
        checksum,
        source_revision: `sha256:${"a".repeat(64)}`,
        notes: "program_count=0",
      },
      {
        actor: {
          role: "admin",
          actor_ref: "account-admin",
        },
      },
    );

    const result = dispatchRequest(input, fixture.services);
    const duplicate = dispatchRequest(input, fixture.services);

    expect(result.data).toMatchObject({
      file_id: "file_uuid-1",
      drive_file_id: "drive-file-1",
      status: "generated",
      version: 1,
      checksum,
    });
    expect(duplicate.data).toMatchObject({
      duplicate: true,
      entity_id: "file_uuid-1",
    });
    expect(fixture.driveApp.files).toHaveLength(1);
    expect(
      fixture.spreadsheet.sheet("GENERATED_FILES").records()[0],
    ).toMatchObject({
      collection_id: "2026-08-day10",
      document_type: "day10_city",
      status: "generated",
      version: 1,
      drive_file_id: "drive-file-1",
      request_id: "request-store_generated_file-001",
      checksum,
    });
    expect(fixture.spreadsheet.sheet("AUDIT_LOG").records()).toHaveLength(1);
    expect(fixture.spreadsheet.sheet("AUDIT_LOG").records()[0]).toMatchObject({
      action: "store_generated_file",
      entity_type: "generated_file",
      entity_id: "file_uuid-1",
    });
    expect(
      fixture.spreadsheet
        .sheet("SETTINGS")
        .records()
        .find((row) => row.setting_key === "drive_root_folder_id"),
    ).toMatchObject({
      setting_value: "drive-folder-1",
    });
  });

  it("rejects a generated file whose checksum does not match", () => {
    const fixture = createFixture();
    const bytes = Buffer.from([80, 75, 3, 4]);
    const input = request(
      "store_generated_file",
      {
        collection_id: "2026-08-day10",
        document_type: "day10_city",
        file_name: "invalid.hwpx",
        file_base64: bytes.toString("base64"),
        checksum: `sha256:${"0".repeat(64)}`,
        source_revision: `sha256:${"a".repeat(64)}`,
      },
      {
        actor: {
          role: "admin",
          actor_ref: "account-admin",
        },
      },
    );

    expect(() => dispatchRequest(input, fixture.services)).toThrowError(
      "체크섬이 일치하지 않습니다",
    );
    expect(fixture.driveApp.files).toHaveLength(0);
    expect(fixture.spreadsheet.sheet("GENERATED_FILES").records()).toHaveLength(
      0,
    );
    expect(fixture.spreadsheet.sheet("AUDIT_LOG").records()).toHaveLength(0);
  });

  it("returns a verified archived HWPX to an administrator", () => {
    const fixture = createFixture();
    const bytes = Buffer.from([80, 75, 3, 4, 20, 26]);
    const checksum =
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    dispatchRequest(
      request(
        "store_generated_file",
        {
          collection_id: "2026-08-day10",
          document_type: "day10_city",
          file_name: "2026-08_10일_주요업무현황보고.hwpx",
          file_base64: bytes.toString("base64"),
          checksum,
          source_revision: `sha256:${"a".repeat(64)}`,
        },
        { actor: { role: "admin", actor_ref: "account-admin" } },
      ),
      fixture.services,
    );

    const result = dispatchRequest(
      request(
        "get_generated_file",
        { file_id: "file_uuid-1" },
        {
          request_id: "request-download-file-001",
          actor: { role: "admin", actor_ref: "account-admin" },
        },
      ),
      fixture.services,
    );

    expect(result.data).toMatchObject({
      file_id: "file_uuid-1",
      file_name: "2026-08_10일_주요업무현황보고.hwpx",
      file_base64: bytes.toString("base64"),
      checksum,
      version: 1,
      document_type: "day10_city",
    });
    expect(fixture.spreadsheet.sheet("AUDIT_LOG").records()).toHaveLength(1);
  });

  it("rejects generated-file downloads from submitter accounts", () => {
    const fixture = createFixture();
    expect(() =>
      dispatchRequest(
        request("get_generated_file", { file_id: "file_unknown" }),
        fixture.services,
      ),
    ).toThrowError("관리자만");
  });
});
