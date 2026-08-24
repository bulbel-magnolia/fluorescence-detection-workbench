import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Hc08dCharacteristicInfo } from '../../domain/types';

export interface NativeDevice {
  id: string;
  name: string;
  rssi: number | null;
}

export interface NativeCharacteristicSelection {
  serviceUuid: string;
  notifyCharacteristicUuid: string;
  writeCharacteristicUuid: string;
  writeWithResponse: boolean;
}

export interface NativeConnectResult {
  generation: number;
  device: NativeDevice;
  selection: NativeCharacteristicSelection | null;
  candidates: Hc08dCharacteristicInfo[];
}

export interface NativeBleEventMap {
  'ble://notification': {
    generation: number;
    deviceId: string;
    bytes: number[];
  };
  'ble://disconnected': {
    generation: number;
    device: NativeDevice;
    status: 'requested' | 'link-loss';
    attempt?: number;
  };
  'ble://connection-state': {
    generation: number;
    device: NativeDevice;
    status: string;
    attempt?: number;
  };
  'ble://error': {
    generation: number;
    code: string;
    message: string;
    recoverable: boolean;
  };
}

export interface NativeBleApi {
  scan(): Promise<NativeDevice[]>;
  stopScan(): Promise<void>;
  connect(deviceId: string): Promise<NativeConnectResult>;
  selectCharacteristics(request: {
    deviceId: string;
    serviceUuid: string;
    notifyCharacteristicUuid: string;
    writeCharacteristicUuid: string;
  }): Promise<NativeConnectResult>;
  disconnect(requested: boolean): Promise<void>;
  write(bytes: number[]): Promise<void>;
  listen<K extends keyof NativeBleEventMap>(
    event: K,
    listener: (payload: NativeBleEventMap[K]) => void,
  ): Promise<UnlistenFn>;
}

export const tauriBleApi: NativeBleApi = {
  scan: () => invoke<NativeDevice[]>('ble_scan_start'),
  stopScan: () => invoke<void>('ble_scan_stop'),
  connect: (deviceId) => invoke<NativeConnectResult>('ble_connect', { deviceId }),
  selectCharacteristics: (request) =>
    invoke<NativeConnectResult>('ble_select_characteristics', { request }),
  disconnect: (requested) => invoke<void>('ble_disconnect', { requested }),
  write: (bytes) => invoke<void>('ble_write', { bytes }),
  listen: async (event, listener) =>
    listen<NativeBleEventMap[typeof event]>(event, ({ payload }) => listener(payload)),
};
