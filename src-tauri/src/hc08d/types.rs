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
pub struct ConnectResult {
    pub generation: u64,
    pub device: BleDeviceInfo,
    pub selection: Option<CharacteristicSelection>,
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
