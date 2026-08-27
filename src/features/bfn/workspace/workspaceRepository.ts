import { createIndexedDbBfnWorkspaceRepository } from './indexedDbWorkspaceRepository';
import { createLocalStorageBfnWorkspaceRepository } from './localStorageWorkspaceRepository';
import type { BfnWorkspaceRepository } from './workspaceTypes';

export function createBfnWorkspaceRepository(): BfnWorkspaceRepository {
  return typeof indexedDB === 'undefined'
    ? createLocalStorageBfnWorkspaceRepository()
    : createIndexedDbBfnWorkspaceRepository();
}
