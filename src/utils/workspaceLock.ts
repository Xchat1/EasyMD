export type WorkspaceLockStatus = 'loading' | 'writer' | 'reader' | 'unsupported';

/** The narrow Web Locks surface used here also permits deterministic lifecycle tests. */
export interface WorkspaceLockManager {
  request(
    name: string,
    options: { mode: 'exclusive'; ifAvailable: true },
    callback: (lock: unknown | null) => Promise<void>,
  ): Promise<unknown>;
}

export interface WorkspaceLockLease {
  dispose(): void;
  /** Resolves when a refused request completes, or an owned lock has been released. */
  settled: Promise<void>;
}

export const WORKSPACE_LOCK_NAME = 'easymd-workspace-v1';

// A disposed effect can still have a browser request awaiting its callback. Wait for
// that request to release before trying again in the same page (React StrictMode).
const retiringRequests = new WeakMap<WorkspaceLockManager, Promise<void>>();

export function acquireWorkspaceLock(
  manager: WorkspaceLockManager | undefined,
  onStatus: (status: WorkspaceLockStatus) => void,
): WorkspaceLockLease {
  let disposed = false;
  let release: (() => void) | undefined;
  const heldUntilDisposed = new Promise<void>((resolve) => { release = resolve; });

  const settled = (async () => {
    if (!manager) {
      onStatus('unsupported');
      return;
    }
    await retiringRequests.get(manager);
    if (disposed) return;
    try {
      await manager.request(WORKSPACE_LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (disposed) return;
        if (!lock) {
          onStatus('reader');
          return;
        }
        onStatus('writer');
        await heldUntilDisposed;
      });
    } catch (error) {
      // An available-but-failing API must not silently permit simultaneous writers.
      if (!disposed) {
        console.warn('Unable to acquire the workspace write lock:', error);
        onStatus('reader');
      }
    }
  })();

  return {
    settled,
    dispose() {
      if (disposed) return;
      disposed = true;
      release?.();
      if (manager) {
        const previous = retiringRequests.get(manager);
        const retirement = previous ? Promise.all([previous, settled]).then(() => undefined) : settled;
        retiringRequests.set(manager, retirement);
        void retirement.finally(() => {
          if (retiringRequests.get(manager) === retirement) retiringRequests.delete(manager);
        });
      }
    },
  };
}
