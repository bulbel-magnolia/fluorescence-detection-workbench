import type {
  BfnModuleTemplateMetadata,
  BfnModuleTemplateVersionV1,
  BfnReusableModulePayloadV1,
} from './template';

export const BFN_MODULE_LIBRARY_DATABASE_NAME = 'fluorescence-desktop-bfn-module-library';
export const BFN_MODULE_LIBRARY_DATABASE_VERSION = 1;
export const BFN_MODULE_LIBRARY_FALLBACK_KEY = 'fluorescence-desktop.bfn-module-library.v1';
export const BFN_MODULE_LIBRARY_FALLBACK_SCHEMA = 'BFN-MODULE-LIBRARY-LOCAL';
export const BFN_MODULE_LIBRARY_FALLBACK_SCHEMA_VERSION = 1;
export const BFN_MODULE_LIBRARY_TEMPLATES_STORE = 'templates';
export const BFN_MODULE_LIBRARY_VERSIONS_STORE = 'versions';
export const BFN_MODULE_LIBRARY_TEMPLATE_ID_INDEX = 'templateId';
export const BFN_MODULE_LIBRARY_TEMPLATE_REVISION_INDEX = 'templateIdRevision';

export const BFN_MODULE_LIBRARY_INPUT_INVALID = 'BFN_MODULE_LIBRARY_INPUT_INVALID';
export const BFN_MODULE_LIBRARY_TEMPLATE_EXISTS = 'BFN_MODULE_LIBRARY_TEMPLATE_EXISTS';
export const BFN_MODULE_LIBRARY_TEMPLATE_NOT_FOUND = 'BFN_MODULE_LIBRARY_TEMPLATE_NOT_FOUND';
export const BFN_MODULE_LIBRARY_METADATA_CORRUPT = 'BFN_MODULE_LIBRARY_METADATA_CORRUPT';
export const BFN_MODULE_LIBRARY_VERSION_CORRUPT = 'BFN_MODULE_LIBRARY_VERSION_CORRUPT';
export const BFN_MODULE_LIBRARY_STATE_CORRUPT = 'BFN_MODULE_LIBRARY_STATE_CORRUPT';
export const BFN_MODULE_LIBRARY_REVISION_CONFLICT = 'BFN_MODULE_LIBRARY_REVISION_CONFLICT';
export const BFN_MODULE_LIBRARY_STORAGE_FAILED = 'BFN_MODULE_LIBRARY_STORAGE_FAILED';
export const BFN_MODULE_LIBRARY_DATABASE_BLOCKED = 'BFN_MODULE_LIBRARY_DATABASE_BLOCKED';

export type BfnModuleLibraryRepositoryErrorCode =
  | typeof BFN_MODULE_LIBRARY_INPUT_INVALID
  | typeof BFN_MODULE_LIBRARY_TEMPLATE_EXISTS
  | typeof BFN_MODULE_LIBRARY_TEMPLATE_NOT_FOUND
  | typeof BFN_MODULE_LIBRARY_METADATA_CORRUPT
  | typeof BFN_MODULE_LIBRARY_VERSION_CORRUPT
  | typeof BFN_MODULE_LIBRARY_STATE_CORRUPT
  | typeof BFN_MODULE_LIBRARY_REVISION_CONFLICT
  | typeof BFN_MODULE_LIBRARY_STORAGE_FAILED
  | typeof BFN_MODULE_LIBRARY_DATABASE_BLOCKED;

export class BfnModuleLibraryRepositoryError extends Error {
  constructor(readonly code: BfnModuleLibraryRepositoryErrorCode) {
    super(code);
    this.name = 'BfnModuleLibraryRepositoryError';
  }
}

export interface CreateBfnModuleLibraryTemplateInput {
  readonly templateId: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly note: string | null;
  readonly initialPayload: BfnReusableModulePayloadV1;
}

export interface UpdateBfnModuleLibraryMetadataInput {
  readonly templateId: string;
  readonly name: string;
  readonly description: string | null;
  readonly updatedAt: string;
}

export interface SaveBfnModuleLibraryScientificRevisionInput {
  readonly templateId: string;
  readonly payload: BfnReusableModulePayloadV1;
  readonly createdAt: string;
  readonly note: string | null;
}

export interface BfnModuleLibraryTemplateCreation {
  readonly metadata: BfnModuleTemplateMetadata;
  readonly version: BfnModuleTemplateVersionV1;
}

export interface BfnModuleLibraryScientificRevisionSave {
  readonly created: boolean;
  readonly metadata: BfnModuleTemplateMetadata;
  readonly version: BfnModuleTemplateVersionV1;
}

export interface BfnModuleLibraryRepository {
  readonly kind: 'indexeddb' | 'local-storage';
  createTemplate(
    input: CreateBfnModuleLibraryTemplateInput,
  ): Promise<BfnModuleLibraryTemplateCreation>;
  getTemplateMetadata(templateId: string): Promise<BfnModuleTemplateMetadata | null>;
  listTemplates(): Promise<BfnModuleTemplateMetadata[]>;
  getVersion(versionId: string): Promise<BfnModuleTemplateVersionV1 | null>;
  listVersions(templateId: string): Promise<BfnModuleTemplateVersionV1[]>;
  saveScientificRevision(
    input: SaveBfnModuleLibraryScientificRevisionInput,
  ): Promise<BfnModuleLibraryScientificRevisionSave>;
  updateMetadata(input: UpdateBfnModuleLibraryMetadataInput): Promise<BfnModuleTemplateMetadata>;
  deleteTemplate(templateId: string): Promise<void>;
}
