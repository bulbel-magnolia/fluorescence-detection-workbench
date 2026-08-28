import type { BfnCatalogInverseCandidateResult } from '../catalogInverseDesignTypes';

export type BfnCatalogInverseResultSelection =
  | {
      kind: 'candidate';
      result: BfnCatalogInverseCandidateResult;
    }
  | {
      kind: 'unavailable';
      responseId: string;
    };

export function catalogInverseSelectionId(selection: BfnCatalogInverseResultSelection): string {
  return selection.kind === 'candidate' ? selection.result.responseId : selection.responseId;
}
