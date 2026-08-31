import { getTrustedAhlHslCatalogRelease } from '../../../modeling/catalog/v2/catalogReleaseLoader';

export interface DesignedSenderSignalIdentity {
  readonly catalogSignalId: string;
  readonly entityId: string;
  readonly displayName: string;
}

/**
 * Returns the AHL/HSL chemical identities exposed to Designed Sender authoring.
 * Catalog IDs select records; canonical names remain the exact BFN Entity identity.
 */
export function getDesignedSenderSignalCatalog(): readonly DesignedSenderSignalIdentity[] {
  const identities = getTrustedAhlHslCatalogRelease()
    .release.signals.filter((signal) => signal.id.startsWith('ahl.'))
    .map((signal) =>
      Object.freeze({
        catalogSignalId: signal.id,
        entityId: signal.canonical_name,
        displayName: signal.canonical_name,
      }),
    );
  return Object.freeze(identities);
}
