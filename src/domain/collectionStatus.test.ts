import { describe, expect, it } from "vitest";
import {
  isCollectionOpen,
  nextCollectionStatus,
} from "./collectionStatus";

describe("collection status", () => {
  it("allows submitter work only while the collection is open", () => {
    expect(isCollectionOpen("open")).toBe(true);
    expect(isCollectionOpen("planned")).toBe(false);
    expect(isCollectionOpen("closed")).toBe(false);
    expect(isCollectionOpen("archived")).toBe(false);
  });

  it("defines the administrator open and close transitions", () => {
    expect(nextCollectionStatus("planned")).toBe("open");
    expect(nextCollectionStatus("open")).toBe("closed");
    expect(nextCollectionStatus("closed")).toBe("open");
    expect(nextCollectionStatus("archived")).toBeNull();
  });
});
