import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEnvelopeXdr, summarizeSimulation, simulate } from '../src/simulation.js';
import { NETWORKS } from '../src/index.js';
import { run } from '../src/cli.js';

test('validates canonical base64 envelopes', () => {
  assert.equal(assertEnvelopeXdr('AAAAAA=='), 'AAAAAA==');
  for (const x of ['', '!', 'Zg=', 'Zh==', 'a'.repeat(2_000_004)]) {
    assert.throws(() => assertEnvelopeXdr(x), /base64|envelope/i);
  }
});

test('calls simulateTransaction without broadcasting', async () => {
  const calls = [];
  const rpc = { call: async (method, params) => {
    calls.push({ method, params });
    return { minResourceFee: '1234', cost: { cpuInsns: '777', memBytes: '321' }, results: [{ auth: ['a', 'b'] }], events: ['evt'], latestLedger: 55 };
  }};
  const simulation = await simulate(rpc, 'AAAAAA==', { instructionLeeway: 3000000 });
  assert.deepEqual(calls, [{ method: 'simulateTransaction', params: { transaction: 'AAAAAA==', resourceConfig: { instructionLeeway: 3000000 } } }]);
  assert.equal(simulation.summary.minResourceFeeStroops, '1234');
  assert.equal(simulation.summary.authorizationEntries, 2);
  assert.equal(simulation.summary.emittedEvents, 1);
  assert.equal(simulation.summary.success, true);
});

test('reports failed simulation and restore requirements', () => {
  assert.equal(summarizeSimulation({ error: 'host invocation failed', restorePreamble: {} }).success, false);
  assert.equal(summarizeSimulation({ restorePreamble: {} }).requiresRestore, true);
  assert.throws(() => summarizeSimulation(null), /Malformed/);
});

test('rejects invalid leeway without making a network call', async () => {
  const rpc = { call: () => { throw Error('Should not call RPC'); } };
  await assert.rejects(simulate(rpc, 'AAAAAA==', { instructionLeeway: -1 }), /instructionLeeway/);
});

test('CLI verifies selected network before simulating', async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request.method);
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: request.id,
      result: request.method === 'getNetwork' ? { passphrase: NETWORKS.testnet.passphrase } :
        { minResourceFee: '42', cost: { cpuInsns: '10' } } }) };
  };
  const output = [];
  await run(['simulate', 'AAAAAA==', '--json'], { fetchImpl, out: text => output.push(text) });
  assert.deepEqual(calls, ['getNetwork', 'simulateTransaction']);
  assert.equal(JSON.parse(output[0]).summary.minResourceFeeStroops, '42');
});

test('CLI rejects wrong RPC network before transaction lookup', async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request.method);
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: request.id, result: { passphrase: 'Wrong network' } }) };
  };
  await assert.rejects(run(['tx', 'ab'.repeat(32)], { fetchImpl }), /passphrase mismatch/);
  assert.deepEqual(calls, ['getNetwork']);
});
