import { unzipSync, zipSync, type Zippable } from "fflate";

export type HwpxDocumentType =
  | "day10_city"
  | "day20_city"
  | "day20_foundation";

export interface HwpxProgram {
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
}

export interface HwpxDocumentModel {
  documentType: HwpxDocumentType;
  targetMonth: string;
  programs: HwpxProgram[];
  reviewedOnly: boolean;
  excludedWarnings: boolean;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function buildHwpx(
  template: Uint8Array,
  model: HwpxDocumentModel,
): Uint8Array {
  const files = unzipSync(template);
  const sectionBytes = files["Contents/section0.xml"];
  if (!sectionBytes) throw new Error("HWPX_SECTION_MISSING");

  const originalSection = decoder.decode(sectionBytes);
  const lines = documentLines(model);
  const section =
    model.documentType === "day20_foundation"
      ? buildFoundationSection(originalSection, model)
      : model.documentType === "day20_city"
        ? buildCityPlanSection(originalSection, model)
        : buildCityReportSection(originalSection, model);

  const output: Zippable = {
    mimetype: [files.mimetype ?? encoder.encode("application/hwp+zip"), { level: 0 }],
  };
  for (const [name, data] of Object.entries(files)) {
    if (
      name === "mimetype" ||
      name.startsWith("BinData/") ||
      name === "Preview/PrvImage.png"
    ) {
      continue;
    }
    if (name === "version.xml") {
      output[name] = [data, { level: 0 }];
      continue;
    }
    if (name === "Contents/section0.xml") {
      output[name] = encoder.encode(section);
      continue;
    }
    if (name === "Preview/PrvText.txt") {
      output[name] = encoder.encode(lines.join("\n"));
      continue;
    }
    if (name === "Contents/content.hpf") {
      const content = normalizeContentManifest(
        decoder
          .decode(data)
          .replace(
            /<opf:item\b[^>]*href="BinData\/[^"]+"[^>]*\/>/g,
            "",
          ),
      );
      output[name] = encoder.encode(content);
      continue;
    }
    output[name] = data;
  }

  const generated = zipSync(output, { level: 6 });
  validateHwpx(generated, lines[0] ?? "");
  return generated;
}

function normalizeContentManifest(content: string): string {
  if (/<opf:item\b[^>]*href="(?:\.\.\/)?version\.xml"[^>]*\/>/i.test(content)) {
    return content;
  }
  if (!content.includes("</opf:manifest>")) {
    throw new Error("HWPX_CONTENT_MANIFEST_INVALID");
  }
  return content.replace(
    "</opf:manifest>",
    '<opf:item id="version" href="../version.xml" media-type="application/xml"/></opf:manifest>',
  );
}

export function documentTitle(model: HwpxDocumentModel): string {
  const [year, month] = model.targetMonth.split("-");
  const numericMonth = Number(month);
  if (model.documentType === "day10_city") {
    return `${year}년 ${numericMonth}월 주요 업무 현황 보고`;
  }
  if (model.documentType === "day20_city") {
    return `${numericMonth}월중 주요업무추진계획`;
  }
  return `월간일정표 / ${year}. ${numericMonth}.`;
}

export function documentFileName(model: HwpxDocumentModel): string {
  const suffix =
    model.documentType === "day10_city"
      ? "10일_주요업무현황보고"
      : model.documentType === "day20_city"
        ? "20일_구청_주요업무추진계획"
        : "20일_재단_월간일정표";
  return `${model.targetMonth}_${suffix}.hwpx`;
}

function documentLines(model: HwpxDocumentModel): string[] {
  const lines = [
    documentTitle(model),
    "노원구립도서관",
    `출력 대상 ${model.programs.length}건`,
    model.reviewedOnly ? "검토완료 자료만 포함" : "전체 제출자료 포함",
    model.excludedWarnings ? "오류·경고 항목 제외" : "오류·경고 항목 포함",
    "",
  ];
  if (!model.programs.length) {
    lines.push("출력 대상으로 확정된 프로그램이 없습니다.");
    return lines;
  }

  model.programs.forEach((program, index) => {
    lines.push(
      `${index + 1}. <${program.libraryName}> ${program.title}`,
      `- 도서관 : ${program.libraryName}`,
      `- 일시 : ${program.schedule || "미입력"}`,
      `- 장소 : ${program.location || "미입력"}`,
      `- 대상 : ${program.audience || "미입력"}${
        program.capacity === null ? "" : ` ${program.capacity}명`
      }`,
      `- 내용 : ${program.description || "미입력"}`,
      `- 담당자 : ${program.managerName || "미입력"}`,
      "□ 이미지 삽입 영역 (Google Drive 사진 별도)",
      "",
    );
  });
  return lines;
}

function buildCityReportSection(
  originalSection: string,
  model: HwpxDocumentModel,
): string {
  const titleTableRange = findXmlElement(originalSection, "hp:tbl");
  const mainTableRange = findXmlElement(
    originalSection,
    "hp:tbl",
    titleTableRange.end,
  );
  const titleRows = titleTableRange.xml.match(
    /<hp:tr\b[\s\S]*?<\/hp:tr>/g,
  );
  const mainRows = mainTableRange.xml.match(
    /<hp:tr\b[\s\S]*?<\/hp:tr>/g,
  );
  if (!titleRows?.[0] || !mainRows || mainRows.length < 3) {
    throw new Error("HWPX_CITY_REPORT_TABLES_INVALID");
  }

  const titleTable = titleTableRange.xml.replace(
    titleRows[0],
    replaceRowCells(titleRows[0], [
      "10.",
      "공공도서관 주요 행사 추진 사항 [노원구립도서관]",
    ]),
  );
  const headerRow = replaceTextNodes(mainRows[1], [
    documentTitle(model),
  ]).replace(/\browAddr="\d+"/g, 'rowAddr="0"');
  const outputPrograms =
    model.programs.length > 0
      ? model.programs
      : [
          {
            libraryName: "",
            libraryAbbreviation: "",
            title: "출력 대상으로 확정된 프로그램이 없습니다.",
            schedule: "",
            location: "",
            audience: "",
            capacity: null,
            description: "",
            managerName: "",
          },
        ];
  const dataRows = outputPrograms.map((program, index) =>
    buildCityReportProgramRow(
      mainRows[2],
      program,
      index + 1,
      model.programs.length > 0,
    ),
  );
  const tableHeight =
    readRowHeight(headerRow) +
    dataRows.reduce((sum, row) => sum + readRowHeight(row), 0);
  const mainTable = mainTableRange.xml
    .replace(/\browCnt="\d+"/, `rowCnt="${dataRows.length + 1}"`)
    .replace(
      /(<hp:sz\b[^>]*\bheight=")\d+(")/,
      `$1${tableHeight}$2`,
    )
    .replace(
      /<hp:tr\b[\s\S]*$/,
      [...[headerRow], ...dataRows].join("") + "</hp:tbl>",
    );

  return [
    originalSection.slice(0, titleTableRange.start),
    titleTable,
    originalSection.slice(titleTableRange.end, mainTableRange.start),
    mainTable,
    originalSection.slice(mainTableRange.end),
  ].join("");
}

function buildCityReportProgramRow(
  sourceRow: string,
  program: HwpxProgram,
  rowAddress: number,
  hasProgram: boolean,
): string {
  const cells = sourceRow.match(/<hp:tc\b[\s\S]*?<\/hp:tc>/g);
  if (!cells || cells.length !== 3) {
    throw new Error("HWPX_CITY_REPORT_PROGRAM_ROW_INVALID");
  }

  const textCell = buildCityReportProgramCell(
    cells[1],
    program,
    hasProgram,
  );
  const imageCell = replaceCellWithSingleText(
    cells[2],
    hasProgram
      ? "이미지 삽입 영역 (Google Drive 사진 별도)"
      : "사진 없음",
  );
  const textLength = [
    program.title,
    program.schedule,
    program.location,
    program.audience,
    program.description,
  ].join("").length;
  const rowHeight = Math.min(
    30000,
    Math.max(14374, 11000 + Math.ceil(textLength / 45) * 1200),
  );
  let cellIndex = 0;
  return sourceRow
    .replace(/<hp:tc\b[\s\S]*?<\/hp:tc>/g, () => {
      const replacement = [cells[0], textCell, imageCell][cellIndex];
      cellIndex += 1;
      return replacement;
    })
    .replace(/\browAddr="\d+"/g, `rowAddr="${rowAddress}"`)
    .replace(
      /(<hp:cellSz\b[^>]*\bheight=")\d+(")/g,
      `$1${rowHeight}$2`,
    );
}

function buildCityReportProgramCell(
  sourceCell: string,
  program: HwpxProgram,
  hasProgram: boolean,
): string {
  const paragraphs = sourceCell.match(/<hp:p\b[\s\S]*?<\/hp:p>/g);
  if (!paragraphs || paragraphs.length !== 5) {
    throw new Error("HWPX_CITY_REPORT_PROGRAM_CELL_INVALID");
  }
  const capacity =
    program.capacity === null ? "" : ` ${program.capacity}명`;
  const replacements = hasProgram
    ? [
        replaceParagraphTexts(paragraphs[0], [
          `〇 <${program.libraryName}> ${program.title}`,
          "",
          "",
        ]),
        replaceParagraphTexts(paragraphs[1], [
          " ",
          `- 일시 : ${program.schedule || "미입력"}`,
        ]),
        replaceParagraphTexts(paragraphs[2], [
          ` - 장소 : ${program.location || "미입력"}`,
        ]),
        replaceParagraphTexts(paragraphs[3], [
          ` - 대상 : ${program.audience || "미입력"}${capacity}`,
        ]),
        replaceParagraphTexts(paragraphs[4], [
          ` - 내용 : ${program.description || "미입력"}`,
        ]),
      ]
    : [
        replaceParagraphTexts(paragraphs[0], [program.title, "", ""]),
        replaceParagraphTexts(paragraphs[1], [" ", ""]),
        replaceParagraphTexts(paragraphs[2], [""]),
        replaceParagraphTexts(paragraphs[3], [""]),
        replaceParagraphTexts(paragraphs[4], [""]),
      ];
  let paragraphIndex = 0;
  return sourceCell.replace(/<hp:p\b[\s\S]*?<\/hp:p>/g, () => {
    const replacement = replacements[paragraphIndex];
    paragraphIndex += 1;
    return replacement;
  });
}

function replaceCellWithSingleText(cell: string, value: string): string {
  const firstParagraph = cell.match(/<hp:p\b[\s\S]*?<\/hp:p>/)?.[0];
  if (!firstParagraph) {
    throw new Error("HWPX_CITY_REPORT_IMAGE_CELL_INVALID");
  }
  const paragraphOpen = firstParagraph.match(/<hp:p\b[^>]*>/)?.[0];
  const charPrIDRef =
    firstParagraph.match(/<hp:run\b[^>]*\bcharPrIDRef="([^"]+)"/)?.[1] ??
    "0";
  if (!paragraphOpen) {
    throw new Error("HWPX_CITY_REPORT_IMAGE_PARAGRAPH_INVALID");
  }
  const paragraph = `${paragraphOpen}<hp:run charPrIDRef="${charPrIDRef}"><hp:t>${escapeXml(value)}</hp:t></hp:run></hp:p>`;
  return cell
    .replace(/<hp:p\b[\s\S]*?<\/hp:p>/g, "")
    .replace(/<\/hp:subList>/, `${paragraph}</hp:subList>`);
}

function replaceTextNodes(xml: string, values: string[]): string {
  let textIndex = 0;
  const replaced = xml.replace(
    /(<hp:t\b[^>]*>)[\s\S]*?(<\/hp:t>)/g,
    (_match, open: string, close: string) => {
      const value = values[textIndex] ?? "";
      textIndex += 1;
      return `${open}${escapeXml(value)}${close}`;
    },
  );
  return withoutLineSegments(replaced);
}

function readRowHeight(row: string): number {
  const match = row.match(/<hp:cellSz\b[^>]*\bheight="(\d+)"/);
  if (!match) throw new Error("HWPX_CITY_REPORT_ROW_HEIGHT_MISSING");
  return Number(match[1]);
}

function findXmlElement(
  xml: string,
  tagName: string,
  fromIndex = 0,
): { start: number; end: number; xml: string } {
  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const token = new RegExp(
    `<${escapedTagName}\\b|</${escapedTagName}>`,
    "g",
  );
  token.lastIndex = fromIndex;
  let depth = 0;
  let start = -1;
  for (let match = token.exec(xml); match; match = token.exec(xml)) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return {
          start,
          end: token.lastIndex,
          xml: xml.slice(start, token.lastIndex),
        };
      }
    } else {
      if (depth === 0) start = match.index;
      depth += 1;
    }
  }
  throw new Error(`HWPX_ELEMENT_MISSING:${tagName}`);
}

function buildFoundationSection(
  originalSection: string,
  model: HwpxDocumentModel,
): string {
  const tableMatch = originalSection.match(/<hp:tbl\b[\s\S]*?<\/hp:tbl>/);
  if (!tableMatch || typeof tableMatch.index !== "number") {
    throw new Error("HWPX_FOUNDATION_TABLE_MISSING");
  }

  const originalTable = tableMatch[0];
  const rows = originalTable.match(/<hp:tr\b[\s\S]*?<\/hp:tr>/g);
  if (!rows || rows.length < 4) {
    throw new Error("HWPX_FOUNDATION_ROWS_INVALID");
  }

  const headerRows = [
    replaceRowCells(rows[0], [documentTitle(model)]),
    replaceRowCells(rows[1], ["◎ 부서 : 노원구립도서관"]),
    rows[2],
  ];
  const sourceDataRow = rows[3];
  const outputPrograms =
    model.programs.length > 0
      ? model.programs
      : [
          {
            libraryName: "",
            libraryAbbreviation: "",
            title: "출력 대상으로 확정된 프로그램이 없습니다.",
            schedule: "",
            location: "",
            audience: "",
            capacity: null,
            description: "",
            managerName: "",
          },
        ];
  const dataRows = outputPrograms.map((program, index) => {
    return replaceRowCells(sourceDataRow, [
        model.programs.length > 0 ? String(index + 1) : "-",
        program.schedule,
        program.libraryName
          ? `[${program.libraryName}] ${program.title}`
          : program.title,
        program.location,
        program.managerName,
      ])
      .replace(/\browAddr="\d+"/g, `rowAddr="${index + 3}"`);
  });
  const rowCount = headerRows.length + dataRows.length;
  const tableWithRows = originalTable
    .replace(/\browCnt="\d+"/, `rowCnt="${rowCount}"`)
    .replace(
      /<hp:tr\b[\s\S]*?<\/hp:tr>(?:[\s\S]*?<hp:tr\b[\s\S]*?<\/hp:tr>)*/g,
      [...headerRows, ...dataRows].join(""),
    );

  return [
    originalSection.slice(0, tableMatch.index),
    tableWithRows,
    originalSection.slice(tableMatch.index + originalTable.length),
  ].join("");
}

function buildCityPlanSection(
  originalSection: string,
  model: HwpxDocumentModel,
): string {
  const rootOpen = originalSection.match(/<hs:sec\b[^>]*>/)?.[0];
  const sourceParagraphs = originalSection.match(
    /<hp:p\b[\s\S]*?<\/hp:p>/g,
  );
  if (!rootOpen || !sourceParagraphs || sourceParagraphs.length < 9) {
    throw new Error("HWPX_CITY_PLAN_PARAGRAPHS_INVALID");
  }

  const heading = replaceParagraphTexts(sourceParagraphs[0], [
    documentTitle(model),
  ]);
  const spacer = withoutLineSegments(sourceParagraphs[1]);
  const programPrototype = sourceParagraphs.slice(2, 9);
  const programParagraphs =
    model.programs.length > 0
      ? model.programs.flatMap((program, index) =>
          cityPlanProgramParagraphs(programPrototype, program, index),
        )
      : [
          replaceParagraphTexts(programPrototype[0], [
            "출력 대상으로 확정된 프로그램이 없습니다.",
            "",
          ]),
          withoutLineSegments(programPrototype[6]),
        ];

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
    rootOpen,
    heading,
    spacer,
    ...programParagraphs,
    "</hs:sec>",
  ].join("");
}

function cityPlanProgramParagraphs(
  prototype: string[],
  program: HwpxProgram,
  index: number,
): string[] {
  return [
    replaceParagraphTexts(prototype[0], [
      `${index + 1}. [${program.programType || "행사"}] ${program.title}`,
      ` (${program.libraryName})`,
    ]),
    replaceParagraphTexts(prototype[1], [
      "  ",
      `○ 개요 : ${program.description || "미입력"}`,
    ]),
    replaceParagraphTexts(prototype[2], [
      `  ○ 일시 : ${program.schedule || "미입력"}`,
    ]),
    replaceParagraphTexts(prototype[3], [
      `  ○ 장소 : ${program.location || "미입력"}`,
    ]),
    replaceParagraphTexts(prototype[4], [
      `  ○ 대상 : ${program.audience || "미입력"}${
        program.capacity === null ? "" : ` ${program.capacity}명`
      }`,
    ]),
    replaceParagraphTexts(prototype[5], [
      `  ○ 담당자 : ${program.managerName || "미입력"}`,
    ]),
    withoutLineSegments(prototype[6]),
  ];
}

function replaceParagraphTexts(
  paragraphXml: string,
  values: string[],
): string {
  let textIndex = 0;
  const replaced = paragraphXml.replace(
    /(<hp:t\b[^>]*>)[\s\S]*?(<\/hp:t>)/g,
    (_match, open: string, close: string) => {
      const value = values[textIndex] ?? "";
      textIndex += 1;
      return `${open}${escapeXml(value)}${close}`;
    },
  );
  if (textIndex < values.length) {
    throw new Error("HWPX_CITY_PLAN_TEXT_RUNS_INVALID");
  }
  return withoutLineSegments(replaced);
}

function withoutLineSegments(paragraphXml: string): string {
  return paragraphXml.replace(
    /<hp:linesegarray\b[\s\S]*?<\/hp:linesegarray>/g,
    "",
  );
}

function replaceRowCells(row: string, values: string[]): string {
  let cellIndex = 0;
  return row.replace(/<hp:tc\b[\s\S]*?<\/hp:tc>/g, (cell) => {
    const value = values[cellIndex];
    cellIndex += 1;
    return typeof value === "undefined" ? cell : replaceCellText(cell, value);
  });
}

function replaceCellText(cell: string, value: string): string {
  let inserted = false;
  const replaced = cell.replace(
    /(<hp:t\b[^>]*>)[\s\S]*?(<\/hp:t>)/g,
    (_match, open: string, close: string) => {
      if (inserted) return `${open}${close}`;
      inserted = true;
      return `${open}${escapeXml(value)}${close}`;
    },
  );
  if (!inserted) throw new Error("HWPX_FOUNDATION_CELL_TEXT_MISSING");
  return replaced.replace(
    /<hp:linesegarray\b[\s\S]*?<\/hp:linesegarray>/g,
    "",
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function validateHwpx(bytes: Uint8Array, expectedTitle: string): void {
  const files = unzipSync(bytes);
  if (decoder.decode(files.mimetype) !== "application/hwp+zip") {
    throw new Error("HWPX_MIMETYPE_INVALID");
  }
  if (Object.keys(files).some((name) => name.startsWith("BinData/"))) {
    throw new Error("HWPX_IMAGE_NOT_REMOVED");
  }
  const section = decoder.decode(files["Contents/section0.xml"]);
  if (!section.includes(escapeXml(expectedTitle))) {
    throw new Error("HWPX_CONTENT_INVALID");
  }
}
