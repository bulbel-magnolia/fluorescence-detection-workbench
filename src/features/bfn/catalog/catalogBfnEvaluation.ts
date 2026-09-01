import {
  evaluateReceiverResponse,
  ReceiverResponseEvaluationError,
} from '../../modeling/receiverResponseEvaluator';
import { evaluateStaticResponse, type BfnParameterScenario } from '../responseMath';
import type { BfnFunctionalModule, BfnModelVariant, BfnProject } from '../types';
import { BfnCatalogContractError, bfnCatalogReferencePresence } from './catalogBfnTypes';
import { verifyBfnCatalogModel } from './catalogBfnVerification';

const inputErrorCodes = new Set([
  'RECEIVER_RESPONSE_INPUT_NOT_FINITE',
  'RECEIVER_RESPONSE_INPUT_NEGATIVE',
  'RECEIVER_RESPONSE_INPUT_OUT_OF_RANGE',
]);

export function evaluateBfnModuleModel(
  project: BfnProject,
  module: BfnFunctionalModule,
  model: BfnModelVariant,
  inputs: Readonly<Record<string, number>>,
  scenario: BfnParameterScenario = 'estimate',
): number {
  if (model.mode === 'dynamic' && model.family === 'accumulator') {
    throw new Error('BFN_DYNAMIC_PROCESS_RUNTIME_UNSUPPORTED');
  }
  const presence = bfnCatalogReferencePresence(model);
  if (!presence.present) {
    const response = model.mode === 'static' ? model.response : model.steadyStateResponse;
    return evaluateStaticResponse(response, inputs, scenario);
  }

  const verified = verifyBfnCatalogModel(project, module, model);
  const inputPort = module.inputPorts[0];
  if (inputPort === undefined) {
    throw new BfnCatalogContractError('catalog_model_mismatch', { subjectId: model.id });
  }
  if (!Object.prototype.hasOwnProperty.call(inputs, inputPort.id)) {
    throw new BfnCatalogContractError('catalog_required_input_unconnected', {
      subjectId: inputPort.id,
    });
  }
  const input = inputs[inputPort.id];
  if (input === undefined) {
    throw new BfnCatalogContractError('catalog_input_out_of_range', {
      subjectId: model.id,
    });
  }
  try {
    return evaluateReceiverResponse(verified.binding, input, 'M');
  } catch (error) {
    if (error instanceof ReceiverResponseEvaluationError && inputErrorCodes.has(error.code)) {
      throw new BfnCatalogContractError('catalog_input_out_of_range', {
        subjectId: model.id,
      });
    }
    throw new BfnCatalogContractError('catalog_execution_unavailable', {
      subjectId: model.id,
    });
  }
}
