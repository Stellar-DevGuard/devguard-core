import { RpcError } from './index.js';

/** Validate a serialized Stellar TransactionEnvelope (base64 XDR).
 * This does not decode or sign it; Stellar RPC validates the XDR semantics.
 */
export function assertEnvelopeXdr(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_000_000 ||
      value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new TypeError('Transaction envelope must be canonical base64 XDR (maximum 2MB)');
  }
  // Reject non-canonical padding bits and malformed encodings.
  if (Buffer.from(value, 'base64').toString('base64') !== value) {
    throw new TypeError('Transaction envelope must use canonical base64');
  }
  return value;
}

export function summarizeSimulation(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new RpcError('Malformed simulation result', { method: 'simulateTransaction' });
  }
  const error = typeof result.error === 'string' ? result.error : null;
  const fee = result.minResourceFee === undefined ? null : String(result.minResourceFee);
  const results = Array.isArray(result.results) ? result.results : [];
  return {
    success: !error,
    error,
    latestLedger: result.latestLedger ?? null,
    minResourceFeeStroops: fee,
    cpuInstructions: result.cost?.cpuInsns ?? null,
    memoryBytes: result.cost?.memBytes ?? null,
    authorizationEntries: results.reduce((sum, item) => sum + (Array.isArray(item?.auth) ? item.auth.length : 0), 0),
    emittedEvents: Array.isArray(result.events) ? result.events.length : 0,
    requiresRestore: result.restorePreamble != null,
    hasTransactionData: typeof result.transactionData === 'string'
  };
}

/** Only invokes simulation: never calls sendTransaction or signs anything. */
export async function simulate(rpc, envelopeXdr, { instructionLeeway } = {}) {
  const transaction = assertEnvelopeXdr(envelopeXdr);
  const params = { transaction };
  if (instructionLeeway !== undefined) {
    if (!Number.isSafeInteger(instructionLeeway) || instructionLeeway < 0 || instructionLeeway > 100_000_000) {
      throw new RangeError('instructionLeeway must be an integer between 0 and 100000000');
    }
    params.resourceConfig = { instructionLeeway };
  }
  const raw = await rpc.call('simulateTransaction', params);
  return { summary: summarizeSimulation(raw), raw };
}
