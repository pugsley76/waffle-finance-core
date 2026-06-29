import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { PendingStore } from '../src/utils/pending-store.js';

const TEST_FILE = join(process.cwd(), '.relayer-test', 'pending.json');

function freshStore(): PendingStore {
  return new PendingStore({ filePath: TEST_FILE });
}

describe('PendingStore', () => {
  beforeEach(() => {
    const dir = join(process.cwd(), '.relayer-test');
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    const dir = join(process.cwd(), '.relayer-test');
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('starts empty when no file exists', () => {
    const store = freshStore();
    expect(store.size()).toBe(0);
  });

  it('persists and retrieves an entry', () => {
    const store = freshStore();
    store.upsert({
      orderId: 'order-1',
      direction: 'xlm_to_eth',
      status: 'pending_refund',
      networkMode: 'testnet',
    });
    expect(store.size()).toBe(1);
    const all = store.getAll();
    expect(all.get('order-1')?.direction).toBe('xlm_to_eth');
  });

  it('survives a restart — new instance reads persisted data', () => {
    const store = freshStore();
    store.upsert({
      orderId: 'order-2',
      direction: 'xlm_to_eth',
      status: 'pending_refund',
      networkMode: 'testnet',
    });

    const store2 = new PendingStore({ filePath: TEST_FILE });
    expect(store2.size()).toBe(1);
    expect(store2.getAll().get('order-2')?.orderId).toBe('order-2');
  });

  it('remove deletes the entry and persists the removal', () => {
    const store = freshStore();
    store.upsert({ orderId: 'order-3', direction: 'xlm_to_eth', status: 'pending_refund', networkMode: 'testnet' });
    store.remove('order-3');
    expect(store.size()).toBe(0);

    const store2 = new PendingStore({ filePath: TEST_FILE });
    expect(store2.size()).toBe(0);
  });

  it('incrementAttempts increments the counter and persists', () => {
    const store = freshStore();
    store.upsert({ orderId: 'order-4', direction: 'xlm_to_eth', status: 'pending_refund', networkMode: 'testnet' });
    expect(store.getAll().get('order-4')?.recoveryAttempts).toBe(0);

    store.incrementAttempts('order-4');
    store.incrementAttempts('order-4');

    const store2 = new PendingStore({ filePath: TEST_FILE });
    expect(store2.getAll().get('order-4')?.recoveryAttempts).toBe(2);
  });

  it('upsert preserves persistedAt across updates', () => {
    const store = freshStore();
    store.upsert({ orderId: 'order-5', direction: 'xlm_to_eth', status: 'pending_refund', networkMode: 'testnet' });
    const first = store.getAll().get('order-5')!.persistedAt;

    store.upsert({ orderId: 'order-5', direction: 'xlm_to_eth', status: 'refunded', networkMode: 'testnet' });
    const second = store.getAll().get('order-5')!.persistedAt;

    expect(second).toBe(first);
    expect(store.getAll().get('order-5')?.status).toBe('refunded');
  });

  it('replays persisted entries into activeOrders on startup', () => {
    // Simulate: store an entry before "restart"
    const store = freshStore();
    store.upsert({
      orderId: 'order-6',
      direction: 'xlm_to_eth',
      status: 'pending_refund',
      stellarAddress: 'GADDR',
      stellarTxHash: 'abc123',
      networkMode: 'testnet',
    });

    // "Restart": new store instance loads from disk
    const store2 = new PendingStore({ filePath: TEST_FILE });
    const activeOrders = new Map<string, Record<string, unknown>>();

    // Replay logic (mirrors what startRefundWatchdog does on boot)
    for (const [orderId, entry] of store2.getAll()) {
      if (!activeOrders.has(orderId)) {
        activeOrders.set(orderId, {
          orderId,
          direction: entry.direction,
          status: entry.status,
          stellarAddress: entry.stellarAddress,
          stellarTxHash: entry.stellarTxHash,
          networkMode: entry.networkMode,
        });
      }
    }

    expect(activeOrders.has('order-6')).toBe(true);
    expect(activeOrders.get('order-6')?.stellarTxHash).toBe('abc123');
  });
});
