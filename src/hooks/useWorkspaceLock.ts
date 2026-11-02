import { useEffect, useState } from 'react';
import { acquireWorkspaceLock, type WorkspaceLockStatus } from '../utils/workspaceLock';

export interface WorkspaceLockState {
  isWritable: boolean;
  isReady: boolean;
  status: WorkspaceLockStatus;
}

/** Only the writer may restore writable handles or mutate this origin's workspace. */
export function useWorkspaceLock(): WorkspaceLockState {
  const [status, setStatus] = useState<WorkspaceLockStatus>('loading');

  useEffect(() => {
    const manager = typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function'
      ? navigator.locks : undefined;
    const lease = acquireWorkspaceLock(manager, setStatus);
    return () => lease.dispose();
  }, []);

  return {
    isWritable: status === 'writer' || status === 'unsupported',
    isReady: status !== 'loading',
    status,
  };
}
