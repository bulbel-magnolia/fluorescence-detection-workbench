# Batch 14 application separation

## Formal status

- Status: `FROZEN`
- Master Freeze Review: `PASS`
- Implementation: complete
- Validation: complete
- Application separation: frozen
- Independent runtime/build boundary: frozen
- Persistence namespace separation: frozen
- Reviewed Fluorescence candidate: `076a85eea2e2d1d863d59f8810cbb201d72e43ba`
- Tested source: `9d46b3c0e3b1c7d7ae1975d126eee4d3aa515aa3`

This freeze does not change upstream status boundaries: Batch 12.5.0, Batch 12.5.1, and Batch 12.5 remain `CANDIDATE / not FROZEN`; Batch 13.0–13.4 remain `FROZEN`.

## Separation record

- Frozen source branch: `codex/bfn-batch-13-freeze`
- Frozen source SHA: `07e62a384a5be679effe3605f2adf7fd29d66615`
- Fluorescence candidate branch: `codex/application-separation-fluorescence`
- BFN target repository: `bulbel-magnolia/bfn-modeling-workbench`
- BFN candidate branch: `codex/application-separation-bfn`

This branch removes the runnable BFN workspace, the replaced Legacy Modeling implementation, their navigation and translations, BFN-only persistence, BFN-only tests, and BFN-only documentation. No automatic bridge or shared persistence was introduced.

The fluorescence product name, Tauri identifier, hardware runtime, detection storage, and fluorescence workflows remain unchanged. Batch 14 is frozen at the reviewed standalone application boundary recorded above.
