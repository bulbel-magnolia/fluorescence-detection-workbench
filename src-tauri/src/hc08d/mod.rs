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
pub async fn ble_write(runtime: State<'_, Hc08dRuntime>, bytes: Vec<u8>) -> Result<(), String> {
    runtime.write(bytes).await
}

#[tauri::command]
pub async fn ble_disconnect(
    runtime: State<'_, Hc08dRuntime>,
    requested: bool,
) -> Result<(), String> {
    runtime.disconnect(requested).await
}
