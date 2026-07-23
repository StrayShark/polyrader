declare module '*.node' {
  const path: string;
  export default path;
}

declare module '*.sql' {
  const source: string;
  export default source;
}

declare module 'bun:sqlite' {
  export class Database {
    constructor(filename: string, options?: { create?: boolean });
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    };
    query(sql: string): { all(...params: unknown[]): unknown[] };
    transaction<T>(fn: () => T): () => T;
    exec(sql: string): unknown;
    serialize(): Uint8Array;
    close(): void;
  }
}
