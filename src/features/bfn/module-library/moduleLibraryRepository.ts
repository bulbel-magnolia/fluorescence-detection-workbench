import { createIndexedDbBfnModuleLibraryRepository } from './indexedDbModuleLibraryRepository';
import { createLocalStorageBfnModuleLibraryRepository } from './localStorageModuleLibraryRepository';
import {
  BFN_MODULE_LIBRARY_STORAGE_FAILED,
  BfnModuleLibraryRepositoryError,
  type BfnModuleLibraryRepository,
} from './moduleLibraryTypes';

export { createIndexedDbBfnModuleLibraryRepository };
export { createLocalStorageBfnModuleLibraryRepository };

export function createBfnModuleLibraryRepository(): BfnModuleLibraryRepository {
  if (typeof indexedDB !== 'undefined') {
    return createIndexedDbBfnModuleLibraryRepository();
  }
  if (typeof localStorage !== 'undefined') {
    return createLocalStorageBfnModuleLibraryRepository();
  }
  throw new BfnModuleLibraryRepositoryError(BFN_MODULE_LIBRARY_STORAGE_FAILED);
}
