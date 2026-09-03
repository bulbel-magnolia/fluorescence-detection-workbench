import {
  createBfnModuleTemplateVersionV1,
  parseBfnModuleTemplateMetadata,
  parseBfnModuleTemplateVersion,
  type BfnModuleTemplateMetadata,
  type BfnModuleTemplateVersionV1,
} from './template';
import {
  hasOnlyKeys,
  isDeepDataTree,
  isNonEmptyString,
  isPlainDataRecord,
} from './template/templateInternals';
import {
  BFN_MODULE_LIBRARY_INPUT_INVALID,
  BFN_MODULE_LIBRARY_METADATA_CORRUPT,
  BFN_MODULE_LIBRARY_STATE_CORRUPT,
  BFN_MODULE_LIBRARY_STORAGE_FAILED,
  BFN_MODULE_LIBRARY_TEMPLATE_NOT_FOUND,
  BFN_MODULE_LIBRARY_VERSION_CORRUPT,
  BfnModuleLibraryRepositoryError,
  type BfnModuleLibraryRepositoryErrorCode,
  type BfnModuleLibraryTemplateCreation,
  type CreateBfnModuleLibraryTemplateInput,
  type SaveBfnModuleLibraryScientificRevisionInput,
  type UpdateBfnModuleLibraryMetadataInput,
} from './moduleLibraryTypes';

export interface BfnModuleLibrarySnapshot {
  readonly metadataById: ReadonlyMap<string, BfnModuleTemplateMetadata>;
  readonly versionById: ReadonlyMap<string, BfnModuleTemplateVersionV1>;
}

export function createInitialTemplateRecords(
  input: CreateBfnModuleLibraryTemplateInput,
): BfnModuleLibraryTemplateCreation {
  assertExactInput(input, [
    'templateId',
    'name',
    'description',
    'createdAt',
    'note',
    'initialPayload',
  ]);
  try {
    const metadata = parseBfnModuleTemplateMetadata({
      id: input.templateId,
      name: input.name,
      description: input.description,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      latestRevision: 1,
    });
    const version = createBfnModuleTemplateVersionV1({
      templateId: input.templateId,
      revision: 1,
      createdAt: input.createdAt,
      note: input.note,
      payload: input.initialPayload,
    });
    return { metadata, version };
  } catch {
    return fail(BFN_MODULE_LIBRARY_INPUT_INVALID);
  }
}

export function createScientificRevisionCandidate(
  input: SaveBfnModuleLibraryScientificRevisionInput,
  revision: number,
): BfnModuleTemplateVersionV1 {
  assertExactInput(input, ['templateId', 'payload', 'createdAt', 'note']);
  try {
    return createBfnModuleTemplateVersionV1({
      templateId: input.templateId,
      revision,
      createdAt: input.createdAt,
      note: input.note,
      payload: input.payload,
    });
  } catch {
    return fail(BFN_MODULE_LIBRARY_INPUT_INVALID);
  }
}

export function updateTemplateMetadataRecord(
  current: BfnModuleTemplateMetadata,
  input: UpdateBfnModuleLibraryMetadataInput,
): BfnModuleTemplateMetadata {
  const validated = validateMetadataUpdateInput(input);
  if (validated.templateId !== current.id) return fail(BFN_MODULE_LIBRARY_INPUT_INVALID);
  try {
    return parseBfnModuleTemplateMetadata({
      ...current,
      name: validated.name,
      description: validated.description,
      updatedAt: validated.updatedAt,
    });
  } catch {
    return fail(BFN_MODULE_LIBRARY_INPUT_INVALID);
  }
}

export function validateMetadataUpdateInput(
  input: UpdateBfnModuleLibraryMetadataInput,
): UpdateBfnModuleLibraryMetadataInput {
  assertExactInput(input, ['templateId', 'name', 'description', 'updatedAt']);
  try {
    parseBfnModuleTemplateMetadata({
      id: input.templateId,
      name: input.name,
      description: input.description,
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt,
      latestRevision: 1,
    });
    return structuredClone(input);
  } catch {
    return fail(BFN_MODULE_LIBRARY_INPUT_INVALID);
  }
}

export function requireNonEmptyIdentifier(value: unknown): string {
  if (!isNonEmptyString(value)) return fail(BFN_MODULE_LIBRARY_INPUT_INVALID);
  return value;
}

export function advanceTemplateMetadataRevision(
  current: BfnModuleTemplateMetadata,
  revision: number,
  updatedAt: string,
): BfnModuleTemplateMetadata {
  try {
    return parseBfnModuleTemplateMetadata({
      ...current,
      updatedAt,
      latestRevision: revision,
    });
  } catch {
    return fail(BFN_MODULE_LIBRARY_INPUT_INVALID);
  }
}

export function parseModuleLibraryRecords(
  metadataRecords: readonly unknown[],
  versionRecords: readonly unknown[],
): BfnModuleLibrarySnapshot {
  const metadataById = new Map<string, BfnModuleTemplateMetadata>();
  const versionById = new Map<string, BfnModuleTemplateVersionV1>();

  for (const value of metadataRecords) {
    const metadata = parseStoredMetadata(value);
    if (metadataById.has(metadata.id)) return fail(BFN_MODULE_LIBRARY_STATE_CORRUPT);
    metadataById.set(metadata.id, metadata);
  }
  for (const value of versionRecords) {
    const version = parseStoredVersion(value);
    if (versionById.has(version.id)) return fail(BFN_MODULE_LIBRARY_STATE_CORRUPT);
    versionById.set(version.id, version);
  }

  for (const version of versionById.values()) {
    if (!metadataById.has(version.templateId)) {
      return fail(BFN_MODULE_LIBRARY_STATE_CORRUPT);
    }
  }
  for (const metadata of metadataById.values()) {
    const versions = [...versionById.values()]
      .filter((version) => version.templateId === metadata.id)
      .sort((left, right) => left.revision - right.revision);
    if (
      versions.length === 0 ||
      versions.some((version, index) => version.revision !== index + 1) ||
      metadata.latestRevision !== versions.at(-1)?.revision
    ) {
      return fail(BFN_MODULE_LIBRARY_STATE_CORRUPT);
    }
  }
  return { metadataById, versionById };
}

export function parseStoredMetadata(value: unknown): BfnModuleTemplateMetadata {
  try {
    return parseBfnModuleTemplateMetadata(value);
  } catch {
    return fail(BFN_MODULE_LIBRARY_METADATA_CORRUPT);
  }
}

export function parseStoredVersion(value: unknown): BfnModuleTemplateVersionV1 {
  try {
    return parseBfnModuleTemplateVersion(value);
  } catch {
    return fail(BFN_MODULE_LIBRARY_VERSION_CORRUPT);
  }
}

export function requireTemplateMetadata(
  snapshot: BfnModuleLibrarySnapshot,
  templateId: string,
): BfnModuleTemplateMetadata {
  const metadata = snapshot.metadataById.get(templateId);
  if (!metadata) return fail(BFN_MODULE_LIBRARY_TEMPLATE_NOT_FOUND);
  return metadata;
}

export function cloneTemplateMetadata(
  metadata: BfnModuleTemplateMetadata,
): BfnModuleTemplateMetadata {
  return parseBfnModuleTemplateMetadata(metadata);
}

export function cloneTemplateVersion(
  version: BfnModuleTemplateVersionV1,
): BfnModuleTemplateVersionV1 {
  return parseBfnModuleTemplateVersion(version);
}

export function orderedTemplateMetadata(
  values: Iterable<BfnModuleTemplateMetadata>,
): BfnModuleTemplateMetadata[] {
  return [...values]
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
    )
    .map(cloneTemplateMetadata);
}

export function orderedTemplateVersions(
  values: Iterable<BfnModuleTemplateVersionV1>,
  templateId: string,
): BfnModuleTemplateVersionV1[] {
  return [...values]
    .filter((version) => version.templateId === templateId)
    .sort((left, right) => right.revision - left.revision)
    .map(cloneTemplateVersion);
}

export function fail(code: BfnModuleLibraryRepositoryErrorCode): never {
  throw new BfnModuleLibraryRepositoryError(code);
}

export function rethrowAsStorageFailure(error: unknown): never {
  if (error instanceof BfnModuleLibraryRepositoryError) throw error;
  return fail(BFN_MODULE_LIBRARY_STORAGE_FAILED);
}

function assertExactInput(value: unknown, keys: readonly string[]): void {
  if (!isDeepDataTree(value) || !isPlainDataRecord(value) || !hasOnlyKeys(value, keys)) {
    fail(BFN_MODULE_LIBRARY_INPUT_INVALID);
  }
}
