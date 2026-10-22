import test from 'node:test';
import assert from 'node:assert/strict';
import { NETWORKS, StellarRpc, diagnose } from '../src/index.js';

// Public contract from the official Stellar getEvents documentation.
// The test only checks endpoint compatibility, not event availability.
const exampleContractId = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

test('live Stellar testnet: network identity, health, ledger and getEvents', { timeout: 30000 }, async () => {
  const rpc = new StellarRpc(process.env.STELLAR_TESTNET_RPC_URL || NETWORKS.testnet.url, {
    timeoutMs: 12000
  });
  const info = await diagnose(rpc, { expectedPassphrase: NETWORKS.testnet.passphrase });
  assert.equal(info.networkPassphrase, NETWORKS.testnet.passphrase);
  assert.ok(Number.isSafeInteger(info.latestLedger) && info.latestLedger > 0);
  const health = await rpc.getHealth();
  assert.ok(Number.isSafeInteger(health.oldestLedger));
  assert.ok(Number.isSafeInteger(health.latestLedger));
  assert.ok(health.oldestLedger <= health.latestLedger);
  const events = await rpc.getEvents({
    startLedger: health.latestLedger,
    contractIds: [exampleContractId],
    limit: 1
  });
  assert.ok(Array.isArray(events.events));
  assert.ok(typeof events.cursor === 'string' || events.cursor === undefined);
  console.log(JSON.stringify({
    network: 'testnet', ledger: info.latestLedger,
    retentionStart: health.oldestLedger, checkedEventQuery: true
  }));
});
