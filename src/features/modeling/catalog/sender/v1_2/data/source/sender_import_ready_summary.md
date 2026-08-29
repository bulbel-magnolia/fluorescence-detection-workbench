# Sender Extension V1.2 — Import-ready summary

Verified: **2026-08-08**  
Base V1.1 SHA256: `2789c92207b57444ca21f14c0ac6590389abcf7d73cb6d2686854c58666e0b80`  
Validation: **pass**

## Counts

| Software status | Count | Import behavior |
|---|---:|---|
| runtime_quantitative | 0 | No direct numerical execution |
| runtime_demo | 0 | No normalized sender demo admitted |
| calibration_candidate | 27 | Import as non-executable evidence/calibration queue |
| effective_pair_only | 19 | Preserve whole circuit; decomposition prohibited |
| reference_only | 7 | Identity/context only |
| rejected candidate functions | 18 | Do not import as sender functions |

## Directly runnable sender functions

**0.** No candidate met all requirements for ≥3 controlled input levels, absolute output, complete context, auditable points, refittable model, R², RMSE and unambiguous product identity.

## Recommended software imports

1. **van Aalst AAA063/AAA111/AAA113 CepI records** — exact duplicate-level C8-HSL source-data values; retain as two-level calibration candidates.
2. **Morohoshi StFRB508 deletion panel** — high-quality direct multi-AHL endpoint concentrations; useful as product-profile references, not a shared dose-response.
3. **Kokarakis LuxI/TraI/LasI records** — direct LC-MS concentration and productivity context; preserve time-course semantics.
4. **Kang DN1/DN2 RpaI pathway records** — absolute p-coumaroyl-HSL titers under categorical metabolic interventions.
5. **BjaI/BmaI1/AhyI cell-free kinetics** — useful for calibration planning and cell-free modules; runtime remains disabled.

## Priority experimental calibration queue

1. V1.1 Daer LuxI, RhlI, LasI and RpaI constructs: 6–8 inducer levels with LC–MS/MS and isotope internal standards.
2. One fixed CepI yeast construct: expand methionine or promoter input to ≥6 levels.
3. One fixed TAL–4CL–RpaI construct: scan one scalar input while holding all other precursors constant.
4. For every multi-product synthase, quantify each product separately and retain minor products.

## Import safeguards

- Do not overwrite V1.1 IDs.
- Import `numerical_execution_allowed=false` for every V1.2 output.
- Enforce `decomposition_prohibited=true` for every `effective_pair_only` record.
- Preserve ND as null.
- Do not pool constructs, hosts, timepoints or product species.
