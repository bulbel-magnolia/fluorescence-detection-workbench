# Batch 14 application-separation validation

- Tested source SHA: `9d46b3c0e3b1c7d7ae1975d126eee4d3aa515aa3`
- Raw execution record: [batch-14-application-separation-validation.txt](batch-14-application-separation-validation.txt)

| Command                                            | Exit code | Evidence                                     |
| -------------------------------------------------- | --------: | -------------------------------------------- |
| `npm ci`                                           |         0 | 288 packages installed                       |
| `npm run typecheck`                                |         0 | TypeScript completed                         |
| `npm run lint`                                     |         0 | ESLint completed with max warnings 0         |
| `npm run test`                                     |         0 | 23 test files; 90 tests; all passed          |
| `npm run build`                                    |         0 | Vite production build succeeded; 146 modules |
| `cargo check --manifest-path src-tauri/Cargo.toml` |         0 | dev profile finished                         |
| `npm run tauri build`                              |         0 | release build and two bundles finished       |

- Frontend build: PASS
- Cargo check: PASS
- Tauri build: PASS
- MSI: `FluorescenceDesktop_0.1.1_x64_en-US.msi`
- NSIS: `FluorescenceDesktop_0.1.1_x64-setup.exe`
