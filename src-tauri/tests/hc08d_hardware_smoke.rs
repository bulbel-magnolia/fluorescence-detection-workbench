use std::time::{Duration, Instant};

use btleplug::{
    api::{
        Central, CharPropFlags, Characteristic, Manager as _, Peripheral as _, ScanFilter,
        ValueNotification, WriteType,
    },
    platform::{Manager, Peripheral},
};
use fluorescence_desktop_lib::hc08d::{
    runtime::resolve_hc08_name, selection::select_characteristics, types::CharacteristicInfo,
};
use futures_util::{Stream, StreamExt};

const LED_ON: &[u8] = b"@LED_ON\r\n";
const LED_OFF: &[u8] = b"@LED_OFF\r\n";

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

fn find_characteristic(
    peripheral: &Peripheral,
    service_uuid: &str,
    characteristic_uuid: &str,
) -> Option<Characteristic> {
    peripheral.characteristics().into_iter().find(|item| {
        item.service_uuid
            .to_string()
            .eq_ignore_ascii_case(service_uuid)
            && item
                .uuid
                .to_string()
                .eq_ignore_ascii_case(characteristic_uuid)
    })
}

fn is_sample_line(line: &str) -> bool {
    let expected = ["480", "515", "555", "CLR"];
    let fields: Vec<_> = line.split(',').collect();
    fields.len() == expected.len()
        && fields.iter().zip(expected).all(|(field, label)| {
            field
                .split_once(':')
                .is_some_and(|(actual, value)| actual == label && value.parse::<u16>().is_ok())
        })
}

async fn wait_for_line<S, F>(
    notifications: &mut S,
    pending: &mut Vec<u8>,
    wait: Duration,
    predicate: F,
) -> Result<String, String>
where
    S: Stream<Item = ValueNotification> + Unpin,
    F: Fn(&str) -> bool,
{
    let deadline = Instant::now() + wait;
    loop {
        while let Some(end) = pending.windows(2).position(|window| window == b"\r\n") {
            let line = String::from_utf8_lossy(&pending.drain(..end).collect::<Vec<_>>())
                .trim()
                .to_string();
            pending.drain(..2);
            if predicate(&line) {
                return Ok(line);
            }
        }

        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("timed out while waiting for an HC-08D line".to_string());
        }
        let notification = tokio::time::timeout(remaining, notifications.next())
            .await
            .map_err(|_| "timed out while waiting for an HC-08D notification".to_string())?
            .ok_or_else(|| "the HC-08D notification stream ended".to_string())?;
        pending.extend_from_slice(&notification.value);
    }
}

async fn run_hardware_smoke() -> Result<(), String> {
    let manager = Manager::new()
        .await
        .map_err(|error| format!("Bluetooth manager unavailable: {error}"))?;
    let adapter = manager
        .adapters()
        .await
        .map_err(|error| format!("Bluetooth adapter lookup failed: {error}"))?
        .into_iter()
        .next()
        .ok_or_else(|| "no Bluetooth adapter was found".to_string())?;

    adapter
        .start_scan(ScanFilter::default())
        .await
        .map_err(|error| format!("scan could not start: {error}"))?;
    tokio::time::sleep(Duration::from_secs(8)).await;
    let _ = adapter.stop_scan().await;

    let mut target = None;
    for peripheral in adapter
        .peripherals()
        .await
        .map_err(|error| format!("discovered devices could not be read: {error}"))?
    {
        let Some(properties) = peripheral
            .properties()
            .await
            .map_err(|error| format!("device properties could not be read: {error}"))?
        else {
            continue;
        };
        let rssi = properties.rssi;
        let Some(name) = resolve_hc08_name(
            properties.local_name.as_deref(),
            properties.advertisement_name.as_deref(),
            &properties.services,
        ) else {
            continue;
        };
        target = Some((peripheral, name, rssi));
        break;
    }

    let (peripheral, name, rssi) = target.ok_or_else(|| {
        "HC-08D was not found; power it on and disconnect phones or other computers".to_string()
    })?;
    println!("HC-08D found: name={name}, rssi={rssi:?}");

    if !peripheral.is_connected().await.unwrap_or(false) {
        peripheral
            .connect_with_timeout(Duration::from_secs(10))
            .await
            .map_err(|error| format!("HC-08D connection failed: {error}"))?;
    }
    if let Err(error) = peripheral
        .discover_services_with_timeout(Duration::from_secs(10))
        .await
    {
        let _ = peripheral.disconnect().await;
        return Err(format!("GATT discovery failed: {error}"));
    }

    let candidates: Vec<_> = peripheral
        .characteristics()
        .iter()
        .map(characteristic_info)
        .collect();
    for candidate in &candidates {
        println!(
            "GATT candidate: service={}, characteristic={}, notify={}, indicate={}, write={}, write_without_response={}",
            candidate.service_uuid,
            candidate.characteristic_uuid,
            candidate.notify,
            candidate.indicate,
            candidate.write,
            candidate.write_without_response
        );
    }
    let selection = match select_characteristics(&candidates) {
        Ok(selection) => selection,
        Err(error) => {
            let _ = peripheral.disconnect().await;
            return Err(format!("GATT selection failed: {error}"));
        }
    };
    println!(
        "GATT selected: service={}, notify={}, write={}",
        selection.service_uuid,
        selection.notify_characteristic_uuid,
        selection.write_characteristic_uuid
    );

    let notify = find_characteristic(
        &peripheral,
        &selection.service_uuid,
        &selection.notify_characteristic_uuid,
    )
    .ok_or_else(|| "selected notify characteristic disappeared".to_string())?;
    let write = find_characteristic(
        &peripheral,
        &selection.service_uuid,
        &selection.write_characteristic_uuid,
    )
    .ok_or_else(|| "selected write characteristic disappeared".to_string())?;
    tokio::time::timeout(Duration::from_secs(5), peripheral.subscribe(&notify))
        .await
        .map_err(|_| "notification subscription timed out after 5s".to_string())?
        .map_err(|error| format!("notification subscription failed: {error}"))?;
    let mut notifications =
        tokio::time::timeout(Duration::from_secs(5), peripheral.notifications())
            .await
            .map_err(|_| "notification stream timed out after 5s".to_string())?
            .map_err(|error| format!("notification stream failed: {error}"))?;
    let write_type = if selection.write_with_response {
        WriteType::WithResponse
    } else {
        WriteType::WithoutResponse
    };
    let mut pending = Vec::new();
    let phone_mode = std::env::var_os("NRF_PHONE_SMOKE").is_some();
    let frame_count = if phone_mode { 1 } else { 3 };
    let sample_timeout = if phone_mode {
        Duration::from_secs(90)
    } else {
        Duration::from_secs(5)
    };

    let exercise = async {
        for frame_index in 1..=frame_count {
            let line = wait_for_line(
                &mut notifications,
                &mut pending,
                sample_timeout,
                is_sample_line,
            )
            .await?;
            println!("sample {frame_index}: {line}");
        }
        if phone_mode {
            return Ok(());
        }

        tokio::time::timeout(
            Duration::from_secs(3),
            peripheral.write(&write, LED_ON, write_type),
        )
        .await
        .map_err(|_| "LED_ON write timed out after 3s".to_string())?
        .map_err(|error| format!("LED_ON write failed: {error}"))?;
        let led_on_ack = wait_for_line(
            &mut notifications,
            &mut pending,
            Duration::from_secs(3),
            |line| line == "LED_ON_OK",
        )
        .await?;
        println!("command response: {led_on_ack}");

        tokio::time::timeout(
            Duration::from_secs(3),
            peripheral.write(&write, LED_OFF, write_type),
        )
        .await
        .map_err(|_| "LED_OFF write timed out after 3s".to_string())?
        .map_err(|error| format!("LED_OFF write failed: {error}"))?;
        let led_off_ack = wait_for_line(
            &mut notifications,
            &mut pending,
            Duration::from_secs(3),
            |line| line == "LED_OFF_OK",
        )
        .await?;
        println!("command response: {led_off_ack}");
        Ok(())
    }
    .await;

    let _ = tokio::time::timeout(
        Duration::from_secs(3),
        peripheral.write(&write, LED_OFF, write_type),
    )
    .await;
    let _ = tokio::time::timeout(Duration::from_secs(3), peripheral.unsubscribe(&notify)).await;
    let _ = tokio::time::timeout(Duration::from_secs(3), peripheral.disconnect()).await;
    exercise
}

#[test]
#[ignore = "requires a powered, unoccupied HC-08D device"]
fn receives_real_frames_and_verifies_led_acknowledgements() {
    tauri::async_runtime::block_on(run_hardware_smoke()).expect("HC-08D hardware smoke failed");
}
