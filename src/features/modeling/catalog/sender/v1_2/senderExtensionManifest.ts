export const SENDER_EXTENSION_RELEASE_IDENTITY = Object.freeze({
  releaseName: 'AHL/HSL Sender Extension V1.2',
  outputsReleaseName: 'AHL/HSL Sender Outputs V1.2',
  version: '1.2',
  releaseDate: '2026-08-08',
  releaseType: 'incremental_extension',
  baseRelease: 'AHL_HSL_component_database_reconstructed_release_v1_1.zip',
  baseSha256: '2789c92207b57444ca21f14c0ac6590389abcf7d73cb6d2686854c58666e0b80',
  sourcePackageSha256: 'E05A053976ECA37A0433908C6AD22B149315AA02A3AE696E7F46D539B184C1BE',
} as const);

export const SENDER_EXTENSION_EXPECTED_COUNTS = Object.freeze({
  newSignals: 3,
  newComponents: 34,
  newParameterContexts: 17,
  existingV1_1ComponentLinks: 13,
  senderOutputs: 53,
  rawPoints: 60,
  functionParameterRows: 5,
  sources: 21,
  newSources: 17,
  reusedV1_1Sources: 4,
  rejectedCandidates: 18,
  evidenceTraceRows: 6127,
  runtimeQuantitative: 0,
  runtimeDemo: 0,
} as const);

export const SENDER_EXTENSION_SOURCE_FILES = Object.freeze([
  {
    name: 'fit_sender_functions.py',
    bytes: 5580,
    sha256: 'FBB170C711A7DA34AE7B042D73705CB120CBB220F32AE0FB4FF1F418E87EC382',
  },
  {
    name: 'sender_components_v1_2.json',
    bytes: 79543,
    sha256: 'DA83CF6FE55852D74B7B2677B06D3856EA1B67877A771A384D604B741CC50FB9',
  },
  {
    name: 'sender_conflicts.md',
    bytes: 3119,
    sha256: '0CAADD7B158B0476D981E6D40286D9353885969A912110A0BF35C05C04194AB2',
  },
  {
    name: 'sender_deep_research_report.md',
    bytes: 7179,
    sha256: '6C775BF0BED761352BFC7F0EFB00C1BEBBDFFC596301B2D02D6038E315D111D6',
  },
  {
    name: 'sender_evidence_trace.csv',
    bytes: 1628873,
    sha256: '1EA9B4E77B85A7B5CA2489A3BB79FAE1AA398F739D8904CDF0B89EB68C6D044C',
  },
  {
    name: 'sender_function_parameters.csv',
    bytes: 3006,
    sha256: '776B41BD269A72207BDE5EA4F49B33BC1DB98DB45EC4945BAAC3585D98072A4E',
  },
  {
    name: 'sender_import_ready_summary.md',
    bytes: 2363,
    sha256: '5F4D2812392F2A9CFF25C78D7D193B5374EE9B41CF79188705B5ED326F7927DB',
  },
  {
    name: 'sender_outputs_v1_2.json',
    bytes: 147627,
    sha256: '7D649F3AE8FE1885925B14BE6D993E3C4877CC76C299740534855CE53D31BEEF',
  },
  {
    name: 'sender_raw_points.csv',
    bytes: 24790,
    sha256: 'C3972F20C32B8FA137A9F824B75AD33999B182A91269FAE3210D5B2669318BCD',
  },
  {
    name: 'sender_rejected_candidates.jsonl',
    bytes: 7428,
    sha256: '8A9088876622791242717276A2CDC0556B5A941FA906B426BD6DD8EA621751ED',
  },
  {
    name: 'sender_sources.csv',
    bytes: 11939,
    sha256: '585A47F8CDDDFF015053A3C6EACFDB63FDC323CF43987626AB1EBE8ECFC88CAC',
  },
  {
    name: 'sender_validation_report.json',
    bytes: 5222,
    sha256: 'F9DBAB30F3F354A874FA189BB837312412E9F95EE2E894ADF8A285BEB1790A10',
  },
] as const);
