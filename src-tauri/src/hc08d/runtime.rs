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
        Central, CentralEvent, CharPropFlags, Characteristic, Manager as _, Peripheral as _,
        ScanFilter, WriteType,
    },
    platform::{Adapter, Manager, Peripheral},
};
use futures_util::StreamExt;
use tauri::{async_runtime::JoinHandle, AppHandle, Emitter};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::hc08d::{
    selection::{select_characteristics, SelectionError},
    types::{
        BleDeviceInfo, CharacteristicInfo, CharacteristicSelection, ConnectResult,
        ConnectionPayload, NotificationPayload, SelectCharacteristicsRequest,
    },
};

const SCAN_DURATION: Duration = Duration::from_secs(8);
const SCAN_POLL_INTERVAL: Duration = Duration::from_millis(100);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const HC08_SERVICE_UUID: Uuid = Uuid::from_u128(0x0000_ffe0_0000_1000_8000_0080_5f9b_34fb);

pub fn is_hc08_name(name: &str) -> bool {
    let compact = name.trim().to_ascii_uppercase().replace([' ', '-'], "");
    compact == "HC08" || compact == "HC08D"
}

fn is_hc08_advertisement(name: Option<&str>, services: &[Uuid]) -> bool {
    name.map(is_hc08_name).unwrap_or(false) || services.contains(&HC08_SERVICE_UUID)
}

pub fn resolve_hc08_name(
    local_name: Option<&str>,
    advertisement_name: Option<&str>,
    services: &[Uuid],
) -> Option<String> {
    local_name
        .filter(|name| is_hc08_name(name))
        .or_else(|| advertisement_name.filter(|name| is_hc08_name(name)))
        .map(str::to_string)
        .or_else(|| {
            is_hc08_advertisement(local_name.or(advertisement_name), services)
                .then(|| "HC-08D (FFE0)".to_string())
        })
}

#[cfg(test)]
pub fn reconnect_delays(requested: bool) -> Vec<u64> {
    if requested {
        Vec::new()
    } else {
        vec![1_000, 2_000, 4_000]
    }
}

fn error(code: &str, message: &str) -> String {
    format!("{code}: {message}")
}

fn characteristic_info(characteristic: &Characteristic) -> CharacteristicInfo {
    CharacteristicInfo {
        service_uuid: characteristic.service_uuid.to_string(),
        characteristic_uuid: characteristic.uuid.to_string(),
        notify: characteristic.properties.contains(CharPropFlags::NOTIFY),
        indicate: characteristic.properties.contains(CharPropFlags::INDICATE),
        write: characteristic.properties.contains(CharPropFlags::WRITE),
        write_without_response: characteristic
            .properties
            .contains(CharPropFlags::WRITE_WITHOUT_RESPONSE),
    }
}

fn parse_bluetooth_uuid(value: &str) -> Option<Uuid> {
    let trimmed = value.trim();
    let expanded = if trimmed.len() == 4 {
        format!(
            "0000{}-0000-1000-8000-00805f9b34fb",
            trimmed.to_ascii_lowercase()
        )
    } else {
        trimmed.to_string()
    };
    Uuid::parse_str(&expanded).ok()
}

fn find_characteristic(
    peripheral: &Peripheral,
    service_uuid: &str,
    characteristic_uuid: &str,
) -> Option<Characteristic> {
    let service_uuid = parse_bluetooth_uuid(service_uuid)?;
    let characteristic_uuid = parse_bluetooth_uuid(characteristic_uuid)?;
    peripheral
        .characteristics()
        .into_iter()
        .find(|item| item.service_uuid == service_uuid && item.uuid == characteristic_uuid)
}

#[derive(Default)]
struct RuntimeInner {
    adapter: Option<Adapter>,
    peripherals: HashMap<String, Peripheral>,
    connected: Option<Peripheral>,
    connected_device: Option<BleDeviceInfo>,
    selection: Option<CharacteristicSelection>,
    candidates: Vec<CharacteristicInfo>,
    notify_characteristic: Option<Characteristic>,
    write_characteristic: Option<Characteristic>,
    notification_task: Option<JoinHandle<()>>,
    central_event_task: Option<JoinHandle<()>>,
}

#[derive(Clone, Default)]
pub struct Hc08dRuntime {
    inner: Arc<Mutex<RuntimeInner>>,
    generation: Arc<AtomicU64>,
    scan_cancelled: Arc<AtomicBool>,
    requested_disconnect: Arc<AtomicBool>,
}

impl Hc08dRuntime {
    async fn adapter(&self) -> Result<Adapter, String> {
        if let Some(adapter) = self.inner.lock().await.adapter.clone() {
            return Ok(adapter);
        }

        let manager = Manager::new()
            .await
            .map_err(|_| error("BLUETOOTH_UNAVAILABLE", "Windows Bluetooth is unavailable"))?;
        let adapter = manager
            .adapters()
            .await
            .map_err(|_| {
                error(
                    "BLUETOOTH_UNAVAILABLE",
                    "Bluetooth adapters could not be read",
                )
            })?
            .into_iter()
            .next()
            .ok_or_else(|| error("BLUETOOTH_UNAVAILABLE", "No Bluetooth adapter was found"))?;
        self.inner.lock().await.adapter = Some(adapter.clone());
        Ok(adapter)
    }

    pub async fn scan(&self) -> Result<Vec<BleDeviceInfo>, String> {
        let adapter = self.adapter().await?;
        self.scan_cancelled.store(false, Ordering::SeqCst);
        adapter
            .start_scan(ScanFilter::default())
            .await
            .map_err(|_| error("SCAN_FAILED", "Windows could not start the Bluetooth scan"))?;

        let iterations = SCAN_DURATION.as_millis() / SCAN_POLL_INTERVAL.as_millis();
        for _ in 0..iterations {
            if self.scan_cancelled.load(Ordering::SeqCst) {
                break;
            }
            tokio::time::sleep(SCAN_POLL_INTERVAL).await;
        }
        let _ = adapter.stop_scan().await;

        let peripherals = adapter.peripherals().await.map_err(|_| {
            error(
                "SCAN_FAILED",
                "Discovered Bluetooth devices could not be read",
            )
        })?;
        let mut devices = Vec::new();
        for peripheral in peripherals {
            let Some(properties) = peripheral
                .properties()
                .await
                .map_err(|_| error("SCAN_FAILED", "A device advertisement could not be read"))?
            else {
                continue;
            };
            let Some(name) = resolve_hc08_name(
                properties.local_name.as_deref(),
                properties.advertisement_name.as_deref(),
                &properties.services,
            ) else {
                continue;
            };

            let mut inner = self.inner.lock().await;
            let runtime_id = inner
                .peripherals
                .iter()
                .find_map(|(id, known)| (known.id() == peripheral.id()).then(|| id.clone()))
                .unwrap_or_else(|| format!("hc08d-{}", inner.peripherals.len() + 1));
            inner
                .peripherals
                .insert(runtime_id.clone(), peripheral.clone());
            drop(inner);
            devices.push(BleDeviceInfo {
                id: runtime_id,
                name,
                rssi: properties.rssi,
            });
        }

        devices.sort_by(|left, right| {
            left.name
                .cmp(&right.name)
                .then_with(|| right.rssi.cmp(&left.rssi))
        });
        Ok(devices)
    }

    pub async fn stop_scan(&self) -> Result<(), String> {
        self.scan_cancelled.store(true, Ordering::SeqCst);
        if let Some(adapter) = self.inner.lock().await.adapter.clone() {
            adapter.stop_scan().await.map_err(|_| {
                error(
                    "SCAN_STOP_FAILED",
                    "The Bluetooth scan could not be stopped",
                )
            })?;
        }
        Ok(())
    }

    pub async fn connect(
        &self,
        app: AppHandle,
        device_id: String,
    ) -> Result<ConnectResult, String> {
        if self.inner.lock().await.connected.is_some() {
            self.clear_connection(false).await?;
        }
        self.requested_disconnect.store(false, Ordering::SeqCst);

        let peripheral = self
            .inner
            .lock()
            .await
            .peripherals
            .get(&device_id)
            .cloned()
            .ok_or_else(|| {
                error(
                    "DEVICE_NOT_FOUND",
                    "Scan again and select the HC-08D device",
                )
            })?;
        let properties = peripheral
            .properties()
            .await
            .map_err(|_| {
                error(
                    "CONNECTION_FAILED",
                    "The device advertisement could not be read",
                )
            })?
            .ok_or_else(|| {
                error(
                    "DEVICE_NOT_FOUND",
                    "The HC-08D advertisement is unavailable",
                )
            })?;
        let name = resolve_hc08_name(
            properties.local_name.as_deref(),
            properties.advertisement_name.as_deref(),
            &properties.services,
        )
        .ok_or_else(|| {
            error(
                "DEVICE_IDENTITY_MISMATCH",
                "The selected device does not advertise an HC-08 name or FFE0 service",
            )
        })?;
        let device = BleDeviceInfo {
            id: device_id,
            name,
            rssi: properties.rssi,
        };
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;

        peripheral
            .connect_with_timeout(CONNECT_TIMEOUT)
            .await
            .map_err(|_| {
                error(
                    "CONNECTION_TIMEOUT",
                    "HC-08D did not connect within 10 seconds",
                )
            })?;
        if let Err(connect_error) = peripheral
            .discover_services_with_timeout(CONNECT_TIMEOUT)
            .await
        {
            let _ = peripheral.disconnect().await;
            let _ = connect_error;
            return Err(error(
                "SERVICE_DISCOVERY_FAILED",
                "HC-08D services could not be discovered",
            ));
        }

        let candidates: Vec<_> = peripheral
            .characteristics()
            .iter()
            .map(characteristic_info)
            .collect();
        let selection = match select_characteristics(&candidates) {
            Ok(selection) => Some(selection),
            Err(SelectionError::Ambiguous(_)) => None,
            Err(SelectionError::Missing) => {
                let _ = peripheral.disconnect().await;
                return Err(error(
                    "CHARACTERISTIC_NOT_FOUND",
                    "No usable notification and write characteristics were found",
                ));
            }
        };

        {
            let mut inner = self.inner.lock().await;
            inner.connected = Some(peripheral.clone());
            inner.connected_device = Some(device.clone());
            inner.selection = selection.clone();
            inner.candidates = candidates.clone();
        }
        if let Some(selected) = selection.clone() {
            self.configure_connection(app, generation, peripheral, device.clone(), selected)
                .await?;
        }

        Ok(ConnectResult {
            generation,
            device,
            selection,
            candidates,
        })
    }

    pub async fn select_characteristics(
        &self,
        app: AppHandle,
        request: SelectCharacteristicsRequest,
    ) -> Result<ConnectResult, String> {
        let (peripheral, device, candidates) = {
            let inner = self.inner.lock().await;
            let device = inner
                .connected_device
                .clone()
                .ok_or_else(|| error("NOT_CONNECTED", "Connect to HC-08D first"))?;
            if device.id != request.device_id {
                return Err(error(
                    "DEVICE_CHANGED",
                    "The connected device changed; scan again",
                ));
            }
            (
                inner
                    .connected
                    .clone()
                    .ok_or_else(|| error("NOT_CONNECTED", "Connect to HC-08D first"))?,
                device,
                inner.candidates.clone(),
            )
        };

        let notify = candidates.iter().find(|item| {
            item.service_uuid
                .eq_ignore_ascii_case(&request.service_uuid)
                && item
                    .characteristic_uuid
                    .eq_ignore_ascii_case(&request.notify_characteristic_uuid)
                && (item.notify || item.indicate)
        });
        let write = candidates.iter().find(|item| {
            item.service_uuid
                .eq_ignore_ascii_case(&request.service_uuid)
                && item
                    .characteristic_uuid
                    .eq_ignore_ascii_case(&request.write_characteristic_uuid)
                && (item.write || item.write_without_response)
        });
        let (notify, write) = match (notify, write) {
            (Some(notify), Some(write)) => (notify, write),
            _ => {
                return Err(error(
                    "CHARACTERISTIC_SELECTION_INVALID",
                    "Choose notification and write characteristics from the discovered service",
                ))
            }
        };
        let selection = CharacteristicSelection {
            service_uuid: request.service_uuid,
            notify_characteristic_uuid: notify.characteristic_uuid.clone(),
            write_characteristic_uuid: write.characteristic_uuid.clone(),
            write_with_response: write.write,
        };
        let generation = self.generation.load(Ordering::SeqCst);
        self.configure_connection(
            app,
            generation,
            peripheral,
            device.clone(),
            selection.clone(),
        )
        .await?;

        Ok(ConnectResult {
            generation,
            device,
            selection: Some(selection),
            candidates,
        })
    }

    async fn configure_connection(
        &self,
        app: AppHandle,
        generation: u64,
        peripheral: Peripheral,
        device: BleDeviceInfo,
        selection: CharacteristicSelection,
    ) -> Result<(), String> {
        let notify_characteristic = find_characteristic(
            &peripheral,
            &selection.service_uuid,
            &selection.notify_characteristic_uuid,
        )
        .ok_or_else(|| {
            error(
                "NOTIFY_CHARACTERISTIC_NOT_FOUND",
                "The selected notification characteristic is unavailable",
            )
        })?;
        let write_characteristic = find_characteristic(
            &peripheral,
            &selection.service_uuid,
            &selection.write_characteristic_uuid,
        )
        .ok_or_else(|| {
            error(
                "WRITE_CHARACTERISTIC_NOT_FOUND",
                "The selected write characteristic is unavailable",
            )
        })?;

        peripheral
            .subscribe(&notify_characteristic)
            .await
            .map_err(|_| {
                error(
                    "SUBSCRIBE_FAILED",
                    "HC-08D notifications could not be enabled",
                )
            })?;
        let mut notifications = peripheral.notifications().await.map_err(|_| {
            error(
                "SUBSCRIBE_FAILED",
                "The HC-08D notification stream could not be opened",
            )
        })?;
        let adapter = self.adapter().await?;
        let mut central_events = adapter.events().await.map_err(|_| {
            error(
                "CONNECTION_MONITOR_FAILED",
                "Windows connection events could not be monitored",
            )
        })?;
        let expected_peripheral_id = peripheral.id();
        let notification_app = app.clone();
        let notification_device_id = device.id.clone();
        let generation_counter = self.generation.clone();
        let notification_task = tauri::async_runtime::spawn(async move {
            while let Some(notification) = notifications.next().await {
                if generation_counter.load(Ordering::SeqCst) != generation {
                    break;
                }
                let _ = notification_app.emit(
                    "ble://notification",
                    NotificationPayload {
                        generation,
                        device_id: notification_device_id.clone(),
                        bytes: notification.value,
                    },
                );
            }
        });

        let event_app = app.clone();
        let event_device = device.clone();
        let requested_disconnect = self.requested_disconnect.clone();
        let event_generation_counter = self.generation.clone();
        let central_event_task = tauri::async_runtime::spawn(async move {
            while let Some(event) = central_events.next().await {
                if event_generation_counter.load(Ordering::SeqCst) != generation {
                    break;
                }
                if let CentralEvent::DeviceDisconnected(peripheral_id) = event {
                    if peripheral_id == expected_peripheral_id {
                        let requested = requested_disconnect.load(Ordering::SeqCst);
                        let _ = event_app.emit(
                            "ble://disconnected",
                            ConnectionPayload {
                                generation,
                                device: event_device.clone(),
                                status: if requested {
                                    "requested".to_string()
                                } else {
                                    "link-loss".to_string()
                                },
                                attempt: None,
                            },
                        );
                        break;
                    }
                }
            }
        });

        let mut inner = self.inner.lock().await;
        if let Some(task) = inner.notification_task.take() {
            task.abort();
        }
        if let Some(task) = inner.central_event_task.take() {
            task.abort();
        }
        inner.selection = Some(selection);
        inner.notify_characteristic = Some(notify_characteristic);
        inner.write_characteristic = Some(write_characteristic);
        inner.notification_task = Some(notification_task);
        inner.central_event_task = Some(central_event_task);
        drop(inner);

        let _ = app.emit(
            "ble://connection-state",
            ConnectionPayload {
                generation,
                device,
                status: "connected".to_string(),
                attempt: None,
            },
        );
        Ok(())
    }

    pub async fn write(&self, bytes: Vec<u8>) -> Result<(), String> {
        if bytes.is_empty() || bytes.len() > 64 {
            return Err(error(
                "WRITE_PAYLOAD_INVALID",
                "The BLE write payload must contain between 1 and 64 bytes",
            ));
        }
        let (peripheral, characteristic, with_response) = {
            let inner = self.inner.lock().await;
            (
                inner
                    .connected
                    .clone()
                    .ok_or_else(|| error("NOT_CONNECTED", "Connect to HC-08D first"))?,
                inner.write_characteristic.clone().ok_or_else(|| {
                    error("WRITE_UNSUPPORTED", "No write characteristic is selected")
                })?,
                inner
                    .selection
                    .as_ref()
                    .map(|item| item.write_with_response)
                    .unwrap_or(false),
            )
        };
        let write_type = if with_response {
            WriteType::WithResponse
        } else {
            WriteType::WithoutResponse
        };
        peripheral
            .write(&characteristic, &bytes, write_type)
            .await
            .map_err(|_| error("WRITE_FAILED", "The command could not be written to HC-08D"))
    }

    async fn clear_connection(&self, requested: bool) -> Result<(), String> {
        self.requested_disconnect.store(requested, Ordering::SeqCst);
        let (peripheral, notify_characteristic, notification_task, central_event_task) = {
            let mut inner = self.inner.lock().await;
            let resources = (
                inner.connected.take(),
                inner.notify_characteristic.take(),
                inner.notification_task.take(),
                inner.central_event_task.take(),
            );
            inner.connected_device = None;
            inner.selection = None;
            inner.candidates.clear();
            inner.write_characteristic = None;
            resources
        };
        if let Some(task) = notification_task {
            task.abort();
        }
        if let Some(task) = central_event_task {
            task.abort();
        }

        let mut disconnect_failed = false;
        if let Some(peripheral) = peripheral {
            if let Some(characteristic) = notify_characteristic {
                let _ = peripheral.unsubscribe(&characteristic).await;
            }
            if peripheral.is_connected().await.unwrap_or(false)
                && peripheral.disconnect().await.is_err()
            {
                disconnect_failed = true;
            }
        }
        self.generation.fetch_add(1, Ordering::SeqCst);
        if disconnect_failed {
            Err(error(
                "DISCONNECT_FAILED",
                "Windows could not close the HC-08D connection cleanly",
            ))
        } else {
            Ok(())
        }
    }

    pub async fn disconnect(&self, requested: bool) -> Result<(), String> {
        self.clear_connection(requested).await
    }
}

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
    fn accepts_ffe0_advertisements_when_windows_omits_the_local_name() {
        let services = vec![Uuid::parse_str("0000FFE0-0000-1000-8000-00805F9B34FB").unwrap()];

        assert!(is_hc08_advertisement(None, &services));
        assert!(is_hc08_advertisement(Some("Android phone"), &services));
        assert_eq!(
            resolve_hc08_name(None, None, &services).as_deref(),
            Some("HC-08D (FFE0)")
        );
        assert_eq!(
            resolve_hc08_name(Some("Android phone"), Some("HC-08D"), &[]).as_deref(),
            Some("HC-08D")
        );
    }

    #[test]
    fn rejects_unrelated_unnamed_advertisements() {
        let services = vec![Uuid::parse_str("0000180D-0000-1000-8000-00805F9B34FB").unwrap()];

        assert!(!is_hc08_advertisement(None, &services));
        assert!(!is_hc08_advertisement(Some("Android phone"), &services));
        assert_eq!(resolve_hc08_name(None, None, &services), None);
    }

    #[test]
    fn retries_only_unexpected_disconnects() {
        assert_eq!(reconnect_delays(false), vec![1_000, 2_000, 4_000]);
        assert!(reconnect_delays(true).is_empty());
    }
}
