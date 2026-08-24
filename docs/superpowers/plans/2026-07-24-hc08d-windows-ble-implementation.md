# HC-08D Windows BLE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Windows Tauri desktop application discover, connect to, receive real 2 Hz fluorescence frames from, send CRLF-terminated LED commands to, and verify STM32 responses from an HC-08D BLE UART module while preserving the existing Demo workflow.

**Architecture:** Keep React and Zustand behind the existing `BleTransport` contract. Add a TypeScript HC-08D protocol/transport adapter and a Rust `btleplug` Windows backend connected through typed Tauri commands and events. Store real sessions as `RAW_ONLY` hardware records so no Demo background, calibration, or quality model is applied to real data.

**Tech Stack:** Tauri 2, Rust 1.97, `btleplug` 0.12, Tokio, React 19, TypeScript 5.9, Zustand 5, Vitest 4, SQLite, i18next.

---

## File map

### New TypeScript files

- `src/features/protocol/hc08dProtocol.ts` — strict ASCII line parser, fluorescence frames, firmware responses, buffering, saturation flags, and CRLF command encoding.
- `src/features/protocol/hc08dProtocol.test.ts` — frame/response fragmentation, framing, validation, overflow, and exact-byte tests.
- `src/features/transport/tauriBleApi.ts` — typed Tauri invoke/listen boundary.
- `src/features/transport/Hc08dBleTransport.ts` — `BleTransport` implementation, parser integration, stale-data timer, diagnostics, and reconnect orchestration.
- `src/features/transport/Hc08dBleTransport.test.ts` — fake Tauri API tests.
- `src/features/transport/SwitchableBleTransport.ts` — safe Demo/HC-08D transport switching.
- `src/features/transport/SwitchableBleTransport.test.ts` — disposal and delegation tests.
- `src/components/HardwareTechnicalDetails.tsx` — actual GATT mapping, raw frames, and technical errors.
- `src/components/HardwareTechnicalDetails.test.tsx` — accessible diagnostics rendering tests.
- `src/store/appStore.hc08d.test.ts` — real-mode local acquisition and LED behavior.
- `src-tauri/src/hc08d/mod.rs` — Tauri command surface and managed state registration.
- `src-tauri/src/hc08d/types.rs` — serializable device, characteristic, state, notification, and error payloads.
- `src-tauri/src/hc08d/selection.rs` — pure adaptive characteristic selection.
- `src-tauri/src/hc08d/runtime.rs` — Windows BLE scan, connect, subscribe, write, disconnect, and resource lifecycle.
- `src-tauri/migrations/0002_hc08d_frames.sql` — raw HC-08D frame persistence.

### Modified files

- `src/domain/types.ts` — hardware frames, raw-only results, diagnostics, transport mode, connection states, and LED command types.
- `src/features/transport/BleTransport.ts` — diagnostics and transport-mode-compatible contract.
- `src/features/transport/MockBleTransport.ts` — retain Demo semantics while satisfying expanded types.
- `src/store/appStore.ts` — switchable transport, raw session lifecycle, CLR, saturation, LED commands, and diagnostics.
- `src/features/persistence/historyRepository.ts` — validate and persist raw-only results and HC-08D frames.
- `src/features/persistence/historyRepository.test.ts` — local raw record round trip.
- `src/features/export/exportRecord.ts` — raw-frame CSV/JSON export.
- `src/features/export/exportRecord.test.ts` — raw CSV coverage.
- `src/components/SignalChart.tsx` — raw versus corrected plotting and saturation markers.
- `src/pages/DetectionPage.tsx` — real device controls, raw metrics, mode-aware controls, and diagnostics.
- `src/pages/SettingsPage.tsx` — Demo/HC-08D mode selection.
- `src/pages/HistoryPage.tsx` — `RAW_ONLY` result rendering.
- `src/pages/OverviewPage.tsx` — raw-only status and current transport label.
- `src/app/TopBar.tsx` — HC-08D connection feedback without fake battery data.
- `src/app/App.test.tsx` — mode switching and HC-08D page behavior.
- `src/i18n/locales/zh-CN.ts` — Chinese HC-08D copy.
- `src/i18n/locales/en-US.ts` — aligned English HC-08D copy.
- `src/theme/global.css` — real-device metrics, saturation, raw monitor, and mode controls.
- `src-tauri/Cargo.toml` — BLE, async stream, UUID, and error dependencies.
- `src-tauri/Cargo.lock` — resolved Rust dependencies.
- `src-tauri/src/lib.rs` — HC-08D module, managed state, migration, and commands.
- `docs/architecture.md` — implemented Windows BLE path.
- `docs/ble-protocol-draft.md` — actual ASCII frame and LED command draft.
- `docs/testing.md` — automated and hardware matrix.
- `README.md` — real mode setup and limitations.
- `docs/superpowers/specs/2026-07-24-hc08d-windows-ble-design.md` — mark written design approved.

## Task 1: Define and test the HC-08D protocol

**Files:**

- Create: `src/features/protocol/hc08dProtocol.ts`
- Create: `src/features/protocol/hc08dProtocol.test.ts`
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Add failing parser and encoder tests**

Create `src/features/protocol/hc08dProtocol.test.ts` with these exact behaviors:

```ts
import { describe, expect, it } from 'vitest';
import { Hc08dProtocolParser, ProtocolError, encodeHc08dLedCommand } from './hc08dProtocol';

const encoder = new TextEncoder();

describe('HC-08D ASCII protocol', () => {
  it('parses an observed frame and marks saturated fields', () => {
    const parser = new Hc08dProtocolParser();
    const messages = parser.push(
      encoder.encode('480:4428,515:13390,555:65535,CLR:65535\r\n'),
      '2026-07-24T10:00:00.000Z',
      1000,
    );

    expect(messages).toEqual([
      {
        kind: 'sample',
        frame: {
          sequence: 0,
          receivedAt: '2026-07-24T10:00:00.000Z',
          elapsedMs: 0,
          signal480: 4428,
          signal515: 13390,
          signal555: 65535,
          clearSignal: 65535,
          saturatedFields: ['555', 'CLR'],
          rawLine: '480:4428,515:13390,555:65535,CLR:65535',
        },
      },
    ]);
  });

  it('reassembles fragments and accepts CRLF', () => {
    const parser = new Hc08dProtocolParser();
    expect(parser.push(encoder.encode('480:44'), '2026-07-24T10:00:00.000Z', 1000)).toEqual([]);
    expect(
      parser.push(
        encoder.encode('28,515:13390,555:15820,CLR:65535\r\n'),
        '2026-07-24T10:00:00.500Z',
        1500,
      ),
    ).toHaveLength(1);
  });

  it('separates adjacent frames without newline by the next 480 marker', () => {
    const parser = new Hc08dProtocolParser();
    const messages = parser.push(
      encoder.encode('480:1,515:2,555:3,CLR:4' + '480:5,515:6,555:7,CLR:8'),
      '2026-07-24T10:00:00.500Z',
      1500,
    );
    expect(messages).toHaveLength(1);
    expect(parser.flush('2026-07-24T10:00:00.600Z', 1600)).toHaveLength(1);
  });

  it('rejects malformed and out-of-range frames without poisoning the buffer', () => {
    const parser = new Hc08dProtocolParser();
    expect(() =>
      parser.push(
        encoder.encode('480:1,515:2,555:3,CLR:65536\n'),
        '2026-07-24T10:00:00.000Z',
        1000,
      ),
    ).toThrow(ProtocolError);
    expect(
      parser.push(encoder.encode('480:1,515:2,555:3,CLR:4\n'), '2026-07-24T10:00:00.500Z', 1500),
    ).toHaveLength(1);
  });

  it('bounds buffered data', () => {
    const parser = new Hc08dProtocolParser(32);
    expect(() =>
      parser.push(encoder.encode('x'.repeat(33)), '2026-07-24T10:00:00.000Z', 1000),
    ).toThrowError(/PROTOCOL_BUFFER_OVERFLOW/);
  });

  it('parses fragmented firmware responses and multiple lines', () => {
    const parser = new Hc08dProtocolParser();
    expect(parser.push(encoder.encode('LED_ON_'), '2026-07-24T10:00:00.000Z', 1000)).toEqual([]);
    expect(
      parser.push(encoder.encode('OK\r\nERROR_COMMAND\r\n'), '2026-07-24T10:00:00.010Z', 1010),
    ).toEqual([
      { kind: 'command-response', response: 'LED_ON_OK', rawLine: 'LED_ON_OK' },
      {
        kind: 'command-response',
        response: 'ERROR_COMMAND',
        rawLine: 'ERROR_COMMAND',
      },
    ]);
  });

  it('encodes LED commands with exactly one CRLF terminator', () => {
    expect([...encodeHc08dLedCommand('LED_ON')]).toEqual([64, 76, 69, 68, 95, 79, 78, 13, 10]);
    expect([...encodeHc08dLedCommand('LED_OFF')]).toEqual([64, 76, 69, 68, 95, 79, 70, 70, 13, 10]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npm.cmd test -- src/features/protocol/hc08dProtocol.test.ts
```

Expected: FAIL because `hc08dProtocol.ts` does not exist.

- [ ] **Step 3: Add hardware-domain types**

Add these types to `src/domain/types.ts` and extend existing unions without weakening strict mode:

```ts
export type TransportMode = 'demo' | 'hc08d';
export type Hc08dSignalField = '480' | '515' | '555' | 'CLR';

export interface Hc08dSampleFrame {
  sequence: number;
  receivedAt: string;
  elapsedMs: number;
  signal480: number;
  signal515: number;
  signal555: number;
  clearSignal: number;
  saturatedFields: Hc08dSignalField[];
  rawLine: string;
}

export type Hc08dCommandResponse = 'LED_ON_OK' | 'LED_OFF_OK' | 'ERROR_COMMAND';

export type Hc08dProtocolMessage =
  | { kind: 'sample'; frame: Hc08dSampleFrame }
  | {
      kind: 'command-response';
      response: Hc08dCommandResponse;
      rawLine: string;
    };

export interface Hc08dCharacteristicInfo {
  serviceUuid: string;
  characteristicUuid: string;
  notify: boolean;
  indicate: boolean;
  write: boolean;
  writeWithoutResponse: boolean;
}

export interface Hc08dDiagnostics {
  serviceUuid: string | null;
  notifyCharacteristicUuid: string | null;
  writeCharacteristicUuid: string | null;
  rssi: number | null;
  latestFrameAt: string | null;
  recentRawLines: string[];
  candidates: Hc08dCharacteristicInfo[];
}

export type DeviceCommandName =
  'START' | 'STOP' | 'ZERO' | 'CALIBRATE' | 'GET_STATUS' | 'LED_ON' | 'LED_OFF';
```

Add these `DevicePacket` members:

```ts
| { kind: 'hardware-frame'; frame: Hc08dSampleFrame }
| { kind: 'diagnostics'; diagnostics: Hc08dDiagnostics }
| { kind: 'connection'; state: DeviceConnectionState }
```

Extend `DeviceConnectionState` with:

```ts
| { status: 'discovering'; device: BleDevice; generation: number }
| {
    status: 'reconnecting';
    device: BleDevice;
    generation: number;
    attempt: number;
  }
```

- [ ] **Step 4: Implement the strict parser and exact LED encoder**

Create `src/features/protocol/hc08dProtocol.ts`:

```ts
import type { Hc08dProtocolMessage, Hc08dSampleFrame, Hc08dSignalField } from '../../domain/types';

export const HC08D_PROTOCOL_VERSION = 'HC08D-ASCII-DRAFT-0.2';
const framePattern = /^480:(\d{1,5}),515:(\d{1,5}),555:(\d{1,5}),CLR:(\d{1,5})$/;

export class ProtocolError extends Error {
  constructor(
    readonly code: 'INVALID_UTF8' | 'MALFORMED_FRAME' | 'PROTOCOL_BUFFER_OVERFLOW',
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'ProtocolError';
  }
}

function parseUint16(value: string, field: Hc08dSignalField): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new ProtocolError('MALFORMED_FRAME', `${field} is outside 0..65535`);
  }
  return parsed;
}

export class Hc08dProtocolParser {
  private buffer = '';
  private sequence = 0;
  private startedAtMs: number | null = null;

  constructor(private readonly maximumBufferedBytes = 8192) {}

  push(chunk: Uint8Array, receivedAt: string, receivedAtMs: number): Hc08dProtocolMessage[] {
    let decoded: string;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(chunk);
    } catch {
      throw new ProtocolError('INVALID_UTF8', 'notification is not UTF-8');
    }
    this.buffer += decoded;
    if (new TextEncoder().encode(this.buffer).byteLength > this.maximumBufferedBytes) {
      this.buffer = '';
      throw new ProtocolError('PROTOCOL_BUFFER_OVERFLOW', 'receive buffer exceeded its limit');
    }

    const messages: Hc08dProtocolMessage[] = [];
    while (true) {
      const newline = this.buffer.indexOf('\n');
      const nextStart = this.buffer.indexOf('480:', 4);
      const boundary =
        newline >= 0 && (nextStart < 0 || newline < nextStart) ? newline + 1 : nextStart;
      if (boundary <= 0) break;
      const raw = this.buffer.slice(0, boundary).replace(/[\r\n]+$/u, '');
      this.buffer = this.buffer.slice(boundary);
      if (raw.length > 0) messages.push(this.parseLine(raw, receivedAt, receivedAtMs));
    }
    return messages;
  }

  flush(receivedAt: string, receivedAtMs: number): Hc08dProtocolMessage[] {
    const raw = this.buffer.replace(/[\r\n]+$/u, '');
    this.buffer = '';
    return raw.length === 0 ? [] : [this.parseLine(raw, receivedAt, receivedAtMs)];
  }

  reset(): void {
    this.buffer = '';
    this.sequence = 0;
    this.startedAtMs = null;
  }

  private parseLine(
    rawLine: string,
    receivedAt: string,
    receivedAtMs: number,
  ): Hc08dProtocolMessage {
    if (rawLine === 'LED_ON_OK' || rawLine === 'LED_OFF_OK' || rawLine === 'ERROR_COMMAND') {
      return { kind: 'command-response', response: rawLine, rawLine };
    }
    const match = framePattern.exec(rawLine);
    if (!match) throw new ProtocolError('MALFORMED_FRAME', rawLine);
    const signal480 = parseUint16(match[1]!, '480');
    const signal515 = parseUint16(match[2]!, '515');
    const signal555 = parseUint16(match[3]!, '555');
    const clearSignal = parseUint16(match[4]!, 'CLR');
    this.startedAtMs ??= receivedAtMs;
    const saturatedFields: Hc08dSignalField[] = [];
    if (signal480 === 65535) saturatedFields.push('480');
    if (signal515 === 65535) saturatedFields.push('515');
    if (signal555 === 65535) saturatedFields.push('555');
    if (clearSignal === 65535) saturatedFields.push('CLR');
    return {
      kind: 'sample',
      frame: {
        sequence: this.sequence++,
        receivedAt,
        elapsedMs: receivedAtMs - this.startedAtMs,
        signal480,
        signal515,
        signal555,
        clearSignal,
        saturatedFields,
        rawLine,
      },
    };
  }
}

export function encodeHc08dLedCommand(command: 'LED_ON' | 'LED_OFF'): Uint8Array {
  return new TextEncoder().encode(command === 'LED_ON' ? '@LED_ON\r\n' : '@LED_OFF\r\n');
}
```

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
npm.cmd test -- src/features/protocol/hc08dProtocol.test.ts
npm.cmd run typecheck
```

Expected: parser tests PASS and typecheck PASS after all affected exhaustiveness sites are updated or temporarily narrowed in the same step.

- [ ] **Step 6: Commit the protocol unit**

```powershell
git add -- src/domain/types.ts src/features/protocol/hc08dProtocol.ts src/features/protocol/hc08dProtocol.test.ts
git commit -m "feat(protocol): parse HC-08D fluorescence frames"
```

## Task 2: Add and test adaptive GATT characteristic selection

**Files:**

- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/hc08d/types.rs`
- Create: `src-tauri/src/hc08d/selection.rs`
- Create: `src-tauri/src/hc08d/mod.rs`

- [ ] **Step 1: Add Rust BLE dependencies**

Add to `[dependencies]` in `src-tauri/Cargo.toml`:

```toml
btleplug = "0.12.0"
futures-util = "0.3"
thiserror = "2"
tokio = { version = "1", features = ["sync", "time"] }
uuid = { version = "1", features = ["serde"] }
```

- [ ] **Step 2: Write failing selection tests**

Create `src-tauri/src/hc08d/selection.rs` with the test module first:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::hc08d::types::CharacteristicInfo;

    fn characteristic(
        service: &str,
        characteristic: &str,
        notify: bool,
        write: bool,
    ) -> CharacteristicInfo {
        CharacteristicInfo {
            service_uuid: service.to_string(),
            characteristic_uuid: characteristic.to_string(),
            notify,
            indicate: false,
            write,
            write_without_response: false,
        }
    }

    #[test]
    fn prefers_factory_ffe0_ffe1() {
        let candidates = vec![
            characteristic("1234", "5678", true, true),
            characteristic("ffe0", "ffe1", true, true),
        ];
        let selection = select_characteristics(&candidates).unwrap();
        assert_eq!(selection.notify_characteristic_uuid, "ffe1");
        assert_eq!(selection.write_characteristic_uuid, "ffe1");
    }

    #[test]
    fn accepts_a_unique_split_pair_in_one_service() {
        let candidates = vec![
            characteristic("1234", "1001", true, false),
            characteristic("1234", "1002", false, true),
        ];
        let selection = select_characteristics(&candidates).unwrap();
        assert_eq!(selection.notify_characteristic_uuid, "1001");
        assert_eq!(selection.write_characteristic_uuid, "1002");
    }

    #[test]
    fn rejects_ambiguous_pairs() {
        let candidates = vec![
            characteristic("1234", "1001", true, true),
            characteristic("1234", "1002", true, true),
        ];
        assert_eq!(
            select_characteristics(&candidates),
            Err(SelectionError::Ambiguous(candidates))
        );
    }
}
```

Create `src-tauri/src/hc08d/mod.rs`:

```rust
pub mod selection;
pub mod types;
```

Temporarily add `mod hc08d;` to `src-tauri/src/lib.rs` so the tests compile.

- [ ] **Step 3: Run the Rust test and verify failure**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml hc08d::selection
```

Expected: FAIL because `CharacteristicInfo`, `Selection`, `SelectionError`, and `select_characteristics` are not implemented.

- [ ] **Step 4: Add serializable GATT types**

Create `src-tauri/src/hc08d/types.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacteristicInfo {
    pub service_uuid: String,
    pub characteristic_uuid: String,
    pub notify: bool,
    pub indicate: bool,
    pub write: bool,
    pub write_without_response: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacteristicSelection {
    pub service_uuid: String,
    pub notify_characteristic_uuid: String,
    pub write_characteristic_uuid: String,
    pub write_with_response: bool,
}
```

- [ ] **Step 5: Implement deterministic adaptive selection**

Add to `src-tauri/src/hc08d/selection.rs` above the tests:

```rust
use crate::hc08d::types::{CharacteristicInfo, CharacteristicSelection};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SelectionError {
    Missing,
    Ambiguous(Vec<CharacteristicInfo>),
}

fn can_notify(item: &CharacteristicInfo) -> bool {
    item.notify || item.indicate
}

fn can_write(item: &CharacteristicInfo) -> bool {
    item.write || item.write_without_response
}

fn matches_bluetooth_uuid(value: &str, short: &str) -> bool {
    let normalized = value.to_ascii_lowercase().replace('-', "");
    normalized == short || normalized == format!("0000{short}00001000800000805f9b34fb")
}

pub fn select_characteristics(
    items: &[CharacteristicInfo],
) -> Result<CharacteristicSelection, SelectionError> {
    if let Some(factory) = items.iter().find(|item| {
        matches_bluetooth_uuid(&item.service_uuid, "ffe0")
            && matches_bluetooth_uuid(&item.characteristic_uuid, "ffe1")
            && can_notify(item)
            && can_write(item)
    }) {
        return Ok(CharacteristicSelection {
            service_uuid: factory.service_uuid.clone(),
            notify_characteristic_uuid: factory.characteristic_uuid.clone(),
            write_characteristic_uuid: factory.characteristic_uuid.clone(),
            write_with_response: factory.write,
        });
    }

    let duplex: Vec<_> = items
        .iter()
        .filter(|item| can_notify(item) && can_write(item))
        .collect();
    if duplex.len() == 1 {
        let item = duplex[0];
        return Ok(CharacteristicSelection {
            service_uuid: item.service_uuid.clone(),
            notify_characteristic_uuid: item.characteristic_uuid.clone(),
            write_characteristic_uuid: item.characteristic_uuid.clone(),
            write_with_response: item.write,
        });
    }
    if duplex.len() > 1 {
        return Err(SelectionError::Ambiguous(
            duplex.into_iter().cloned().collect(),
        ));
    }

    let mut split_pairs = Vec::new();
    for notify in items.iter().filter(|item| can_notify(item)) {
        for write in items
            .iter()
            .filter(|item| can_write(item) && item.service_uuid == notify.service_uuid)
        {
            split_pairs.push((notify, write));
        }
    }
    if split_pairs.len() == 1 {
        let (notify, write) = split_pairs[0];
        return Ok(CharacteristicSelection {
            service_uuid: notify.service_uuid.clone(),
            notify_characteristic_uuid: notify.characteristic_uuid.clone(),
            write_characteristic_uuid: write.characteristic_uuid.clone(),
            write_with_response: write.write,
        });
    }
    if split_pairs.len() > 1 {
        return Err(SelectionError::Ambiguous(items.to_vec()));
    }
    Err(SelectionError::Missing)
}
```

- [ ] **Step 6: Run Rust tests and formatting**

Run:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml hc08d::selection
```

Expected: formatting PASS and three selection tests PASS.

- [ ] **Step 7: Commit the selection unit**

```powershell
git add -- src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/hc08d
git commit -m "feat(ble): select HC-08D GATT characteristics"
```

## Task 3: Implement the native Windows BLE runtime

**Files:**

- Create: `src-tauri/src/hc08d/runtime.rs`
- Modify: `src-tauri/src/hc08d/mod.rs`
- Modify: `src-tauri/src/hc08d/types.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add failing tests for name matching and error mapping**

Add pure helpers and tests to `src-tauri/src/hc08d/runtime.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_supported_hc08_names() {
        for name in ["HC-08", "HC08", "HC-08D", "hc08d"] {
            assert!(is_hc08_name(name), "{name}");
        }
        assert!(!is_hc08_name("HC-05"));
        assert!(!is_hc08_name("sensor"));
    }

    #[test]
    fn retries_only_unexpected_disconnects() {
        assert_eq!(reconnect_delays(false), vec![1_000, 2_000, 4_000]);
        assert!(reconnect_delays(true).is_empty());
    }
}
```

- [ ] **Step 2: Run the focused Rust tests and verify failure**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml hc08d::runtime
```

Expected: FAIL because the runtime helpers do not exist.

- [ ] **Step 3: Add native event and command payload types**

Extend `src-tauri/src/hc08d/types.rs` with:

```rust
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BleDeviceInfo {
    pub id: String,
    pub name: String,
    pub rssi: Option<i16>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPayload {
    pub generation: u64,
    pub device_id: String,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionPayload {
    pub generation: u64,
    pub device: BleDeviceInfo,
    pub status: String,
    pub attempt: Option<u8>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BleErrorPayload {
    pub generation: u64,
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub generation: u64,
    pub device: BleDeviceInfo,
    pub selection: CharacteristicSelection,
    pub candidates: Vec<CharacteristicInfo>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectCharacteristicsRequest {
    pub device_id: String,
    pub service_uuid: String,
    pub notify_characteristic_uuid: String,
    pub write_characteristic_uuid: String,
}
```

- [ ] **Step 4: Implement the runtime state and resource lifecycle**

Implement `src-tauri/src/hc08d/runtime.rs` with these concrete responsibilities:

```rust
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};

use btleplug::{
    api::{
        Central, CentralEvent, CharPropFlags, Manager as _, Peripheral as _, ScanFilter,
        ValueNotification, WriteType,
    },
    platform::{Adapter, Manager, Peripheral, PeripheralId},
};
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};
use tokio::{sync::Mutex, task::JoinHandle};
use uuid::Uuid;

use crate::hc08d::{
    selection::{select_characteristics, SelectionError},
    types::{
        BleDeviceInfo, BleErrorPayload, CharacteristicInfo, CharacteristicSelection,
        ConnectResult, ConnectionPayload, NotificationPayload,
    },
};

const SCAN_DURATION: Duration = Duration::from_secs(8);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

pub fn is_hc08_name(name: &str) -> bool {
    let compact = name.trim().to_ascii_uppercase().replace([' ', '-'], "");
    compact == "HC08" || compact == "HC08D"
}

pub fn reconnect_delays(requested: bool) -> Vec<u64> {
    if requested {
        Vec::new()
    } else {
        vec![1_000, 2_000, 4_000]
    }
}

#[derive(Default)]
struct RuntimeInner {
    adapter: Option<Adapter>,
    peripherals: HashMap<String, Peripheral>,
    connected: Option<Peripheral>,
    connected_device: Option<BleDeviceInfo>,
    selection: Option<CharacteristicSelection>,
    candidates: Vec<CharacteristicInfo>,
    notification_task: Option<JoinHandle<()>>,
    central_event_task: Option<JoinHandle<()>>,
    requested_disconnect: bool,
}

#[derive(Clone, Default)]
pub struct Hc08dRuntime {
    inner: Arc<Mutex<RuntimeInner>>,
    generation: Arc<AtomicU64>,
    scan_cancelled: Arc<AtomicBool>,
}
```

Implement methods with the following exact public surface:

```rust
impl Hc08dRuntime {
    pub async fn scan(&self) -> Result<Vec<BleDeviceInfo>, String>;
    pub async fn stop_scan(&self) -> Result<(), String>;
    pub async fn connect(
        &self,
        app: AppHandle,
        device_id: String,
    ) -> Result<ConnectResult, String>;
    pub async fn select_characteristics(
        &self,
        app: AppHandle,
        request: SelectCharacteristicsRequest,
    ) -> Result<ConnectResult, String>;
    pub async fn write(&self, bytes: Vec<u8>) -> Result<(), String>;
    pub async fn disconnect(&self, requested: bool) -> Result<(), String>;
}
```

The method bodies must:

- initialize the first adapter returned by `Manager::new().await?.adapters().await?`;
- use `start_scan(ScanFilter::default())`, wait in 100 ms cancellable intervals up to 8 seconds, then `stop_scan`;
- read peripheral properties and retain only `is_hc08_name(local_name)`;
- use the display-safe `PeripheralId` string as the runtime ID and cache the actual `Peripheral`;
- call `connect_with_timeout(CONNECT_TIMEOUT)` and `discover_services_with_timeout(CONNECT_TIMEOUT)`;
- convert characteristic properties into `CharacteristicInfo`;
- call `select_characteristics`;
- subscribe to the selected notification characteristic;
- spawn a notification stream that emits `ble://notification` with `NotificationPayload`;
- spawn a central-event stream that emits `ble://disconnected` for the connected `PeripheralId`;
- choose `WriteType::WithResponse` when the selected characteristic supports `WRITE`, otherwise `WithoutResponse`;
- abort tasks, unsubscribe, disconnect, clear handles, and increment generation during cleanup.

No method may decode fluorescence data or log a MAC address.

- [ ] **Step 5: Expose typed Tauri commands**

Replace `src-tauri/src/hc08d/mod.rs` with command wrappers:

```rust
pub mod runtime;
pub mod selection;
pub mod types;

use tauri::{AppHandle, State};

use runtime::Hc08dRuntime;
use types::{BleDeviceInfo, ConnectResult, SelectCharacteristicsRequest};

#[tauri::command]
pub async fn ble_scan_start(
    runtime: State<'_, Hc08dRuntime>,
) -> Result<Vec<BleDeviceInfo>, String> {
    runtime.scan().await
}

#[tauri::command]
pub async fn ble_scan_stop(runtime: State<'_, Hc08dRuntime>) -> Result<(), String> {
    runtime.stop_scan().await
}

#[tauri::command]
pub async fn ble_connect(
    app: AppHandle,
    runtime: State<'_, Hc08dRuntime>,
    device_id: String,
) -> Result<ConnectResult, String> {
    runtime.connect(app, device_id).await
}

#[tauri::command]
pub async fn ble_select_characteristics(
    app: AppHandle,
    runtime: State<'_, Hc08dRuntime>,
    request: SelectCharacteristicsRequest,
) -> Result<ConnectResult, String> {
    runtime.select_characteristics(app, request).await
}

#[tauri::command]
pub async fn ble_write(
    runtime: State<'_, Hc08dRuntime>,
    bytes: Vec<u8>,
) -> Result<(), String> {
    runtime.write(bytes).await
}

#[tauri::command]
pub async fn ble_disconnect(
    runtime: State<'_, Hc08dRuntime>,
    requested: bool,
) -> Result<(), String> {
    runtime.disconnect(requested).await
}
```

- [ ] **Step 6: Register the runtime in Tauri**

In `src-tauri/src/lib.rs`:

```rust
mod hc08d;

use hc08d::runtime::Hc08dRuntime;
```

Add `.manage(Hc08dRuntime::default())` to the builder and add these commands to `generate_handler!`:

```rust
hc08d::ble_scan_start,
hc08d::ble_scan_stop,
hc08d::ble_connect,
hc08d::ble_select_characteristics,
hc08d::ble_write,
hc08d::ble_disconnect,
```

Update `runtime_status()` to report `demo_only: false` and `real_hardware_configured: true`.

- [ ] **Step 7: Run native checks**

Run:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Expected: all Rust tests PASS and Clippy reports no warnings.

- [ ] **Step 8: Commit the native runtime**

```powershell
git add -- src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/hc08d
git commit -m "feat(ble): add Windows HC-08D runtime"
```

## Task 4: Bridge Tauri BLE into the TypeScript transport contract

**Files:**

- Create: `src/features/transport/tauriBleApi.ts`
- Create: `src/features/transport/Hc08dBleTransport.ts`
- Create: `src/features/transport/Hc08dBleTransport.test.ts`
- Create: `src/features/transport/SwitchableBleTransport.ts`
- Create: `src/features/transport/SwitchableBleTransport.test.ts`
- Modify: `src/features/transport/BleTransport.ts`

- [ ] **Step 1: Write failing HC-08D transport tests**

Use an injected fake API in `src/features/transport/Hc08dBleTransport.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevicePacket } from '../../domain/types';
import { Hc08dBleTransport } from './Hc08dBleTransport';
import type { NativeBleApi, NativeBleEventMap } from './tauriBleApi';

class FakeNativeBleApi implements NativeBleApi {
  writes: number[][] = [];
  listeners = new Map<keyof NativeBleEventMap, Set<(payload: never) => void>>();

  scan = vi.fn(async () => [{ id: 'hc08d-1', name: 'HC-08D', rssi: -48 }]);
  stopScan = vi.fn(async () => undefined);
  connect = vi.fn(async () => ({
    generation: 1,
    device: { id: 'hc08d-1', name: 'HC-08D', rssi: -48 },
    selection: {
      serviceUuid: 'ffe0',
      notifyCharacteristicUuid: 'ffe1',
      writeCharacteristicUuid: 'ffe1',
      writeWithResponse: true,
    },
    candidates: [],
  }));
  selectCharacteristics = vi.fn(async () => this.connect('hc08d-1'));
  disconnect = vi.fn(async () => undefined);
  write = vi.fn(async (bytes: number[]) => {
    this.writes.push(bytes);
  });

  async listen<K extends keyof NativeBleEventMap>(
    event: K,
    listener: (payload: NativeBleEventMap[K]) => void,
  ): Promise<() => void> {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener as (payload: never) => void);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener as (payload: never) => void);
  }

  emit<K extends keyof NativeBleEventMap>(event: K, payload: NativeBleEventMap[K]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload as never);
  }
}

describe('Hc08dBleTransport', () => {
  afterEach(() => vi.useRealTimers());

  it('scans, connects and emits parsed hardware frames', async () => {
    vi.useFakeTimers();
    const api = new FakeNativeBleApi();
    const transport = new Hc08dBleTransport(api);
    const packets: DevicePacket[] = [];
    transport.subscribe((packet) => packets.push(packet));
    const [device] = await transport.scan();
    await transport.connect(device!.id);

    api.emit('ble://notification', {
      generation: 1,
      deviceId: device!.id,
      bytes: [...new TextEncoder().encode('480:1,515:2,555:3,CLR:4\n')],
    });

    expect(packets).toContainEqual({
      kind: 'hardware-frame',
      frame: expect.objectContaining({
        signal480: 1,
        signal515: 2,
        signal555: 3,
        clearSignal: 4,
      }),
    });
    transport.dispose();
  });

  it('writes exact CRLF LED bytes and waits for the matching firmware response', async () => {
    vi.useFakeTimers();
    const api = new FakeNativeBleApi();
    const transport = new Hc08dBleTransport(api);
    const packets: DevicePacket[] = [];
    transport.subscribe((packet) => packets.push(packet));
    const [device] = await transport.scan();
    await transport.connect(device!.id);
    const pending = transport.sendCommand({
      id: 'led-on',
      name: 'LED_ON',
      issuedAt: new Date().toISOString(),
    });
    await Promise.resolve();
    expect(api.writes).toEqual([[64, 76, 69, 68, 95, 79, 78, 13, 10]]);
    api.emit('ble://notification', {
      generation: 1,
      deviceId: device!.id,
      bytes: [...new TextEncoder().encode('LED_ON_OK\r\n')],
    });
    await pending;
    expect(packets).toContainEqual({
      kind: 'acknowledgement',
      acknowledgement: expect.objectContaining({
        commandId: 'led-on',
        status: 'completed',
      }),
    });
    transport.dispose();
  });

  it('rejects ERROR_COMMAND and times out after two seconds without a response', async () => {
    vi.useFakeTimers();
    const api = new FakeNativeBleApi();
    const transport = new Hc08dBleTransport(api);
    const [device] = await transport.scan();
    await transport.connect(device!.id);

    const rejected = transport.sendCommand({
      id: 'led-off',
      name: 'LED_OFF',
      issuedAt: new Date().toISOString(),
    });
    await Promise.resolve();
    api.emit('ble://notification', {
      generation: 1,
      deviceId: device!.id,
      bytes: [...new TextEncoder().encode('ERROR_COMMAND\r\n')],
    });
    await expect(rejected).rejects.toMatchObject({ code: 'DEVICE_COMMAND_REJECTED' });

    const timedOut = transport.sendCommand({
      id: 'led-on-2',
      name: 'LED_ON',
      issuedAt: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(timedOut).rejects.toMatchObject({ code: 'COMMAND_RESPONSE_TIMEOUT' });
    transport.dispose();
  });
});
```

- [ ] **Step 2: Run transport tests and verify failure**

Run:

```powershell
npm.cmd test -- src/features/transport/Hc08dBleTransport.test.ts
```

Expected: FAIL because the transport and native API files do not exist.

- [ ] **Step 3: Implement the typed Tauri API**

Create `src/features/transport/tauriBleApi.ts` with typed payloads and a production adapter:

```ts
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Hc08dCharacteristicInfo } from '../../domain/types';

export interface NativeDevice {
  id: string;
  name: string;
  rssi: number | null;
}

export interface NativeConnectResult {
  generation: number;
  device: NativeDevice;
  selection: {
    serviceUuid: string;
    notifyCharacteristicUuid: string;
    writeCharacteristicUuid: string;
    writeWithResponse: boolean;
  };
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
    status: string;
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
  scan: () => invoke('ble_scan_start'),
  stopScan: () => invoke('ble_scan_stop'),
  connect: (deviceId) => invoke('ble_connect', { deviceId }),
  selectCharacteristics: (request) => invoke('ble_select_characteristics', { request }),
  disconnect: (requested) => invoke('ble_disconnect', { requested }),
  write: (bytes) => invoke('ble_write', { bytes }),
  listen: async (event, listener) => listen(event, ({ payload }) => listener(payload)),
};
```

- [ ] **Step 4: Implement `Hc08dBleTransport`**

The class must:

- expose scanned native devices as `BleDevice` with `isDemo: false`;
- set connection states for scanning, connecting, discovering, connected, and reconnecting;
- subscribe to all native events once;
- feed notification bytes into `Hc08dProtocolParser`;
- schedule `parser.flush()` 100 ms after the latest bytes;
- emit `hardware-frame`, acknowledgement, error, and diagnostics packets;
- retain the last 200 raw lines or 64 KiB;
- emit recoverable `DATA_STALE` after 1.5 seconds without a complete frame;
- reconnect after unexpected disconnect at 1, 2, and 4 seconds;
- never reconnect after an explicit `disconnect`;
- accept only `LED_ON` and `LED_OFF` in real mode;
- append exactly one `\r\n`, allow only one outstanding LED command, and wait up to 2 seconds for the matching `LED_ON_OK` or `LED_OFF_OK` response;
- reject `ERROR_COMMAND`, mismatched responses, concurrent commands, and response timeouts with distinct technical codes;
- clear timers, event listeners, parser state, and native resources in `dispose`.

Use this public constructor and surface:

```ts
export class Hc08dBleTransport implements BleTransport {
  constructor(private readonly api: NativeBleApi = tauriBleApi) {}
  scan(): Promise<BleDevice[]>;
  stopScan(): Promise<void>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  sendCommand(command: DeviceCommand): Promise<void>;
  subscribe(listener: (packet: DevicePacket) => void): () => void;
  getConnectionState(): DeviceConnectionState;
  selectCharacteristics(selection: {
    serviceUuid: string;
    notifyCharacteristicUuid: string;
    writeCharacteristicUuid: string;
  }): Promise<void>;
  dispose(): void;
}
```

- [ ] **Step 5: Write switchable transport tests**

In `src/features/transport/SwitchableBleTransport.test.ts`, use two minimal fake transports and assert:

```ts
it('disconnects and disposes the previous transport when modes change', async () => {
  const demo = fakeTransport();
  const hc08d = fakeTransport();
  const transport = new SwitchableBleTransport({ demo, hc08d }, 'demo');
  await transport.setMode('hc08d');
  expect(demo.disconnect).toHaveBeenCalledOnce();
  expect(demo.dispose).toHaveBeenCalledOnce();
  expect(transport.mode).toBe('hc08d');
});
```

- [ ] **Step 6: Implement `SwitchableBleTransport`**

Create a class that delegates the full `BleTransport` interface to the current implementation and resubscribes its listeners after switching:

```ts
export class SwitchableBleTransport implements BleTransport {
  private active: BleTransport;
  private listeners = new Set<(packet: DevicePacket) => void>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly transports: Record<TransportMode, BleTransport>,
    public mode: TransportMode,
  ) {
    this.active = transports[mode];
    this.bind();
  }

  async setMode(mode: TransportMode): Promise<void> {
    if (mode === this.mode) return;
    this.unsubscribe?.();
    await this.active.disconnect();
    this.active.dispose();
    this.mode = mode;
    this.active = this.transports[mode];
    this.bind();
  }

  scan(): Promise<BleDevice[]> {
    return this.active.scan();
  }

  stopScan(): Promise<void> {
    return this.active.stopScan();
  }

  connect(deviceId: string): Promise<void> {
    return this.active.connect(deviceId);
  }

  disconnect(): Promise<void> {
    return this.active.disconnect();
  }

  sendCommand(command: DeviceCommand): Promise<void> {
    return this.active.sendCommand(command);
  }

  subscribe(listener: (packet: DevicePacket) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getConnectionState(): DeviceConnectionState {
    return this.active.getConnectionState();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.active.dispose();
    this.listeners.clear();
  }

  private bind(): void {
    this.unsubscribe = this.active.subscribe((packet) => {
      for (const listener of this.listeners) listener(packet);
    });
  }
}
```

- [ ] **Step 7: Run focused transport tests**

Run:

```powershell
npm.cmd test -- src/features/transport/Hc08dBleTransport.test.ts src/features/transport/SwitchableBleTransport.test.ts
npm.cmd run typecheck
```

Expected: all transport tests and typecheck PASS.

- [ ] **Step 8: Commit the bridge**

```powershell
git add -- src/features/transport src/features/protocol src/domain/types.ts
git commit -m "feat(ble): bridge HC-08D into desktop transport"
```

## Task 5: Add raw-only hardware records and persistence

**Files:**

- Modify: `src/domain/types.ts`
- Create: `src-tauri/migrations/0002_hc08d_frames.sql`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/features/persistence/historyRepository.ts`
- Modify: `src/features/persistence/historyRepository.test.ts`
- Modify: `src/features/export/exportRecord.ts`
- Modify: `src/features/export/exportRecord.test.ts`

- [ ] **Step 1: Write failing raw-record repository and export tests**

Add this fixture to both persistence and export tests:

```ts
const hardwareRecord: HistoryRecord = {
  id: 'record-hc08d-1',
  sampleId: 'sample-hc08d-1',
  createdAt: '2026-07-24T10:00:00.000Z',
  origin: 'real-live',
  isDemo: false,
  resultStatus: 'RAW_ONLY',
  qualityGrade: null,
  syncState: 'local-only',
  result: {
    schemaVersion: 1,
    sessionId: 'session-hc08d-1',
    sampleId: 'sample-hc08d-1',
    resultStatus: 'RAW_ONLY',
    frames: [
      {
        sequence: 0,
        receivedAt: '2026-07-24T10:00:00.000Z',
        elapsedMs: 0,
        signal480: 4428,
        signal515: 13390,
        signal555: 65535,
        clearSignal: 65535,
        saturatedFields: ['555', 'CLR'],
        rawLine: '480:4428,515:13390,555:65535,CLR:65535',
      },
    ],
    protocolVersion: 'HC08D-ASCII-DRAFT-0.2',
    algorithmVersion: null,
    calibrationVersion: null,
    isDemo: false,
    disclaimer: 'Raw hardware data; no scientific analysis applied.',
  },
};
```

Persistence assertion:

```ts
await repository.upsert(hardwareRecord);
expect(await repository.load()).toEqual([hardwareRecord]);
```

Export assertion must call an exported pure `recordToCsv(hardwareRecord)` and check the header and frame values:

```ts
expect(recordToCsv(hardwareRecord)).toContain(
  'sequence,receivedAt,elapsedMs,signal480,signal515,signal555,clearSignal',
);
expect(recordToCsv(hardwareRecord)).toContain(
  '0,2026-07-24T10:00:00.000Z,0,4428,13390,65535,65535',
);
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```powershell
npm.cmd test -- src/features/persistence/historyRepository.test.ts src/features/export/exportRecord.test.ts
```

Expected: FAIL because `RAW_ONLY`, frames, and `recordToCsv` are unsupported.

- [ ] **Step 3: Add the raw result union**

Add to `src/domain/types.ts`:

```ts
export interface HardwareRawResult {
  schemaVersion: 1;
  sessionId: string;
  sampleId: string;
  resultStatus: 'RAW_ONLY';
  frames: Hc08dSampleFrame[];
  protocolVersion: 'HC08D-ASCII-DRAFT-0.2';
  algorithmVersion: null;
  calibrationVersion: null;
  isDemo: false;
  disclaimer: string;
}

export type RecordResult = AnalysisResult | HardwareRawResult;
```

Change `HistoryRecord` to:

```ts
export interface HistoryRecord {
  id: string;
  sampleId: string;
  createdAt: string;
  origin: DataOrigin;
  isDemo: boolean;
  resultStatus: RecordResult['resultStatus'];
  qualityGrade: string | null;
  syncState: SyncState;
  result: RecordResult;
}
```

- [ ] **Step 4: Add the SQLite migration**

Create `src-tauri/migrations/0002_hc08d_frames.sql`:

```sql
CREATE TABLE IF NOT EXISTS hc08d_frames (
  record_id TEXT NOT NULL REFERENCES detection_records(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  elapsed_ms REAL NOT NULL,
  signal_480 INTEGER NOT NULL CHECK (signal_480 BETWEEN 0 AND 65535),
  signal_515 INTEGER NOT NULL CHECK (signal_515 BETWEEN 0 AND 65535),
  signal_555 INTEGER NOT NULL CHECK (signal_555 BETWEEN 0 AND 65535),
  clear_signal INTEGER NOT NULL CHECK (clear_signal BETWEEN 0 AND 65535),
  saturation_mask INTEGER NOT NULL,
  raw_line TEXT NOT NULL,
  PRIMARY KEY (record_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_hc08d_frames_record_elapsed
  ON hc08d_frames(record_id, elapsed_ms);
```

Register migration version 2 in `src-tauri/src/lib.rs`:

```rust
Migration {
    version: 2,
    description: "store raw HC-08D fluorescence frames",
    sql: include_str!("../migrations/0002_hc08d_frames.sql"),
    kind: MigrationKind::Up,
},
```

- [ ] **Step 5: Validate and persist raw-only records**

In `historyRepository.ts`:

- rename `isAnalysisResult` to `isRecordResult`;
- accept `RAW_ONLY` only when `isDemo === false`, versions are null as specified, and every frame passes strict scalar checks;
- include `RAW_ONLY` in the typed row status;
- delete old `hc08d_frames` during upsert;
- insert each raw frame with saturation mask bits `480=1`, `515=2`, `555=4`, `CLR=8`;
- skip `channel_samples` insertion for `RAW_ONLY`;
- keep the entire record JSON as the sync payload.

Use an explicit helper:

```ts
function saturationMask(frame: Hc08dSampleFrame): number {
  return frame.saturatedFields.reduce((mask, field) => {
    const bit = field === '480' ? 1 : field === '515' ? 2 : field === '555' ? 4 : 8;
    return mask | bit;
  }, 0);
}
```

- [ ] **Step 6: Export raw frames without inventing analysis fields**

Export `recordToCsv` from `exportRecord.ts`. For `RAW_ONLY`, use:

```ts
const header = [
  'recordId',
  'sampleId',
  'sequence',
  'receivedAt',
  'elapsedMs',
  'signal480',
  'signal515',
  'signal555',
  'clearSignal',
  'saturatedFields',
  'protocolVersion',
  'isDemo',
];
```

For Demo/import results, preserve the current channel CSV output.

- [ ] **Step 7: Run persistence/export tests and typecheck**

Run:

```powershell
npm.cmd test -- src/features/persistence/historyRepository.test.ts src/features/export/exportRecord.test.ts
npm.cmd run typecheck
```

Expected: tests and typecheck PASS.

- [ ] **Step 8: Commit raw persistence**

```powershell
git add -- src/domain/types.ts src/features/persistence src/features/export src-tauri/migrations/0002_hc08d_frames.sql src-tauri/src/lib.rs
git commit -m "feat(history): store raw HC-08D sessions"
```

## Task 6: Integrate real mode into Zustand application behavior

**Files:**

- Modify: `src/store/appStore.ts`
- Create: `src/store/appStore.hc08d.test.ts`
- Modify: `src/features/detection/stateMachine.ts`
- Modify: `src/features/detection/stateMachine.test.ts`

- [ ] **Step 1: Write failing store behavior tests**

Extract a `createAppStore(transport)` factory from `appStore.ts` while continuing to export the singleton `useAppStore`. Test the factory with a fake switchable transport:

```ts
it('starts and stops a real session locally without sending START or STOP', async () => {
  const transport = fakeSwitchableTransport('hc08d');
  const store = createAppStore(transport);
  store.setState({
    connection: connectedHardwareState(),
    detectionState: 'ready',
    sampleId: 'HC08D-001',
  });

  await store.getState().startDetection();
  transport.emit({
    kind: 'hardware-frame',
    frame: hardwareFrame(0),
  });
  await store.getState().stopDetection();

  expect(transport.sendCommand).not.toHaveBeenCalledWith(
    expect.objectContaining({ name: 'START' }),
  );
  expect(transport.sendCommand).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'STOP' }));
  expect(store.getState().latestRecord?.resultStatus).toBe('RAW_ONLY');
});

it('sends only the supported LED commands in real mode', async () => {
  const transport = fakeSwitchableTransport('hc08d');
  const store = createAppStore(transport);
  store.setState({
    connection: connectedHardwareState(),
    detectionState: 'ready',
  });
  await store.getState().setLed(true);
  await store.getState().setLed(false);
  expect(transport.sendCommand).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ name: 'LED_ON' }),
  );
  expect(transport.sendCommand).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ name: 'LED_OFF' }),
  );
});
```

- [ ] **Step 2: Run the focused store test and verify failure**

Run:

```powershell
npm.cmd test -- src/store/appStore.hc08d.test.ts
```

Expected: FAIL because the store is not injectable and has no hardware actions.

- [ ] **Step 3: Add explicit real-mode state**

Add to `AppState`:

```ts
transportMode: TransportMode;
hardwareFrames: Hc08dSampleFrame[];
clearSignal: number | null;
latestFrameAt: string | null;
hardwareDiagnostics: Hc08dDiagnostics;
latestRecord: HistoryRecord | null;
setTransportMode: (mode: TransportMode) => Promise<void>;
setLed: (enabled: boolean) => Promise<void>;
selectHardwareCharacteristics: (selection: {
  serviceUuid: string;
  notifyCharacteristicUuid: string;
  writeCharacteristicUuid: string;
}) => Promise<void>;
```

Persist the selected mode under `fluorescence-desktop.transport-mode.v1`; default to Demo when local storage is absent or invalid.

- [ ] **Step 4: Refactor store creation for dependency injection**

Use:

```ts
export function createAppStore(transport: SwitchableBleTransport) {
  return create<AppState>()((set, get) => createAppState(transport, set, get));
}

const runtimeTransport = new SwitchableBleTransport(
  {
    demo: new MockBleTransport(),
    hc08d: new Hc08dBleTransport(),
  },
  persistedTransportMode(),
);

export const useAppStore = createAppStore(runtimeTransport);
```

Move the current state initializer into a typed `createAppState` helper receiving the injected transport, `set`, and `get`. Preserve the existing hook surface, selectors, `.getState()`, `.setState()`, and tests.

- [ ] **Step 5: Map hardware frames without fake background**

On `hardware-frame`:

- append to `hardwareFrames`, retaining the latest 3,600 frames in memory;
- set `clearSignal` and `latestFrameAt`;
- append three chart samples with `rawSignal` equal to 480/515/555 and `background: 0`;
- mark these samples as raw display data through the transport mode; do not call `analyze`;
- keep a single frame sequence across all three channels.

On stop in HC-08D mode, construct:

```ts
const result: HardwareRawResult = {
  schemaVersion: 1,
  sessionId,
  sampleId: state.sampleId,
  resultStatus: 'RAW_ONLY',
  frames: state.hardwareFrames,
  protocolVersion: HC08D_PROTOCOL_VERSION,
  algorithmVersion: null,
  calibrationVersion: null,
  isDemo: false,
  disclaimer: '真实设备原始数据；未应用背景、标定或质量分析。',
};
```

Save it through `HistoryRepository`. Keep the existing Demo stop/analyze path unchanged.

- [ ] **Step 6: Add real-mode command guards**

- `START` and `STOP` are local actions in HC-08D mode.
- `ZERO` and `CALIBRATE` throw `FIRMWARE_COMMAND_UNSUPPORTED` in HC-08D mode without writing.
- `LED_ON` and `LED_OFF` are available only while a real device is connected.
- Switching modes disconnects, clears the active session, resets diagnostics, and updates local storage.

- [ ] **Step 7: Run store and state-machine tests**

Run:

```powershell
npm.cmd test -- src/store/appStore.hc08d.test.ts src/features/detection/stateMachine.test.ts
npm.cmd run typecheck
```

Expected: all focused tests and typecheck PASS.

- [ ] **Step 8: Commit the application behavior**

```powershell
git add -- src/store src/features/detection src/features/transport src/domain/types.ts
git commit -m "feat(acquisition): add HC-08D raw session flow"
```

## Task 7: Build the real-device interface and copy

**Files:**

- Create: `src/components/HardwareTechnicalDetails.tsx`
- Create: `src/components/HardwareTechnicalDetails.test.tsx`
- Modify: `src/components/SignalChart.tsx`
- Modify: `src/pages/DetectionPage.tsx`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/pages/HistoryPage.tsx`
- Modify: `src/pages/OverviewPage.tsx`
- Modify: `src/app/TopBar.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/i18n/locales/zh-CN.ts`
- Modify: `src/i18n/locales/en-US.ts`
- Modify: `src/theme/global.css`

- [ ] **Step 1: Write failing UI tests**

Add component tests that assert:

```ts
expect(screen.getByText('HC-08D 真实设备')).toBeInTheDocument();
expect(screen.getByRole('button', { name: '打开 LED' })).toBeEnabled();
expect(screen.getByRole('button', { name: '关闭 LED' })).toBeEnabled();
expect(screen.queryByText('Demo 故障模拟')).not.toBeInTheDocument();
expect(screen.getByText('CLR 总体亮度')).toBeInTheDocument();
expect(screen.getByText('数字饱和')).toBeInTheDocument();
```

For `HardwareTechnicalDetails`, assert that actual UUIDs and raw text appear only after expanding the details element.

For Settings, assert that choosing “HC-08D 真实设备” calls `setTransportMode('hc08d')`.

- [ ] **Step 2: Run UI tests and verify failure**

Run:

```powershell
npm.cmd test -- src/app/App.test.tsx src/components/HardwareTechnicalDetails.test.tsx
```

Expected: FAIL because real-mode controls and diagnostics are absent.

- [ ] **Step 3: Make the chart mode explicit**

Change `SignalChart` props to:

```ts
interface SignalChartProps {
  samples: Record<ChannelId, FluorescenceSample[]>;
  selected: ChannelId | 'all';
  valueMode: 'corrected' | 'raw';
  saturatedSequences?: Partial<Record<ChannelId, number[]>>;
}
```

Use:

```ts
const valueOf = (sample: FluorescenceSample): number =>
  valueMode === 'raw' ? sample.rawSignal : Math.max(0, sample.rawSignal - sample.background);
```

Use the raw-mode title and unit translation. Render saturation points with an amber outlined marker and accessible text outside the SVG.

- [ ] **Step 4: Add the hardware technical-details component**

`HardwareTechnicalDetails` receives:

```ts
interface HardwareTechnicalDetailsProps {
  diagnostics: Hc08dDiagnostics;
  onSelect?: (selection: {
    serviceUuid: string;
    notifyCharacteristicUuid: string;
    writeCharacteristicUuid: string;
  }) => void;
}
```

Render actual service/notify/write UUIDs, RSSI, latest frame time, the recent raw-line list, and the manual selector only when `diagnostics.candidates.length > 1`.

- [ ] **Step 5: Make Detection mode-aware**

In HC-08D mode:

- page action pill reads “HC-08D 真实设备”;
- device scan and connection remain in the existing device strip;
- metric cards show 480 nm, 515 nm, 555 nm, and CLR raw values;
- graph uses `valueMode="raw"`;
- start/stop control local recording;
- zero/calibrate are disabled with an explanation;
- LED buttons send real commands;
- Demo fault injection is hidden;
- command feedback moves from “等待设备确认” to “设备已确认指令”, or displays the returned/timeout error;
- diagnostics use the new details component.

In Demo mode, preserve current corrected-signal cards, commands, fault injection, and result summary.

- [ ] **Step 6: Add Settings mode selection**

Replace the disabled real-BLE row with a two-option segmented control:

```tsx
<button
  type="button"
  className={transportMode === 'demo' ? 'is-active' : ''}
  onClick={() => void setTransportMode('demo')}
>
  {t('settings.demoDevice')}
</button>
<button
  type="button"
  className={transportMode === 'hc08d' ? 'is-active' : ''}
  onClick={() => void setTransportMode('hc08d')}
>
  {t('settings.hc08dDevice')}
</button>
```

Show `HC08D-ASCII-DRAFT-0.2` as the protocol version when real mode is active.

- [ ] **Step 7: Render raw-only history safely**

Add `RAW_ONLY` to result translation maps. For raw records:

- show latest four raw values;
- show frame count, duration, protocol version, and saturation count;
- omit background, corrected signal, concentration, Demo score, and Demo disclaimer;
- keep JSON and CSV export buttons.

- [ ] **Step 8: Add aligned Chinese and English keys**

Add keys for:

- `common.realDevice`, `common.rawSignal`, `common.saturated`;
- `detection.signal480`, `signal515`, `signal555`, `clearSignal`;
- `detection.ledOn`, `ledOff`, `ledSent`, `firmwareUnsupported`;
- `detection.dataReady`, `dataReceiving`, `dataStale`, `reconnecting`;
- `detection.rawMonitor`, `latestFrame`, `frameCount`;
- `settings.demoDevice`, `hc08dDevice`, `hc08dDescription`;
- `history.resultRawOnly`, `rawRecordDisclaimer`, `saturationCount`;
- actual GATT detail labels and recovery copy.

Keep both locale object structures identical.

- [ ] **Step 9: Add restrained styles**

Add CSS for:

- real/Demo segmented control;
- four-column raw metric grid;
- amber saturation marker with text;
- LED command pair;
- diagnostics definition list;
- monospace raw-frame monitor with bounded height;
- responsive collapse at the project’s existing breakpoints.

Do not add neon effects, decorative motion, or a separate engineering dashboard.

- [ ] **Step 10: Run UI, i18n, lint, and type checks**

Run:

```powershell
npm.cmd test -- src/app/App.test.tsx src/components/HardwareTechnicalDetails.test.tsx
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
```

Expected: focused UI tests, typecheck, lint, and formatting PASS.

- [ ] **Step 11: Commit the interface**

```powershell
git add -- src/components src/pages src/app src/i18n src/theme
git commit -m "feat(ui): expose HC-08D acquisition controls"
```

## Task 8: Align documentation and approved design status

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/ble-protocol-draft.md`
- Modify: `docs/testing.md`
- Modify: `docs/superpowers/specs/2026-07-24-hc08d-windows-ble-design.md`

- [ ] **Step 1: Mark the design approved**

Change the design status to:

```text
状态：设计与书面规格已于 2026-07-24 通过用户确认。
```

- [ ] **Step 2: Document the implemented runtime**

Update architecture and README with:

- direct Windows → BLE → HC-08D → UART → STM32 flow;
- Demo/HC-08D mode switch;
- `FFE0/FFE1` preference plus adaptive characteristic discovery;
- raw-only record boundary;
- phone and computer cannot occupy the module simultaneously;
- Windows Bluetooth adapter requirement;
- commands to run the desktop app and checks.

- [ ] **Step 3: Replace protocol placeholders with the confirmed draft**

Document:

```text
Protocol: HC08D-ASCII-DRAFT-0.2
Frame: 480:<uint16>,515:<uint16>,555:<uint16>,CLR:<uint16>
Rate: one frame every 0.5 seconds
Saturation: 65535
Commands: @LED_ON and @LED_OFF
Command terminator: CRLF
Responses: LED_ON_OK, LED_OFF_OK, ERROR_COMMAND, each terminated by CRLF
Controller: STM32F103C8; Keil project builds successfully
UART: USART1 PA9/PA10, 9600/8/N/1, no flow control
Sensor: AS7341 on I²C1 PB6/PB7 at 100 kHz
```

Keep calibration, background, scientific units, UUID finalization, and command-ID correlation as versioned future inputs.

- [ ] **Step 4: Document automated and hardware tests**

Add the exact 20-frame, LED on/off, power-cycle reconnect, 30-minute soak, and clean-machine installer checks from the approved spec.

- [ ] **Step 5: Check documentation formatting**

Run:

```powershell
npx.cmd prettier --check README.md docs
git diff --check
```

Expected: formatting and whitespace checks PASS.

- [ ] **Step 6: Commit documentation**

```powershell
git add -- README.md docs
git commit -m "docs(ble): document HC-08D real mode"
```

## Task 9: Run the complete automated and Windows build gate

**Files:**

- Modify only files required to fix genuine failures from the commands below.

- [ ] **Step 1: Review the worktree before validation**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: only HC-08D task files are modified; the unrelated existing `__pycache__/` remains untouched and untracked.

- [ ] **Step 2: Run all frontend checks**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run format:check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run all Rust checks**

Run:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all commands exit 0 with no Clippy warnings.

- [ ] **Step 4: Build Windows installers**

Stop any installed/running copy that locks output only if necessary, then run:

```powershell
npm.cmd run tauri build
```

Expected:

- release executable builds;
- NSIS installer builds;
- MSI installer builds;
- no Demo-only runtime flag remains.

- [ ] **Step 5: Inspect artifacts**

Record exact paths, sizes, and SHA-256 values:

```powershell
Get-ChildItem -LiteralPath 'src-tauri\target\release\bundle' -Recurse -File |
  Select-Object FullName, Length, LastWriteTime
Get-ChildItem -LiteralPath 'src-tauri\target\release\bundle' -Recurse -File |
  Get-FileHash -Algorithm SHA256
```

- [ ] **Step 6: Commit any build-gate fixes**

Stage only reviewed HC-08D files and commit:

```powershell
git add -- src src-tauri README.md docs package.json package-lock.json
git commit -m "fix(build): complete HC-08D Windows validation"
```

Do not create this commit when no tracked fix is required.

## Task 10: Perform the real HC-08D bidirectional smoke test

**Files:**

- Modify: `docs/testing.md` with the actual test record.

- [ ] **Step 1: Prepare the device**

- Disconnect the phone and every other computer from HC-08D.
- Power STM32 and HC-08D.
- Confirm Windows Bluetooth is enabled.
- Start the newly built desktop application in HC-08D mode.

- [ ] **Step 2: Verify discovery and adaptive GATT selection**

- Scan for devices.
- Confirm HC-08D appears once with a signal-strength value.
- Connect.
- Open technical details.
- Record the actual service, notify, and write characteristic UUIDs.
- Confirm no full MAC address is copied into the repository.

- [ ] **Step 3: Verify incoming data**

- Receive at least 20 valid frames.
- Confirm the period is approximately 0.5 seconds.
- Compare four displayed values against recent raw lines.
- Confirm `65535` is shown as saturated and remains plotted.
- Confirm malformed data, if observed, does not stop subsequent valid frames.

- [ ] **Step 4: Verify outgoing LED commands**

- Click “打开 LED” and observe the hardware LED turn on.
- Click “关闭 LED” and observe the hardware LED turn off.
- Confirm the raw monitor receives `LED_ON_OK` and `LED_OFF_OK`.
- Confirm the UI moves from “等待设备确认” to “设备已确认指令”.
- Confirm a deliberately unsupported command, when tested from firmware tooling, returns `ERROR_COMMAND` and is not shown as success.

- [ ] **Step 5: Verify local recording**

- Start a local acquisition.
- Collect at least 20 frames.
- End the acquisition.
- Open Records and verify a `RAW_ONLY` record.
- Export JSON and CSV and compare their values to the raw monitor.

- [ ] **Step 6: Verify disconnect and reconnect**

- Power off HC-08D while connected.
- Confirm data interruption and reconnect states.
- Power the module back on.
- Confirm automatic attempts occur at approximately 1, 2, and 4 seconds and data resumes after a successful reconnect.
- Explicitly disconnect and confirm no reconnect occurs.

- [ ] **Step 7: Run the 30-minute soak**

Keep the connection active for 30 minutes and verify:

- frame count continues increasing;
- no duplicate frames from duplicate subscriptions;
- memory use does not grow without bound;
- raw monitor remains bounded;
- curve continues updating;
- no unexpected command is sent.

- [ ] **Step 8: Install and retest the packaged app**

- Install the NSIS package on a clean Windows user profile or second Windows computer.
- Repeat scan, connect, receive five frames, LED on, LED off, and disconnect.
- If MSI is required for the competition machine, repeat the same check with MSI.

- [ ] **Step 9: Record actual results**

Add a dated table to `docs/testing.md` containing:

```text
Windows version
application commit
HC-08D reported name
HC-08D firmware version when available
actual service UUID
actual notify UUID
actual write UUID
20-frame receive result
LED_ON result
LED_OFF result
power-cycle reconnect result
30-minute soak result
NSIS clean-install result
MSI clean-install result
```

- [ ] **Step 10: Commit the verified test record**

```powershell
git add -- docs/testing.md
git commit -m "test(ble): record HC-08D Windows smoke test"
```

## Task 11: Final review and branch delivery

**Files:**

- No new files unless validation reveals a scoped issue.

- [ ] **Step 1: Review all commits and changes**

Run:

```powershell
git status --short
git log --oneline --decorate -n 15
git diff origin/feat/windows-desktop...HEAD --check
git diff origin/feat/windows-desktop...HEAD --stat
```

Expected: coherent HC-08D commits, no secrets, no generated build output, and only the pre-existing unrelated `__pycache__/` untracked.

- [ ] **Step 2: Verify the final gate once more**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all commands exit 0.

- [ ] **Step 3: Push the feature branch**

```powershell
git push
```

Expected: `feat/windows-desktop` updates on Gitee without force-push.

- [ ] **Step 4: Report delivery**

Report:

- branch and commit hashes;
- actual GATT UUIDs discovered;
- automated check results;
- real device smoke and soak results;
- installer paths, sizes, and SHA-256;
- any scientific inputs that remain outside the transport milestone.
