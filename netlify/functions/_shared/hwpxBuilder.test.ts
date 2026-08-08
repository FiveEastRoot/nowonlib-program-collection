import { readFile } from "node:fs/promises";
import { HwpxReader } from "@ssabrojs/hwpxjs";
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  buildHwpx,
  documentFileName,
  documentTitle,
  type HwpxDocumentModel,
} from "./hwpxBuilder";
import { selectHwpxModel } from "./hwpxSelection";

const decoder = new TextDecoder();

describe("HWPX generation", () => {
  it("selects reviewed and included programs in output order", () => {
    const model = selectHwpxModel(
      {
        collections: [
          {
            collection_id: "2026-08-monthly",
            collection_type: "monthly",
            target_month: "2026-08",
          },
        ],
        libraries: [
          {
            library_id: "nowon-central",
            official_name: "노원중앙도서관",
            abbreviation: "노중",
            output_order: 1,
          },
        ],
        submissions: [
          {
            submission_id: "submission-1",
            collection_id: "2026-08-monthly",
            library_id: "nowon-central",
            status: "reviewed",
          },
        ],
        programs: [
          {
            program_id: "program-2",
            submission_id: "submission-1",
            library_id: "nowon-central",
            title_original: "두 번째 행사",
            title_output_city: "구청용 두 번째 행사",
            include_city: true,
            output_order_city: 2,
            manager_name: "두담당",
          },
          {
            program_id: "program-1",
            submission_id: "submission-1",
            library_id: "nowon-central",
            title_original: "첫 번째 행사",
            title_output_city: "구청용 첫 번째 행사",
            include_city: true,
            output_order_city: 1,
            manager_name: "첫담당",
          },
          {
            program_id: "excluded",
            submission_id: "submission-1",
            library_id: "nowon-central",
            title_original: "제외 행사",
            include_city: false,
            output_order_city: 0,
          },
        ],
      },
      {
        collectionId: "2026-08-monthly",
        documentType: "day20_city",
        reviewedOnly: true,
        excludeWarnings: false,
      },
    );

    expect(model.programs.map((program) => program.title)).toEqual([
      "구청용 첫 번째 행사",
      "구청용 두 번째 행사",
    ]);
    expect(model.programs.map((program) => program.managerName)).toEqual([
      "첫담당",
      "두담당",
    ]);
  });

  it("uses the unified round for the former 10-day document", () => {
    const model = selectHwpxModel(
      {
        collections: [
          {
            collection_id: "2026-08-monthly",
            collection_type: "monthly",
            target_month: "2026-08",
          },
        ],
        libraries: [],
        submissions: [],
        programs: [],
      },
      {
        collectionId: "2026-08-monthly",
        documentType: "day10_city",
        reviewedOnly: true,
        excludeWarnings: false,
      },
    );

    expect(model.documentType).toBe("day10_city");
  });

  it("creates a valid image-free HWPX package with escaped text", async () => {
    const template = await readFile(
      new URL("../_assets/day10-city.hwpx", import.meta.url),
    );
    const model: HwpxDocumentModel = {
      documentType: "day10_city",
      targetMonth: "2026-08",
      reviewedOnly: false,
      excludedWarnings: false,
      programs: [
        {
          libraryName: "노원중앙도서관",
          libraryAbbreviation: "노중",
          title: "책 & 문화 <특강>",
          schedule: "2026-08-12 10:00~12:00",
          location: "다목적실",
          audience: "성인",
          capacity: 20,
          description: "검토용 설명",
          managerName: "담당자",
        },
      ],
    };

    const output = buildHwpx(template, model);
    const files = unzipSync(output);
    const section = decoder.decode(files["Contents/section0.xml"]);
    const contentManifest = decoder.decode(files["Contents/content.hpf"]);
    const independentReader = new HwpxReader();

    await independentReader.loadFromArrayBuffer(
      output.slice().buffer as ArrayBuffer,
    );
    const independentlyExtractedText = await independentReader.extractText();

    expect(decoder.decode(files.mimetype)).toBe("application/hwp+zip");
    expect(contentManifest).toContain(
      'id="version" href="../version.xml" media-type="application/xml"',
    );
    expect(Object.keys(files).some((name) => name.startsWith("BinData/"))).toBe(
      false,
    );
    expect(section.match(/<hp:tbl\b/g)).toHaveLength(2);
    expect(section.match(/<hp:tr\b/g)).toHaveLength(3);
    expect(section.match(/<hp:pic\b/g)).toBeNull();
    expect(section).toContain('rowCnt="2"');
    expect(section).toContain(
      "공공도서관 주요 행사 추진 사항 [노원구립도서관]",
    );
    expect(section).toContain("책 &amp; 문화 &lt;특강&gt;");
    expect(section).toContain("〇 &lt;노원중앙도서관&gt;");
    expect(section).not.toContain("&lt;노중&gt;");
    expect(section).toContain("- 일시 : 2026-08-12 10:00~12:00");
    expect(section).toContain("- 대상 : 성인 20명");
    expect(section).toContain("Google Drive 사진 별도");
    expect(section).not.toContain("걸어서 도시를 읽다");
    expect(section).not.toContain("SAC ON SCREEN");
    expect(independentlyExtractedText).toContain("책 & 문화 <특강>");
    expect(independentlyExtractedText).toContain("검토용 설명");
    expect(await independentReader.listImages()).toEqual([]);
    expect(documentTitle(model)).toBe("2026년 8월 주요 업무 현황 보고");
    expect(documentFileName(model)).toBe(
      "2026-08_10일_주요업무현황보고.hwpx",
    );
  });

  it("preserves the foundation table and replaces only its data rows", async () => {
    const template = await readFile(
      new URL("../_assets/day20-foundation.hwpx", import.meta.url),
    );
    const model: HwpxDocumentModel = {
      documentType: "day20_foundation",
      targetMonth: "2026-08",
      reviewedOnly: true,
      excludedWarnings: true,
      programs: [
        {
          libraryName: "노원중앙도서관",
          libraryAbbreviation: "노중",
          title: "재단용 첫 행사",
          schedule: "2026. 8. 5.(수) 10:00",
          location: "다인정담",
          audience: "성인",
          capacity: 20,
          description: "첫 행사 설명",
          managerName: "김담당",
        },
        {
          libraryName: "불암도서관",
          libraryAbbreviation: "불암",
          title: "재단용 둘째 행사",
          schedule: "2026. 8. 12.(수) 14:00",
          location: "플랫폼B",
          audience: "누구나",
          capacity: null,
          description: "둘째 행사 설명",
          managerName: "이담당",
        },
      ],
    };

    const output = buildHwpx(template, model);
    const files = unzipSync(output);
    const section = decoder.decode(files["Contents/section0.xml"]);
    const independentReader = new HwpxReader();
    await independentReader.loadFromArrayBuffer(
      output.slice().buffer as ArrayBuffer,
    );
    const extractedText = await independentReader.extractText();

    expect(section.match(/<hp:tbl\b/g)).toHaveLength(1);
    expect(section.match(/<hp:tr\b/g)).toHaveLength(5);
    expect(section).toContain('rowCnt="5"');
    expect([
      ...new Set(
        [...section.matchAll(/\browAddr="(\d+)"/g)].map(
          (match) => match[1],
        ),
      ),
    ]).toEqual(["0", "1", "2", "3", "4"]);
    expect(files["Preview/PrvImage.png"]).toBeUndefined();
    expect(section).toContain("월간일정표 / 2026. 8.");
    expect(section).toContain("[노원중앙도서관] 재단용 첫 행사");
    expect(section).not.toContain("[노중]");
    expect(section).toContain("김담당");
    expect(section).not.toContain("걸어서 도시를 읽다");
    expect(extractedText).toContain("재단용 둘째 행사");
    expect(extractedText).toContain("이담당");
  });

  it("preserves and repeats the city plan paragraph block", async () => {
    const template = await readFile(
      new URL("../_assets/day20-city.hwpx", import.meta.url),
    );
    const model: HwpxDocumentModel = {
      documentType: "day20_city",
      targetMonth: "2026-08",
      reviewedOnly: true,
      excludedWarnings: true,
      programs: [
        {
          libraryName: "노원중앙도서관",
          libraryAbbreviation: "노중",
          title: "여름방학 독서문화 행사",
          schedule: "2026. 8. 5.(수) 10:00~12:00",
          location: "다인정담",
          audience: "초등학생",
          capacity: 20,
          description: "책과 체험을 연결하는 여름방학 프로그램",
          managerName: "김담당",
        },
        {
          libraryName: "불암도서관",
          libraryAbbreviation: "불암",
          title: "지역 작가와 함께하는 긴 제목의 북토크",
          schedule: "2026. 8. 12.(수) 14:00~16:00",
          location: "플랫폼B",
          audience: "누구나",
          capacity: null,
          description: "지역 작가의 작품 세계를 함께 읽고 대화하는 시간",
          managerName: "이담당",
        },
      ],
    };

    const output = buildHwpx(template, model);
    const files = unzipSync(output);
    const section = decoder.decode(files["Contents/section0.xml"]);
    const independentReader = new HwpxReader();
    await independentReader.loadFromArrayBuffer(
      output.slice().buffer as ArrayBuffer,
    );
    const extractedText = await independentReader.extractText();

    expect(section.match(/<hp:p\b/g)).toHaveLength(16);
    expect(section).toContain("<hp:secPr");
    expect(section).toContain("<hp:colPr");
    expect(section).not.toContain("<hp:linesegarray");
    expect(section).toContain("8월중 주요업무추진계획");
    expect(section).toContain("1. [행사] 여름방학 독서문화 행사");
    expect(section).toContain("2. [행사] 지역 작가와 함께하는 긴 제목의 북토크");
    expect(section).toContain("○ 개요 : 책과 체험을 연결하는 여름방학 프로그램");
    expect(section).toContain("○ 대상 : 초등학생 20명");
    expect(section).not.toContain("7월중 주요업무추진계획");
    expect(section).not.toContain("노원네트워크 여성행복걷기");
    expect(extractedText).toContain("지역 작가의 작품 세계");
    expect(files["Preview/PrvImage.png"]).toBeUndefined();
  });
});
