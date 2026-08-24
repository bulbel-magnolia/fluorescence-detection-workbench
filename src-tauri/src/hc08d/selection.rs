use crate::hc08d::types::{CharacteristicInfo, CharacteristicSelection};

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum SelectionError {
    #[error("no usable notify/write characteristic pair was found")]
    Missing,
    #[error("multiple equally suitable characteristic pairs were found")]
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
    fn prefers_factory_ffe0_ffe1_for_short_and_full_uuids() {
        for (service, characteristic_uuid) in [
            ("ffe0", "ffe1"),
            (
                "0000FFE0-0000-1000-8000-00805F9B34FB",
                "0000FFE1-0000-1000-8000-00805F9B34FB",
            ),
        ] {
            let candidates = vec![
                characteristic("1234", "5678", true, true),
                characteristic(service, characteristic_uuid, true, true),
            ];
            let selection = select_characteristics(&candidates).unwrap();
            assert_eq!(selection.notify_characteristic_uuid, characteristic_uuid);
            assert_eq!(selection.write_characteristic_uuid, characteristic_uuid);
        }
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
