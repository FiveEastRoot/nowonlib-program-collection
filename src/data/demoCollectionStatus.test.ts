import { describe, expect, it, vi } from "vitest";
import {
  readDemoCollectionStatuses,
  writeDemoCollectionStatus,
} from "./demoCollectionStatus";

describe("demo collection status storage", () => {
  it("reads only supported collection statuses", () => {
    const storage = {
      getItem: vi.fn(() =>
        JSON.stringify({
          "2026-08-day10": "closed",
          "2026-08-day20": "invalid",
        }),
      ),
    };

    expect(readDemoCollectionStatuses(storage)).toEqual({
      "2026-08-day10": "closed",
    });
  });

  it("writes a status while preserving other rounds", () => {
    const storage = { setItem: vi.fn() };
    const next = writeDemoCollectionStatus(
      storage,
      { "2026-08-day20": "open" },
      "2026-08-day10",
      "closed",
    );

    expect(next).toEqual({
      "2026-08-day20": "open",
      "2026-08-day10": "closed",
    });
    expect(storage.setItem).toHaveBeenCalledOnce();
  });
});
