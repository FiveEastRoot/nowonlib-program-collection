import type { CollectionStatus } from "./types";

export const collectionStatusLabels: Record<CollectionStatus, string> = {
  planned: "수합 예정",
  open: "수합 중",
  closed: "수합 마감",
  archived: "보관됨",
};

export function isCollectionOpen(status: CollectionStatus): boolean {
  return status === "open";
}

export function nextCollectionStatus(
  status: CollectionStatus,
): "open" | "closed" | null {
  if (status === "open") return "closed";
  if (status === "planned" || status === "closed") return "open";
  return null;
}
