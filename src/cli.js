#!/usr/bin/env node
import { NETWORKS, StellarRpc, diagnose, RpcError } from './index.js';
import { simulate } from './simulation.js';

const HELP = `DevGuard — inspect Stellar RPC endpoints without private keys

Usage:
  devguard doctor [--network testnet|mainnet] [--rpc-url URL] [--json]
  devguard tx HASH [--network testnet|mainnet] [--rpc-url URL] [--json]
  devguard events CONTRACT_ID --start-ledger N [--limit N] [--network testnet|mainnet] [--rpc-url URL] [--json]
  devguard simulate BASE64_ENVELOPE [--instruction-leeway N] [--network testnet|mainnet] [--rpc-url URL] [--json]

Defaults: testnet; request timeout: 10s. A custom RPC URL is always checked
against the selected network passphrase for every command.
`;

async function assertNetwork(rpc, expectedPassphrase) {
  const response = await rpc.getNetwork();
  if (response?.passphrase !== expectedPassphrase) {
    throw new RpcError('RPC network passphrase mismatch; refusing to use endpoint', { method: 'getNetwork' });
  }
}

export async function run(argv, { out = console.log, err = console.error, fetchImpl } = {}) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) { out(HELP); return 0; }
  const [command, ...rest] = argv;
  const options = {};
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === '--json') { options.json = true; continue; }
    if (['--network', '--rpc-url', '--start-ledger', '--limit', '--instruction-leeway'].includes(token)) {
      if (!rest[i + 1] || rest[i + 1].startsWith('--')) throw new TypeError(`Missing value for ${token}`);
      options[token] = rest[++i];
    } else if (token.startsWith('-')) throw new TypeError(`Unknown option: ${token}`);
    else positional.push(token);
  }
  const network = options['--network'] || 'testnet';
  if (!Object.hasOwn(NETWORKS, network)) throw new TypeError(`Unsupported network: ${network}`);
  const rpc = new StellarRpc(options['--rpc-url'] || NETWORKS[network].url, { fetchImpl });
  let result;
  if (command === 'doctor' && positional.length === 0) {
    result = await diagnose(rpc, { expectedPassphrase: NETWORKS[network].passphrase });
  } else if (command === 'tx' && positional.length === 1) {
    await assertNetwork(rpc, NETWORKS[network].passphrase);
    result = await rpc.getTransaction(positional[0]);
  } else if (command === 'events' && positional.length === 1) {
    await assertNetwork(rpc, NETWORKS[network].passphrase);
    result = await rpc.getEvents({
      contractIds: [positional[0]],
      startLedger: Number(options['--start-ledger']),
      limit: options['--limit'] === undefined ? 20 : Number(options['--limit'])
    });
  } else if (command === 'simulate' && positional.length === 1) {
    await assertNetwork(rpc, NETWORKS[network].passphrase);
    result = await simulate(rpc, positional[0], {
      instructionLeeway: options['--instruction-leeway'] === undefined ? undefined : Number(options['--instruction-leeway'])
    });
  } else { throw new TypeError(`Invalid command or arguments. Run devguard --help`); }
  out(JSON.stringify(result, null, options.json ? 0 : 2));
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  run(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
  });
}
