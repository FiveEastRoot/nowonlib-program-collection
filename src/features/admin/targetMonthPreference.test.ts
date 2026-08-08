import { describe, expect, it, vi } from "vitest";
import {
  readTargetMonthPreference,
  TARGET_MONTH_PREFERENCE_KEY,
  writeTargetMonthPreference,
} from "./targetMonthPreference";

describe("target month preference", () => {
  it("restores a valid stored month", () => {
    const storage = {
      getItem: vi.fn(() => "2026-07"),
    };

    expect(readTargetMonthPreference(storage)).toBe("2026-07");
    expect(storage.getItem).toHaveBeenCalledWith(
      TARGET_MONTH_PREFERENCE_KEY,
    );
  });

  it("ignores an invalid stored value", () => {
    const storage = {
      getItem: vi.fn(() => "2026-13"),
    };

    expect(readTargetMonthPreference(storage)).toBe("");
  });

  it("stores a valid month and ignores invalid values", () => {
    const storage = {
      setItem: vi.fn(),
    };

    writeTargetMonthPreference(storage, "2026-07");
    writeTargetMonthPreference(storage, "July");

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      TARGET_MONTH_PREFERENCE_KEY,
      "2026-07",
    );
  });

  it("keeps working when storage access is blocked", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };

    expect(readTargetMonthPreference(storage)).toBe("");
    expect(() =>
      writeTargetMonthPreference(storage, "2026-07"),
    ).not.toThrow();
  });
});
