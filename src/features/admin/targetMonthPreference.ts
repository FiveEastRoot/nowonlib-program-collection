export const TARGET_MONTH_PREFERENCE_KEY =
  "nowonlib.admin.target-month.v1";

const TARGET_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function readTargetMonthPreference(
  storage: Pick<Storage, "getItem">,
): string {
  try {
    const stored = storage.getItem(TARGET_MONTH_PREFERENCE_KEY) ?? "";
    return TARGET_MONTH_PATTERN.test(stored) ? stored : "";
  } catch {
    return "";
  }
}

export function writeTargetMonthPreference(
  storage: Pick<Storage, "setItem">,
  targetMonth: string,
): void {
  if (!TARGET_MONTH_PATTERN.test(targetMonth)) return;

  try {
    storage.setItem(TARGET_MONTH_PREFERENCE_KEY, targetMonth);
  } catch {
    // 저장소 접근이 제한되어도 월 선택 자체는 정상 동작해야 한다.
  }
}
