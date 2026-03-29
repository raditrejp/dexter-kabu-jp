/**
 * Signal evolution tracker — persists ISQ scores in SQLite
 * so we can compare signals over time and detect evolution.
 *
 * Uses bun:sqlite (native to Bun) with a fallback to better-sqlite3 for Node.
 */

import type { ISQScore } from './isq.js';
import type { TransmissionChain } from './transmission.js';

// ── Types ────────────────────────────────────────────────────────────

export type SignalEvolution = 'strengthened' | 'weakened' | 'falsified' | 'unchanged';

export interface TrackedSignal {
  symbol: string;
  date: string;
  isqScore: ISQScore;
  transmission?: TransmissionChain;
}

// ── DB abstraction (same pattern as memory/database.ts) ──────────────

interface SqliteQuery<T> {
  all(...params: unknown[]): T[];
  get(...params: unknown[]): T | null;
  run(...params: unknown[]): void;
}

interface SqliteDatabase {
  exec(sql: string): void;
  query<T>(sql: string): SqliteQuery<T>;
  close(): void;
}

// ── DB row shape ─────────────────────────────────────────────────────

interface SignalRow {
  symbol: string;
  date: string;
  score: number;
  direction: number;
  signal_value: number;
  label: string;
  transmission_json: string | null;
}

// ── Tracker ──────────────────────────────────────────────────────────

export class SignalTracker {
  private readonly db: SqliteDatabase;

  private constructor(db: SqliteDatabase) {
    this.db = db;
    this.initDb();
  }

  /**
   * Factory — async so we can dynamically import the right SQLite driver.
   */
  static async create(dbPath: string = '.kabu-dexter/signals.db'): Promise<SignalTracker> {
    const db = await SignalTracker.openSqlite(dbPath);
    return new SignalTracker(db);
  }

  /** Prefer bun:sqlite when running under Bun; fall back to better-sqlite3. */
  private static async openSqlite(path: string): Promise<SqliteDatabase> {
    try {
      const sqlite = await import('bun:sqlite');
      const DatabaseCtor = sqlite.Database as new (dbPath: string) => SqliteDatabase;
      return new DatabaseCtor(path);
    } catch {
      return SignalTracker.openBetterSqlite3(path);
    }
  }

  private static async openBetterSqlite3(path: string): Promise<SqliteDatabase> {
    const mod = await import('better-sqlite3');
    const Database = mod.default;
    const raw = new Database(path);

    return {
      exec: (sql: string) => raw.exec(sql),
      query: <T>(sql: string): SqliteQuery<T> => {
        const stmt = raw.prepare(sql);
        return {
          all: (...params: unknown[]) => stmt.all(...params) as T[],
          get: (...params: unknown[]) => (stmt.get(...params) as T) ?? null,
          run: (...params: unknown[]) => { stmt.run(...params); },
        };
      },
      close: () => raw.close(),
    };
  }

  /** Create the signals table if it doesn't exist. */
  initDb(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS signals (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol          TEXT    NOT NULL,
        date            TEXT    NOT NULL,
        score           REAL    NOT NULL,
        direction       INTEGER NOT NULL,
        signal_value    REAL    NOT NULL,
        label           TEXT    NOT NULL,
        transmission_json TEXT,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_signals_symbol_date
        ON signals (symbol, date DESC)
    `);
  }

  /** Persist a tracked signal. */
  save(tracked: TrackedSignal): void {
    this.db
      .query(`
        INSERT INTO signals (symbol, date, score, direction, signal_value, label, transmission_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        tracked.symbol,
        tracked.date,
        tracked.isqScore.score,
        tracked.isqScore.direction,
        tracked.isqScore.signal,
        tracked.isqScore.label,
        tracked.transmission ? JSON.stringify(tracked.transmission) : null,
      );
  }

  /** Get the most recent signal for a symbol. */
  getLatest(symbol: string): TrackedSignal | null {
    const row = this.db
      .query<SignalRow>(`
        SELECT symbol, date, score, direction, signal_value, label, transmission_json
        FROM signals
        WHERE symbol = ?
        ORDER BY date DESC, id DESC
        LIMIT 1
      `)
      .get(symbol);

    if (!row) return null;

    return {
      symbol: row.symbol,
      date: row.date,
      isqScore: {
        score: row.score,
        direction: row.direction === 1 ? 1 : -1,
        signal: row.signal_value,
        label: row.label,
      },
      transmission: row.transmission_json
        ? (JSON.parse(row.transmission_json) as TransmissionChain)
        : undefined,
    };
  }

  /**
   * Compare the latest stored signal for `symbol` against `newScore`.
   *
   * - sentiment flipped → falsified
   * - score difference > +0.1 → strengthened
   * - score difference < -0.1 → weakened
   * - otherwise → unchanged
   */
  compare(symbol: string, newScore: ISQScore): SignalEvolution {
    const latest = this.getLatest(symbol);
    if (!latest) return 'unchanged';

    const old = latest.isqScore;

    // Sentiment direction flipped
    if (old.direction !== newScore.direction) return 'falsified';

    const diff = newScore.score - old.score;
    if (diff > 0.1) return 'strengthened';
    if (diff < -0.1) return 'weakened';

    return 'unchanged';
  }

  /** Close the underlying database connection. */
  close(): void {
    this.db.close();
  }
}
