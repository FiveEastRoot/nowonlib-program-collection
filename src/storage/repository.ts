import type { AppSnapshot, Submission } from "../domain/types";
import { createDemoSnapshot } from "../data/demo";

export interface CollectionRepository {
  load(): Promise<AppSnapshot>;
  saveSubmission(submission: Submission): Promise<AppSnapshot>;
  reset(): Promise<AppSnapshot>;
}

const STORAGE_KEY = "nowonlib-program-collection:v1";

export class LocalCollectionRepository implements CollectionRepository {
  async load(): Promise<AppSnapshot> {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const initial = createDemoSnapshot();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }

    try {
      const parsed = JSON.parse(stored) as AppSnapshot;
      if (parsed.version !== 1) {
        return this.reset();
      }
      return parsed;
    } catch {
      return this.reset();
    }
  }

  async saveSubmission(submission: Submission): Promise<AppSnapshot> {
    const snapshot = await this.load();
    const next: AppSnapshot = {
      ...snapshot,
      submissions: snapshot.submissions.map((item) =>
        item.id === submission.id ? submission : item,
      ),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  async reset(): Promise<AppSnapshot> {
    const initial = createDemoSnapshot();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
}

