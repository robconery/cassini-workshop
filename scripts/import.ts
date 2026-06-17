export interface ImportStore {
  tableExists(name: string): Promise<boolean>;
  indexExists(name: string): Promise<boolean>;
  get(id: number): Promise<Record<string, unknown> | undefined>;
  count(): Promise<number>;
}

export interface ImportResult {
  ok: boolean;
  imported: number;
  skipped: number;
}

export async function runImport(_store: ImportStore): Promise<ImportResult> {
  throw new Error("not implemented");
}
