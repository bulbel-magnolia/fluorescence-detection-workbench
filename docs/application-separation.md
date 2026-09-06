# Batch 14.0.0 application separation

- Frozen source branch: `codex/bfn-batch-13-freeze`
- Frozen source SHA: `07e62a384a5be679effe3605f2adf7fd29d66615`
- Fluorescence candidate branch: `codex/application-separation-fluorescence`
- BFN target repository: `bulbel-magnolia/bfn-modeling-workbench`
- BFN candidate branch: `codex/application-separation-bfn`

This branch removes the runnable BFN workspace, the replaced Legacy Modeling implementation, their navigation and translations, BFN-only persistence, BFN-only tests, and BFN-only documentation. No automatic bridge or shared persistence was introduced.

The fluorescence product name, Tauri identifier, hardware runtime, detection storage, and fluorescence workflows remain unchanged. Batch 14.0.0 is a candidate pending Master Review and is not frozen.
