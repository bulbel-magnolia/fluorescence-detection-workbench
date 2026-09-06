# Architecture

The Fluorescence Detection Workbench is an independent Tauri desktop application. Its runtime path is:

```text
Fluorescence hardware
→ HC-08D/BLE transport
→ protocol parser
→ fluorescence analysis
→ local history and optional cloud synchronization
→ desktop presentation
```

The repository contains presentation, detection, transport, protocol, analysis, persistence, import/export, history, settings, and cloud integration layers. Device transport remains separated from presentation through the existing transport abstraction.

The application does not package or launch a biological functional network modeler. It does not communicate with the independent BFN Modeling Workbench through IPC, HTTP, shared storage, or a shared process. Ordinary user-controlled files remain the only general-purpose data exchange mechanism.

The Tauri identity remains `FluorescenceDesktop` with identifier `org.bitchina.fluorescencedesktop`.
