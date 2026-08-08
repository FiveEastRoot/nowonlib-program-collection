import type {
  HwpxDocumentModel,
  HwpxDocumentType,
  HwpxProgram,
} from "./hwpxBuilder";

type Row = Record<string, unknown>;

export interface HwpxSnapshot {
  collections: Row[];
  libraries: Row[];
  submissions: Row[];
  programs: Row[];
}

export interface HwpxSelectionOptions {
  collectionId: string;
  documentType: HwpxDocumentType;
  reviewedOnly: boolean;
  excludeWarnings: boolean;
}

export function selectHwpxModel(
  snapshot: HwpxSnapshot,
  options: HwpxSelectionOptions,
): HwpxDocumentModel {
  const collection = snapshot.collections.find(
    (row) => text(row.collection_id) === options.collectionId,
  );
  if (!collection) throw new Error("COLLECTION_NOT_FOUND");

  const collectionType = text(collection.collection_type);
  const legacyMatch =
    collectionType === "day10"
      ? options.documentType === "day10_city"
      : collectionType === "day20"
        ? options.documentType !== "day10_city"
        : false;
  if (collectionType !== "monthly" && !legacyMatch) {
    throw new Error("DOCUMENT_TYPE_MISMATCH");
  }

  const libraries = new Map(
    snapshot.libraries.map((row) => [text(row.library_id), row]),
  );
  const submissions = snapshot.submissions
    .filter(
      (row) =>
        text(row.collection_id) === options.collectionId &&
        (!options.reviewedOnly || text(row.status) === "reviewed"),
    )
    .sort((left, right) => {
      const leftLibrary = libraries.get(text(left.library_id));
      const rightLibrary = libraries.get(text(right.library_id));
      return number(leftLibrary?.output_order) - number(rightLibrary?.output_order);
    });
  const submissionOrder = new Map(
    submissions.map((row, index) => [text(row.submission_id), index]),
  );
  const inclusionField =
    options.documentType === "day10_city"
      ? "include_day10"
      : options.documentType === "day20_city"
        ? "include_city"
        : "include_foundation";
  const orderField =
    options.documentType === "day10_city"
      ? "output_order_day10"
      : options.documentType === "day20_city"
        ? "output_order_city"
        : "output_order_foundation";

  const programs: HwpxProgram[] = snapshot.programs
    .filter((row) => {
      if (!submissionOrder.has(text(row.submission_id))) return false;
      if (!boolean(row[inclusionField], true)) return false;
      if (
        options.excludeWarnings &&
        text(row.validation_messages).trim()
      ) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const submissionDifference =
        (submissionOrder.get(text(left.submission_id)) ?? 0) -
        (submissionOrder.get(text(right.submission_id)) ?? 0);
      return submissionDifference || number(left[orderField]) - number(right[orderField]);
    })
    .map((row) => {
      const library = libraries.get(text(row.library_id));
      const title =
        options.documentType === "day20_city"
          ? text(row.title_output_city) || text(row.title_original)
          : options.documentType === "day20_foundation"
            ? text(row.title_output_foundation) || text(row.title_original)
            : text(row.title_original);
      const description =
        options.documentType === "day20_city"
          ? text(row.description_output_city) || text(row.description_original)
          : options.documentType === "day20_foundation"
            ? text(row.description_output_foundation) ||
              text(row.description_original)
            : text(row.description_original);
      return {
        libraryName: text(library?.official_name, text(row.library_id)),
        libraryAbbreviation: text(
          library?.abbreviation,
          text(row.library_id),
        ),
        programType: text(row.program_type, "행사"),
        title,
        schedule: text(row.schedule_original) || scheduleFrom(row),
        location: text(row.location),
        audience: text(row.audience),
        capacity:
          row.capacity === "" || row.capacity === null
            ? null
            : number(row.capacity),
        description,
        managerName: text(row.manager_name),
      };
    });

  return {
    documentType: options.documentType,
    targetMonth: text(collection.target_month),
    programs,
    reviewedOnly: options.reviewedOnly,
    excludedWarnings: options.excludeWarnings,
  };
}

function scheduleFrom(row: Row): string {
  const start = text(row.start_date);
  const end = text(row.end_date);
  const time = [text(row.start_time), text(row.end_time)]
    .filter(Boolean)
    .join("~");
  return [start === end || !end ? start : `${start} ~ ${end}`, time]
    .filter(Boolean)
    .join(" ");
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string"
    ? value
    : value === null || typeof value === "undefined"
      ? fallback
      : String(value);
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (value === "" || value === null || typeof value === "undefined") {
    return fallback;
  }
  return value === true || value === "TRUE" || value === "true" || value === 1;
}
