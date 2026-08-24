import { loadAhlHslCatalogRelease } from './catalogReleaseLoader';
import { matchesAhlHslRuntimeDemoWhitelist } from './catalogRuntimeDemoWhitelist';
import type {
  CatalogV2CompatibilityRelation,
  CatalogV2ReceiverResponse,
  ComponentCatalogV2,
} from './catalogTypes';

export interface CatalogReleaseLookup {
  componentId: string;
  signalId: string;
  contextId: string;
}

export interface CatalogReleaseIndex {
  catalog: ComponentCatalogV2;
  findResponses(lookup: CatalogReleaseLookup): readonly CatalogV2ReceiverResponse[];
  findRuntimeResponses(lookup: CatalogReleaseLookup): readonly CatalogV2ReceiverResponse[];
  findCompatibilityRelations(lookup: CatalogReleaseLookup): readonly CatalogV2CompatibilityRelation[];
}

const EMPTY_RESPONSES: readonly CatalogV2ReceiverResponse[] = Object.freeze([]);
const EMPTY_COMPATIBILITY_RELATIONS: readonly CatalogV2CompatibilityRelation[] = Object.freeze([]);

export function buildCatalogReleaseIndex(catalog: ComponentCatalogV2): CatalogReleaseIndex {
  const responsesByKey = new Map<string, CatalogV2ReceiverResponse[]>();
  const runtimeResponsesByKey = new Map<string, CatalogV2ReceiverResponse[]>();
  const compatibilityRelations = Object.freeze([...catalog.compatibilityRelations]);

  for (const response of catalog.receiverResponses) {
    const key = lookupKey(response.receiverComponentId, response.inputSignalId, response.parameterContextId);
    append(responsesByKey, key, response);
    if (isExecutableRuntimeDemoResponse(response))
      append(runtimeResponsesByKey, key, response);
  }
  freezeIndexedValues(responsesByKey);
  freezeIndexedValues(runtimeResponsesByKey);

  return Object.freeze({
    catalog,
    findResponses(lookup: CatalogReleaseLookup): readonly CatalogV2ReceiverResponse[] {
      return (
        responsesByKey.get(lookupKey(lookup.componentId, lookup.signalId, lookup.contextId)) ??
        EMPTY_RESPONSES
      );
    },
    findRuntimeResponses(lookup: CatalogReleaseLookup): readonly CatalogV2ReceiverResponse[] {
      return (
        runtimeResponsesByKey.get(lookupKey(lookup.componentId, lookup.signalId, lookup.contextId)) ??
        EMPTY_RESPONSES
      );
    },
    findCompatibilityRelations(lookup: CatalogReleaseLookup): readonly CatalogV2CompatibilityRelation[] {
      const matches = compatibilityRelations.filter(
        (relation) =>
          relation.parameterContextId === lookup.contextId &&
          relation.inputSignalId === lookup.signalId &&
          (relation.receiverComponentId === lookup.componentId ||
            relation.senderComponentId === lookup.componentId),
      );
      return matches.length === 0 ? EMPTY_COMPATIBILITY_RELATIONS : Object.freeze(matches);
    },
  });
}

let cachedIndex: CatalogReleaseIndex | undefined;

export function getCatalogReleaseIndex(): CatalogReleaseIndex {
  if (cachedIndex === undefined) cachedIndex = buildCatalogReleaseIndex(loadAhlHslCatalogRelease().catalog);
  return cachedIndex;
}

function append(
  map: Map<string, CatalogV2ReceiverResponse[]>,
  key: string,
  response: CatalogV2ReceiverResponse,
): void {
  const values = map.get(key) ?? [];
  values.push(response);
  map.set(key, values);
}

function freezeIndexedValues<T>(map: Map<string, T[]>): void {
  for (const values of map.values()) Object.freeze(values);
}

function lookupKey(componentId: string, signalId: string, contextId: string): string {
  return componentId + '\u001f' + signalId + '\u001f' + contextId;
}

function isExecutableRuntimeDemoResponse(response: CatalogV2ReceiverResponse): boolean {
  const sourceResponse = response.sourceResponse;
  return (
    response.admission.status === 'runtime-demo' &&
    response.admission.simulationReady === true &&
    sourceResponse !== undefined &&
    sourceResponse.softwareStatus === 'runtime-demo' &&
    matchesAhlHslRuntimeDemoWhitelist({
      id: response.id,
      demoImplementation: sourceResponse.demoImplementation,
      modelType: sourceResponse.modelType,
      numericalExecutionAllowed: sourceResponse.numericalExecutionAllowed,
      normalizedDemoOnly: sourceResponse.normalizedDemoOnly,
      fixedWeightCandidate: sourceResponse.fixedWeightCandidate,
    })
  );
}
