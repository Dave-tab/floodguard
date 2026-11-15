// Tiny JSON key-value store on disk (CACHE_DIR is the only writable folder on the server).
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface JsonStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
}

const safe = (key: string) => key.replace(/[^a-zA-Z0-9._-]/g, "_");

export class FileStore implements JsonStore {
  constructor(private readonly dir: string) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(join(this.dir, `${safe(key)}.json`), "utf8")) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const file = join(this.dir, `${safe(key)}.json`);
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value));
    await rename(tmp, file); // atomic replace, so readers never see half a file
  }
}

export class MemoryStore implements JsonStore {
  readonly data = new Map<string, string>();
  async get<T>(key: string) {
    const v = this.data.get(key);
    return v == null ? null : (JSON.parse(v) as T);
  }
  async set(key: string, value: unknown) {
    this.data.set(key, JSON.stringify(value));
  }
}
