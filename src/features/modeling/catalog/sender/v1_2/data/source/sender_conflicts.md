# Sender conflicts and non-merge decisions — V1.2

Verified: 2026-08-08

## 1. Same enzyme name does not define one sender record

LuxI, LasI, RpaI, EsaI and other synthases appear in different hosts, vectors, promoters and metabolic contexts. V1.2 uses **construct version + host + parameter context** as the deduplication key. No cross-study averaging was performed.

## 2. Yeast non-detection versus bacterial production

The van Aalst yeast screen did not detect output from six native/codon-optimized LuxI/LasI/EsaI constructs, while bacterial implementations of the same enzyme names produce measurable AHLs. These records remain separate because host acyl-donor pools, expression, folding and export differ. Non-detection has no numeric LOD and is not encoded as zero.

## 3. CepI precursor dependence

AAA063, AAA111 and AAA113 all contain CepI, but AAA111 and AAA113 add different SAM2/MET6 expression cassettes. They are three constructs, not three levels of a common promoter. Methionine supplementation is a metabolic precursor perturbation and is retained explicitly.

## 4. Time-course peaks versus steady-state functions

Kokarakis E. coli senders peaked near 13 h and subsequently declined. The time axis describes accumulation and loss under fixed induction. V1.2 does not reinterpret timepoints as sender-control input levels or a fixed weight.

## 5. Mixed product profiles

The StFRB508 wild type contains PhzI, AurI and CsaI and produces six measured AHL species. Its total profile is not partitioned among enzymes. The NovIspR1 system produces a broad product spectrum; each signal identity is retained separately and no total peak area is assigned to the major product.

## 6. Deletion strains are not expression-strength levels

Morohoshi single-synthase deletion strains differ genetically. Their endpoints identify context-specific product profiles, not a single enzyme dose-response. No interpolation or averaging was applied.

## 7. Resin capture is not synthesis rate

In Gan 2024, XAD-16 alters recovery of extracellular AHLs. Resin and residual-broth fractions are analytically distinct. The resin series is not admitted as a production function without a complete mass balance and exact Table S5 values.

## 8. Cellular titers versus purified-enzyme kinetics

BjaI/BmaI1/AhyI kinetic constants describe purified enzyme and substrate concentrations. They are not interchangeable with extracellular concentrations from living senders. These records are retained as cell-free calibration candidates with runtime disabled.

## 9. Conflicting/ambiguous uncertainty

Christensen 2014 Table 1 reports BjaI isovaleryl-CoA kcat as 0.021 ± 0.03 s^-1. The value is preserved verbatim and flagged; it was not silently corrected.

## 10. End-to-end circuit evidence

Daer 2018, Múgica 2025, Rai 2012, Jiang 2020, Ream 2026, Chen 2026 and Zhai 2026 demonstrate communication or downstream regulation without an auditable intermediate AHL concentration. Their decomposition is prohibited. Receiver fluorescence, pathway product titer or phenotype was never back-calculated to sender concentration.
