import type { CollectionStatus } from "../domain/types";

const STORAGE_KEY = "nowonlib.demo.collection-status.v1";
const VALID_STATUSES = new Set<CollectionStatus>([
  "planned",
  "open",
  "closed",
  "archived",
]);

export type DemoCollectionStatuses = Partial<
  Record<string, CollectionStatus>
>;

export function readDemoCollectionStatuses(
  storage: Pick<Storage, "getItem">,
): DemoCollectionStatuses {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, CollectionStatus] =>
          typeof entry[0] === "string" &&
          VALID_STATUSES.has(entry[1] as CollectionStatus),
      ),
    );
  } catch {
    return {};
  }
}

export function writeDemoCollectionStatus(
  storage: Pick<Storage, "setItem">,
  statuses: DemoCollectionStatuses,
  collectionId: string,
  status: CollectionStatus,
): DemoCollectionStatuses {
  const next = { ...statuses, [collectionId]: status };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 로컬 검수 저장소가 막혀도 현재 화면 상태 전환은 유지한다.
  }
  return next;
}
