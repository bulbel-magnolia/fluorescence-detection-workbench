# Testing

The standalone fluorescence repository validates device transport, protocol parsing, acquisition state transitions, signal analysis, import/export, local history, cloud behavior, settings, and the application navigation shell.

## Required commands

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Frontend build completion is not evidence that the native Tauri installer completed. Native build blockers must be reported separately.

## Separation checks

- No BFN or legacy Modeling route is present.
- No BFN source, persistence, tests, or translation bundle is packaged.
- No cross-repository package, workspace, submodule, symlink, IPC, or HTTP bridge exists.
- Detection, device, import, analysis, history, export, settings, and cloud workflows remain available.
