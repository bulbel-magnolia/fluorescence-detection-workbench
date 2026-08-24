pub mod hc08d;

use serde::Serialize;
use tauri_plugin_sql::{Migration, MigrationKind};

use hc08d::runtime::Hc08dRuntime;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeStatus {
    runtime: &'static str,
    demo_only: bool,
    real_hardware_configured: bool,
}

const CREDENTIAL_SERVICE: &str = "org.bitchina.fluorescencedesktop";

#[tauri::command]
fn secure_storage_get(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(CREDENTIAL_SERVICE, &key)
        .map_err(|_| "credential-entry-unavailable".to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("credential-read-failed".to_string()),
    }
}

#[tauri::command]
fn secure_storage_set(key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(CREDENTIAL_SERVICE, &key)
        .map_err(|_| "credential-entry-unavailable".to_string())?;
    entry
        .set_password(&value)
        .map_err(|_| "credential-write-failed".to_string())
}

#[tauri::command]
fn secure_storage_remove(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(CREDENTIAL_SERVICE, &key)
        .map_err(|_| "credential-entry-unavailable".to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("credential-delete-failed".to_string()),
    }
}

#[tauri::command]
fn runtime_status() -> RuntimeStatus {
    RuntimeStatus {
        runtime: "tauri-windows",
        demo_only: false,
        real_hardware_configured: true,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create local records, samples, sync queue, settings and workspace cache",
            sql: include_str!("../migrations/0001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "store normalized HC-08D raw frames",
            sql: include_str!("../migrations/0002_hc08d_frames.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .manage(Hc08dRuntime::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:fluorescence.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            hc08d::ble_scan_start,
            hc08d::ble_scan_stop,
            hc08d::ble_connect,
            hc08d::ble_select_characteristics,
            hc08d::ble_write,
            hc08d::ble_disconnect,
            runtime_status,
            secure_storage_get,
            secure_storage_set,
            secure_storage_remove
        ])
        .run(tauri::generate_context!())
        .expect("failed to run fluorescence desktop application");
}
