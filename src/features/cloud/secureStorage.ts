import { invoke, isTauri } from '@tauri-apps/api/core';

const memory = new Map<string, string>();

export const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!isTauri()) return memory.get(key) ?? null;
    return invoke<string | null>('secure_storage_get', { key });
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!isTauri()) {
      memory.set(key, value);
      return;
    }
    await invoke('secure_storage_set', { key, value });
  },

  async removeItem(key: string): Promise<void> {
    if (!isTauri()) {
      memory.delete(key);
      return;
    }
    await invoke('secure_storage_remove', { key });
  },
};
