import test from 'node:test';
import assert from 'node:assert/strict';
import { StellarRpc, RpcError, NETWORKS, diagnose } from '../src/index.js';
import { run } from '../src/cli.js';

function fakeRpc(results = {}) {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const req = JSON.parse(options.body);
    calls.push(req);
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: req.id, result: results[req.method] ?? {} }) };
  };
  return { fetchImpl, calls };
}

test('doctor checks network identity, health and latest ledger', async () => {
  const { fetchImpl, calls } = fakeRpc({
    getNetwork: { passphrase: NETWORKS.testnet.passphrase, protocolVersion: 23 },
    getHealth: { status: 'healthy' },
    getLatestLedger: { sequence: 123, closedAt: '2026-01-01T00:00:00Z' }
  });
  const report = await diagnose(new StellarRpc(NETWORKS.testnet.url, { fetchImpl }), { expectedPassphrase: NETWORKS.testnet.passphrase });
  assert.equal(report.latestLedger, 123);
  assert.equal(report.healthStatus, 'healthy');
  assert.deepEqual(calls.map(c => c.method), ['getNetwork', 'getHealth', 'getLatestLedger']);
});

test('doctor rejects wrong network passphrase', async () => {
  const { fetchImpl } = fakeRpc({ getNetwork: { passphrase: 'unexpected' } });
  await assert.rejects(diagnose(new StellarRpc(NETWORKS.testnet.url, { fetchImpl }), { expectedPassphrase: NETWORKS.testnet.passphrase }), /mismatch/);
});

test('validates transaction hashes and sends lowercase hash', async () => {
  const { fetchImpl, calls } = fakeRpc();
  const client = new StellarRpc(NETWORKS.testnet.url, { fetchImpl });
  assert.throws(() => client.getTransaction('bad'), /64 hexadecimal/);
  await client.getTransaction('AB'.repeat(32));
  assert.equal(calls[0].params.hash, 'ab'.repeat(32));
});

test('events enforce bounded pagination and contract IDs', async () => {
  const { fetchImpl, calls } = fakeRpc();
  const client = new StellarRpc(NETWORKS.testnet.url, { fetchImpl });
  assert.throws(() => client.getEvents({ startLedger: 0, contractIds: ['bad'] }), /startLedger/);
  assert.throws(() => client.getEvents({ startLedger: 1, contractIds: ['bad'] }), /contractIds/);
  assert.throws(() => client.getEvents({ startLedger: 1, contractIds: ['C' + 'A'.repeat(55)], limit: 101 }), /limit/);
  await client.getEvents({ startLedger: 42, contractIds: ['C' + 'A'.repeat(55)], cursor: 'abc' });
  assert.deepEqual(calls[0].params.pagination, { limit: 20, cursor: 'abc' });
});

test('surfaces structured JSON-RPC errors', async () => {
  const client = new StellarRpc(NETWORKS.testnet.url, { fetchImpl: async (_url, options) => {
    const { id } = JSON.parse(options.body);
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id, error: { code: -32601, message: 'unknown method' } }) };
  }});
  await assert.rejects(client.getHealth(), e => e instanceof RpcError && e.code === -32601);
});

test('rejects mismatched RPC ids', async () => {
  const client = new StellarRpc(NETWORKS.testnet.url, { fetchImpl: async () => ({ok: true, json: async () => ({jsonrpc: '2.0', id: 900, result: {}})}) });
  await assert.rejects(client.getNetwork(), /does not match/);
});

test('CLI doctor renders valid JSON and refuses unknown networks', async () => {
  const { fetchImpl } = fakeRpc({ getNetwork: { passphrase: NETWORKS.testnet.passphrase } });
  const output = [];
  const result = await run(['doctor', '--json'], { out: x => output.push(x), fetchImpl });
  assert.equal(result, 0);
  assert.equal(JSON.parse(output[0]).networkPassphrase, NETWORKS.testnet.passphrase);
  await assert.rejects(run(['doctor', '--network', 'invalid'], { fetchImpl }), /Unsupported network/);
});

test('refuses credential-bearing and non-http endpoints', () => {
  assert.throws(() => new StellarRpc('file:///tmp/rpc'), /http or https/);
  assert.throws(() => new StellarRpc('https://secret:password@rpc.example'), /credentials/);
});
