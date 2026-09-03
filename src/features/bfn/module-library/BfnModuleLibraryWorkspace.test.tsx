import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import type { BfnProject } from '../types';
import { createLocalStorageBfnModuleLibraryRepository } from './localStorageModuleLibraryRepository';
import { BfnModuleLibraryWorkspace } from './BfnModuleLibraryWorkspace';
import type { BfnModuleLibraryRepository } from './moduleLibraryTypes';
import {
  buildReusableModuleCaptureAvailability,
  createModuleInstanceIdCandidate,
} from './moduleLibraryWorkflow';
import { instantiateReusableModuleTemplate, type BfnReusableModulePayloadV1 } from './template';
import {
  captureAccumulatorFixture,
  captureFirstOrderFixture,
  captureStaticFixture,
  createBlankTemplateProject,
  createStaticTemplateProject,
} from './template/templateTestFixtures';

const TIME_1 = '2026-09-03T08:00:00.000Z';
const TIME_2 = '2026-09-03T09:00:00.000Z';
const TIME_3 = '2026-09-03T10:00:00.000Z';

type InstantiateHandler = NonNullable<
  React.ComponentProps<typeof BfnModuleLibraryWorkspace>['onInstantiate']
>;

describe('My Modules workspace', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('en-US');
  });

  it('shows a calm empty state for a new library', async () => {
    renderLibrary(createLocalStorageBfnModuleLibraryRepository());
    expect(await screen.findByText('No saved modules yet')).toBeInTheDocument();
    expect(screen.getByText(/Select a supported user-authored module/u)).toBeInTheDocument();
  });

  it('lists saved modules in deterministic most-recently-updated order', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(repository, 'module.older', 'Older response', TIME_1);
    await seed(repository, 'module.newer', 'Newer response', TIME_2);
    renderLibrary(repository);
    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveTextContent('Newer response');
    expect(rows[2]).toHaveTextContent('Older response');
  });

  it('opens the latest scientific version by default', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(repository, 'module.versioned', 'Versioned response', TIME_1);
    await repository.saveScientificRevision({
      templateId: 'module.versioned',
      payload: changedStaticPayload(2.4),
      createdAt: TIME_2,
      note: 'Raised maximum output.',
    });
    renderLibrary(repository);
    expect(await screen.findByRole('combobox', { name: 'Module version' })).toHaveValue(
      'module.versioned:version:2',
    );
    expect(screen.getByText('Raised maximum output.')).toBeInTheDocument();
  });

  it('lets researchers inspect a historical version as read-only science', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(repository, 'module.history', 'History response', TIME_1);
    await repository.saveScientificRevision({
      templateId: 'module.history',
      payload: changedStaticPayload(2.4),
      createdAt: TIME_2,
      note: 'Latest definition.',
    });
    renderLibrary(repository);
    const version = await screen.findByRole('combobox', { name: 'Module version' });
    await user.selectOptions(version, 'module.history:version:1');
    expect(screen.getByRole('option', { name: 'Version 1 · read only' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('renders scientific quantities, units, model, parameters, applicability, evidence, and version', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(repository, 'module.science', 'Scientific response', TIME_1);
    renderLibrary(repository);
    await screen.findByRole('combobox', { name: 'Module version' });
    expect(screen.getByText('Concentration · nM')).toBeInTheDocument();
    expect(screen.getByText('Hill activation')).toBeInTheDocument();
    expect(screen.getByText('Half-response concentration')).toBeInTheDocument();
    expect(screen.getByText('Escherichia coli')).toBeInTheDocument();
    expect(screen.getByText('Fitted from published data')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Version 1 · latest' })).toBeInTheDocument();
  });

  it('scopes static model evidence to provenance declared by that model', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(repository, 'module.evidence-scope', 'Scoped evidence', TIME_1);
    renderLibrary(repository);
    await screen.findByRole('combobox', { name: 'Module version' });

    const evidence = screen.getByRole('heading', { name: 'Evidence' }).closest('section');
    expect(evidence).not.toBeNull();
    expect(within(evidence!).getByText('doi:10.0000/template-model')).toBeVisible();
    expect(within(evidence!).queryByText('registry:template-implementation')).toBeNull();
  });

  it('scopes accumulator evidence to provenance declared by its dynamic model', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(
      repository,
      'module.accumulator-evidence-scope',
      'Scoped accumulator evidence',
      TIME_1,
      accumulatorWithImplementationProvenance(),
    );
    renderLibrary(repository);
    await screen.findByRole('combobox', { name: 'Module version' });

    const evidence = screen.getByRole('heading', { name: 'Evidence' }).closest('section');
    expect(evidence).not.toBeNull();
    expect(within(evidence!).getByText('doi:10.0000/accumulator-model')).toBeVisible();
    expect(within(evidence!).queryByText('registry:accumulator-implementation')).toBeNull();
  });

  it('separates first-order response metadata when the scientific scopes differ', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(
      repository,
      'module.distinct-scopes',
      'Distinct scientific scopes',
      TIME_1,
      distinctFirstOrderPayload(),
    );
    renderLibrary(repository);
    await screen.findByRole('combobox', { name: 'Module version' });

    const steady = screen.getByRole('region', { name: 'Steady-state response' });
    const dynamic = screen.getByRole('region', { name: 'Dynamic response' });
    expect(within(steady).getByText('Fitted from published data')).toBeVisible();
    expect(within(steady).getByText('doi:10.0000/template-model')).toBeVisible();
    expect(within(steady).queryByText('doi:10.0000/template-dynamic')).toBeNull();
    expect(within(dynamic).getByText('Measured in multiple conditions')).toBeVisible();
    expect(within(dynamic).getByText('doi:10.0000/template-dynamic')).toBeVisible();
    expect(within(dynamic).queryByText('doi:10.0000/template-model')).toBeNull();
  });

  it('compacts identical first-order scientific metadata into one shared summary', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(
      repository,
      'module.shared-scope',
      'Shared scientific scope',
      TIME_1,
      captureFirstOrderFixture(),
    );
    renderLibrary(repository);
    await screen.findByRole('combobox', { name: 'Module version' });

    expect(screen.queryByRole('region', { name: 'Steady-state response' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Dynamic response' })).toBeNull();
    expect(screen.getAllByRole('heading', { name: 'Applicability' })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { name: 'Evidence' })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { name: 'Uncertainty' })).toHaveLength(1);
  });

  it('keeps ordinary visible copy free of implementation vocabulary and raw identifiers', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(repository, 'internal.saved-module-id', 'Clean scientific response', TIME_1);
    const { container } = renderLibrary(repository);
    await screen.findByRole('combobox', { name: 'Module version' });
    const visible = container.textContent ?? '';
    for (const banned of [
      'payload',
      'payloadSignature',
      'schemaVersion',
      'dependency closure',
      'materialize',
      'instantiate',
      'slot',
      'sidecar',
      'IndexedDB',
      'localStorage',
      'activeModelIds',
      'modelVariants',
      'sourceEntityId',
      'internal.saved-module-id',
      'source.module.static.port.in',
    ]) {
      expect(visible).not.toContain(banned);
    }
  });

  it('saves the selected supported module as a new reusable module', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    const source = createStaticTemplateProject();
    renderLibrary(repository, {
      project: source,
      initialView: { kind: 'save', moduleId: source.network.modules[0]!.id },
    });
    await user.click(await screen.findByRole('button', { name: 'Save new module' }));
    await waitFor(async () => expect(await repository.listTemplates()).toHaveLength(1));
    expect(await repository.listVersions((await repository.listTemplates())[0]!.id)).toHaveLength(
      1,
    );
  });

  it('does not guess an existing saved module from an equal name', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(repository, 'module.same-name', 'Static template fixture', TIME_1);
    const source = createStaticTemplateProject();
    renderLibrary(repository, {
      project: source,
      initialView: { kind: 'save', moduleId: source.network.modules[0]!.id },
    });
    await user.click(
      await screen.findByRole('radio', { name: /New version of an existing module/u }),
    );
    expect(screen.getByRole('combobox', { name: 'Saved module' })).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Save new version' }));
    expect(await screen.findByText('Choose the existing saved module explicitly.')).toBeVisible();
  });

  it('does not create a version when the scientific definition is unchanged', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(repository, 'module.same-science', 'Existing response', TIME_1);
    const source = createStaticTemplateProject();
    renderLibrary(repository, {
      project: source,
      initialView: { kind: 'save', moduleId: source.network.modules[0]!.id },
    });
    await user.click(
      await screen.findByRole('radio', { name: /New version of an existing module/u }),
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Saved module' }),
      'module.same-science',
    );
    await user.click(screen.getByRole('button', { name: 'Save new version' }));
    expect(await screen.findByText(/no new version was added/u)).toBeVisible();
    expect(await repository.listVersions('module.same-science')).toHaveLength(1);
  });

  it('creates a scientific version only for an explicitly selected destination', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(repository, 'module.explicit', 'Explicit response', TIME_1);
    const source = createStaticTemplateProject();
    const model = source.network.modules[0]!.modelVariants[0]!;
    if (model.mode !== 'static' || !('ymax' in model.response)) {
      throw new Error('Expected a Hill source fixture.');
    }
    model.response.ymax = { value: 2.4, unit: 'RPU', interval95: [2.2, 2.6] };
    renderLibrary(repository, {
      project: source,
      initialView: { kind: 'save', moduleId: source.network.modules[0]!.id },
    });
    await user.click(
      await screen.findByRole('radio', { name: /New version of an existing module/u }),
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Saved module' }),
      'module.explicit',
    );
    await user.click(screen.getByRole('button', { name: 'Save new version' }));
    await waitFor(async () =>
      expect(await repository.listVersions('module.explicit')).toHaveLength(2),
    );
  });

  it('edits library details without creating a scientific version', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(repository, 'module.rename', 'Original name', TIME_1);
    renderLibrary(repository);
    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Renamed response');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(async () =>
      expect(await repository.getTemplateMetadata('module.rename')).toMatchObject({
        name: 'Renamed response',
        latestRevision: 1,
      }),
    );
    expect(await repository.listVersions('module.rename')).toHaveLength(1);
  });

  it('discards metadata drafts when editing is cancelled', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    const updateMetadata = vi.spyOn(repository, 'updateMetadata');
    await seed(repository, 'module.cancel-edit', 'Original', TIME_1);
    const originalVersionCount = (await repository.listVersions('module.cancel-edit')).length;
    renderLibrary(repository);

    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    const description = screen.getByRole('textbox', { name: 'Description' });
    await user.clear(name);
    await user.type(name, 'Draft');
    await user.clear(description);
    await user.type(description, 'Draft description');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(updateMetadata).not.toHaveBeenCalled();
    expect(await repository.getTemplateMetadata('module.cancel-edit')).toMatchObject({
      name: 'Original',
      description: 'Original description',
      latestRevision: 1,
    });
    expect(await repository.listVersions('module.cancel-edit')).toHaveLength(originalVersionCount);

    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Original');
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
      'Original description',
    );
  });

  it('deletes the whole saved module only after explicit history confirmation', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(repository, 'module.delete', 'Delete response', TIME_1);
    await repository.saveScientificRevision({
      templateId: 'module.delete',
      payload: changedStaticPayload(2.4),
      createdAt: TIME_2,
      note: null,
    });
    renderLibrary(repository);
    await user.click(await screen.findByRole('button', { name: 'Delete saved module' }));
    const confirmation = screen.getByRole('alertdialog', { name: 'Delete “Delete response”?' });
    expect(confirmation).toHaveTextContent('2 version(s) will be removed');
    expect(confirmation).toHaveTextContent('Copies already added to projects remain unchanged');
    await user.click(within(confirmation).getByRole('button', { name: 'Delete saved module' }));
    await waitFor(async () => expect(await repository.listTemplates()).toEqual([]));
  });

  it('shows a friendly no-repair state for inconsistent library records', async () => {
    const base = createLocalStorageBfnModuleLibraryRepository();
    const repository: BfnModuleLibraryRepository = {
      ...base,
      listTemplates: vi.fn(() =>
        Promise.resolve([
          {
            id: 'module.corrupt',
            name: 'Unreadable response',
            description: null,
            createdAt: TIME_1,
            updatedAt: TIME_1,
            latestRevision: 1,
          },
        ]),
      ),
      getVersion: vi.fn(() => Promise.resolve(null)),
    };
    renderLibrary(repository);
    expect(await screen.findByText(/A saved module record could not be read/u)).toBeInTheDocument();
    expect(screen.getByText(/will not alter or repair/u)).toBeInTheDocument();
  });

  it('presents private biological identities as travelling with the saved module by default', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    const source = createStaticTemplateProject();
    renderLibrary(repository, {
      project: source,
      initialView: { kind: 'save', moduleId: source.network.modules[0]!.id },
    });
    expect(
      await screen.findAllByText('Used only by this module in the current project'),
    ).toHaveLength(2);
    expect(
      screen
        .getAllByRole<HTMLInputElement>('radio', {
          name: 'Save its definition with the module',
        })
        .every((control) => control.checked),
    ).toBe(true);
  });

  it('explains shared biological identity handling in natural scientific language', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    const source = projectWithSharedOutput();
    renderLibrary(repository, {
      project: source,
      initialView: { kind: 'save', moduleId: source.network.modules[0]!.id },
    });
    expect(
      await screen.findByText('Shared project identity; confirm it again when adding'),
    ).toBeVisible();
  });

  it('adds recognized identities without asking for a manual match', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(
      repository,
      'module.recognized',
      'Recognized signal pool',
      TIME_1,
      captureAccumulatorFixture(),
    );
    const target = createBlankTemplateProject('target.recognized');
    const onInstantiate = createInstantiationSpy(target);
    renderLibrary(repository, { project: target, onInstantiate });
    await screen.findByRole('combobox', { name: 'Module version' });
    expect(screen.queryByText(/confirm exact scientific equivalence/u)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add to project' }));
    expect(onInstantiate).toHaveBeenCalledWith(
      expect.anything(),
      {},
      expect.objectContaining({ instanceName: 'Recognized signal pool' }),
    );
  });

  it('keeps Add disabled until every shared identity is explicitly confirmed', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(repository, 'module.two-shared', 'Two shared identities', TIME_1, twoSlotPayload());
    renderLibrary(repository);
    await screen.findByRole('combobox', { name: 'Module version' });
    const add = screen.getByRole('button', { name: 'Add to project' });
    const confirmations = screen.getAllByRole('checkbox');
    expect(confirmations).toHaveLength(2);
    expect(add).toBeDisabled();
    await user.click(confirmations[0]!);
    expect(add).toBeDisabled();
    await user.click(confirmations[1]!);
    expect(add).toBeEnabled();
  });

  it('passes a confirmed fresh-entity decision to the existing add flow', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(
      repository,
      'module.fresh-entity',
      'Fresh identity response',
      TIME_1,
      oneSlotPayload(),
    );
    const target = createBlankTemplateProject('target.fresh');
    const onInstantiate = createInstantiationSpy(target);
    renderLibrary(repository, { project: target, onInstantiate });
    await screen.findByRole('combobox', { name: 'Module version' });
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Add to project' }));
    expect(onInstantiate.mock.calls[0]?.[1]).toEqual({
      'entity.1': {
        mode: 'create_same_entity',
        identityConfirmation: 'same_scientific_entity',
      },
    });
  });

  it('passes only the explicitly chosen existing scientific identity', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(
      repository,
      'module.existing-entity',
      'Existing identity response',
      TIME_1,
      oneSlotPayload(),
    );
    const target = createStaticTemplateProject('target.existing');
    const exactEntity = target.registry.entities[0]!;
    const onInstantiate = createInstantiationSpy(target);
    renderLibrary(repository, { project: target, onInstantiate });
    await screen.findByRole('combobox', { name: 'Module version' });
    await user.click(screen.getByRole('radio', { name: 'Use an existing project entity' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Existing project entity' }),
      exactEntity.id,
    );
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Add to project' }));
    expect(onInstantiate.mock.calls[0]?.[1]).toEqual({
      'entity.1': {
        mode: 'existing_same_entity',
        targetEntityId: exactEntity.id,
        identityConfirmation: 'same_scientific_entity',
      },
    });
  });

  it('states the complete no-automatic-graph boundary next to the primary action', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    await seed(repository, 'module.boundary', 'Boundary response', TIME_1);
    renderLibrary(repository);
    await screen.findByRole('combobox', { name: 'Module version' });
    expect(
      screen.getByText(
        'No connection, input source, output monitor, mode change, signal pool, wiring, or run is created.',
      ),
    ).toBeVisible();
  });

  it('keeps an added project copy after its saved source is deleted', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    const created = await seed(repository, 'module.independent', 'Independent response', TIME_1);
    const target = createBlankTemplateProject('target.independent');
    const instanceId = createModuleInstanceIdCandidate('Independent response', TIME_3, target);
    if (!instanceId) throw new Error('Expected a project-copy candidate.');
    const added = instantiateReusableModuleTemplate(
      created.version,
      target,
      {},
      {
        instanceId,
        instanceName: 'Independent response',
        instanceDescription: null,
      },
    );
    expect(added.ok).toBe(true);
    await repository.deleteTemplate('module.independent');
    expect(await repository.listTemplates()).toEqual([]);
    if (added.ok) expect(added.nextProject.network.modules).toHaveLength(1);
  });

  it('keeps the saved scientific definition unchanged after editing a project copy', async () => {
    const repository = createLocalStorageBfnModuleLibraryRepository();
    const created = await seed(repository, 'module.immutable', 'Immutable response', TIME_1);
    const target = createBlankTemplateProject('target.immutable');
    const added = instantiateReusableModuleTemplate(
      created.version,
      target,
      {},
      {
        instanceId: 'user.module.independent-copy',
        instanceName: 'Project copy',
        instanceDescription: null,
      },
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    added.nextProject.network.modules[0]!.authoring!.name = 'Edited project copy';
    expect((await repository.getVersion(created.version.id))?.payload).toEqual(
      created.version.payload,
    );
  });
});

function projectWithSharedOutput() {
  const project = createStaticTemplateProject('source.module.shared');
  const port = project.network.modules[0]!.outputPorts[0]!;
  project.network.outputMonitors.push({
    kind: 'output_monitor',
    id: 'monitor.shared',
    labelKey: 'bfn.fixture.monitor',
    inputPort: { ...port, id: 'monitor.shared.port', direction: 'input' },
    position: { x: 0, y: 0 },
  });
  return project;
}

function oneSlotPayload(): BfnReusableModulePayloadV1 {
  const project = createStaticTemplateProject('source.module.one-slot');
  const module = project.network.modules[0]!;
  const availability = buildReusableModuleCaptureAvailability(project, module.id, {
    [module.inputPorts[0]!.entity]: 'slot',
  });
  if (!availability.supported) throw new Error('Expected a reusable one-identity fixture.');
  return availability.payload;
}

function twoSlotPayload(): BfnReusableModulePayloadV1 {
  const project = createStaticTemplateProject('source.module.two-slots');
  const module = project.network.modules[0]!;
  const availability = buildReusableModuleCaptureAvailability(
    project,
    module.id,
    Object.fromEntries(
      [...module.inputPorts, ...module.outputPorts].map((port) => [port.entity, 'slot']),
    ),
  );
  if (!availability.supported) throw new Error('Expected a reusable two-identity fixture.');
  return availability.payload;
}

function renderLibrary(
  repository: BfnModuleLibraryRepository,
  overrides: Partial<React.ComponentProps<typeof BfnModuleLibraryWorkspace>> = {},
) {
  const project = createBlankTemplateProject('target.project');
  return render(
    <BfnModuleLibraryWorkspace
      project={project}
      repository={repository}
      initialView={{ kind: 'browse' }}
      onBack={vi.fn()}
      onInstantiate={(version, bindings, options) =>
        instantiateReusableModuleTemplate(version, project, bindings, options)
      }
      clock={() => TIME_3}
      {...overrides}
    />,
  );
}

function createInstantiationSpy(target: BfnProject) {
  const instantiate: InstantiateHandler = (version, bindings, options) =>
    instantiateReusableModuleTemplate(version, target, bindings, options);
  return vi.fn(instantiate);
}

async function seed(
  repository: BfnModuleLibraryRepository,
  templateId: string,
  name: string,
  createdAt: string,
  payload: BfnReusableModulePayloadV1 = captureStaticFixture(),
) {
  return repository.createTemplate({
    templateId,
    name,
    description: name + ' description',
    createdAt,
    note: 'Initial definition.',
    initialPayload: payload,
  });
}

function changedStaticPayload(maximum: number): BfnReusableModulePayloadV1 {
  const payload = structuredClone(captureStaticFixture());
  if (payload.moduleClass !== 'static' || !('ymax' in payload.models.static.response)) {
    throw new Error('Expected a Hill response fixture.');
  }
  return {
    ...payload,
    models: {
      static: {
        ...payload.models.static,
        response: {
          ...payload.models.static.response,
          ymax: {
            value: maximum,
            unit: 'RPU',
            interval95: [maximum - 0.2, maximum + 0.2],
          },
        },
      },
    },
  };
}

function distinctFirstOrderPayload(): BfnReusableModulePayloadV1 {
  const payload = captureFirstOrderFixture();
  if (payload.moduleClass !== 'first_order') {
    throw new Error('Expected a first-order response fixture.');
  }
  const dynamicProvenance = {
    key: `provenance.${payload.provenance.length + 1}`,
    kind: 'publication' as const,
    reference: 'doi:10.0000/template-dynamic',
  };
  return {
    ...payload,
    provenance: [...payload.provenance, dynamicProvenance],
    models: {
      static: payload.models.static,
      dynamic: {
        ...payload.models.dynamic,
        provenanceKeys: [dynamicProvenance.key],
        evidenceGrade: 'measured_multiple_contexts',
      },
    },
  };
}

function accumulatorWithImplementationProvenance(): BfnReusableModulePayloadV1 {
  const accumulator = captureAccumulatorFixture();
  const staticPayload = captureStaticFixture();
  if (
    accumulator.moduleClass !== 'accumulator' ||
    staticPayload.moduleClass !== 'static' ||
    !staticPayload.implementations[0]
  ) {
    throw new Error('Expected accumulator and implementation fixtures.');
  }
  const modelProvenance = {
    key: 'provenance.1',
    kind: 'publication' as const,
    reference: 'doi:10.0000/accumulator-model',
  };
  const implementationProvenance = {
    key: 'provenance.2',
    kind: 'repository_record' as const,
    reference: 'registry:accumulator-implementation',
  };
  return {
    ...accumulator,
    provenance: [modelProvenance, implementationProvenance],
    models: {
      dynamic: {
        ...accumulator.models.dynamic,
        provenanceKeys: [modelProvenance.key],
      },
    },
    implementations: [
      {
        ...staticPayload.implementations[0],
        provenanceKeys: [implementationProvenance.key],
      },
    ],
    implementationKeys: ['implementation.1'],
    implementationState: staticPayload.implementationState,
  };
}
