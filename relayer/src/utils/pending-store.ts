/**
 * Persistent store for relayer pending-transaction metadata.
 *
 * On each relayer restart the store is loaded from disk so that any
 * in-flight refund or claim actions that were queued before the restart
 * can be resumed rather than dropped.
 *
 * Design principles:
 *  - Stores only the minimal metadata needed to resume an action (orderId,
 *    direction, status, addresses, amounts). Private keys are NEVER stored.
 *  - Writes are atomic (temp file + rename) to avoid partial-write corruption.
 *  - A single JSON file holds the entire pending map so startup is a single
 *    disk read.
 *  - Callers must call `save()` after mutating entries; the store does not
 *    auto-persist to keep the hot path free of synchronous I/O.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';

export interface PendingEntry {
  orderId: string;
  direction: string;
  status: string;
  stellarAddress?: string;
  stellarTxHash?: string;
  xlmReceivedAt?: number;
  created?: number;
  amount?: string;
  networkMode?: string;
  refundTxHash?: string;
  refundedAt?: number;
  watchdogFailedAt?: number;
  watchdogFailureReason?: string;
  /** ISO timestamp when this entry was first persisted. */
  persistedAt: number;
  /** Number of recovery attempts since last restart. */
  recoveryAttempts: number;
}

export interface PendingStoreOptions {
  /** Path to the JSON file. Defaults to `<cwd>/.relayer/pending.json`. */
  filePath?: string;
}

export class PendingStore {
  private readonly filePath: string;
  private entries = new Map<string, PendingEntry>();

  constructor(options: PendingStoreOptions = {}) {
    this.filePath = options.filePath ?? join(process.cwd(), '.relayer', 'pending.json');
    this._ensureDir();
    this._load();
  }

  // ── public API ─────────────────────────────────────────────────────────────

  /** Return all persisted entries as a Map (orderId → entry). */
  getAll(): Map<string, PendingEntry> {
    return new Map(this.entries);
  }

  /** Upsert an entry and flush to disk atomically. */
  upsert(entry: Omit<PendingEntry, 'persistedAt' | 'recoveryAttempts'> & Partial<Pick<PendingEntry, 'persistedAt' | 'recoveryAttempts'>>): void {
    const existing = this.entries.get(entry.orderId);
    this.entries.set(entry.orderId, {
      ...entry,
      persistedAt: existing?.persistedAt ?? entry.persistedAt ?? Date.now(),
      recoveryAttempts: existing?.recoveryAttempts ?? entry.recoveryAttempts ?? 0,
    });
    this._save();
  }

  /** Mark an entry as resolved (completed or permanently failed) and remove it. */
  remove(orderId: string): void {
    if (this.entries.delete(orderId)) {
      this._save();
    }
  }

  /** Increment the recoveryAttempts counter for an entry. */
  incrementAttempts(orderId: string): void {
    const entry = this.entries.get(orderId);
    if (entry) {
      entry.recoveryAttempts += 1;
      this._save();
    }
  }

  /** Return the number of currently-tracked pending entries. */
  size(): number {
    return this.entries.size;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private _ensureDir(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private _load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed: Record<string, PendingEntry> = JSON.parse(raw);
      for (const [id, entry] of Object.entries(parsed)) {
        this.entries.set(id, entry);
      }
      if (this.entries.size > 0) {
        console.log(`[pending-store] loaded ${this.entries.size} pending entries from ${this.filePath}`);
      }
    } catch {
      // Corrupted file — start fresh so the relayer doesn't refuse to boot.
      console.warn(`[pending-store] failed to parse ${this.filePath}; starting with empty store`);
    }
  }

  private _save(): void {
    const obj: Record<string, PendingEntry> = {};
    for (const [id, entry] of this.entries) {
      obj[id] = entry;
    }
    const tmp = this.filePath + '.tmp';
    writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf-8');
    renameSync(tmp, this.filePath);
  }
}
