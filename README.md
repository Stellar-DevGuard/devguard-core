# Stellar DevGuard Core

[![CI](https://github.com/Stellar-DevGuard/devguard-core/actions/workflows/ci.yml/badge.svg)](https://github.com/Stellar-DevGuard/devguard-core/actions/workflows/ci.yml)

An open-source, **read-only** Stellar RPC diagnostics CLI and JavaScript library. It helps developers identify which Stellar network an RPC endpoint serves, check node health and ledger state, inspect transactions, and query Soroban contract events.

> Community-maintained project. Not affiliated with or endorsed by the Stellar Development Foundation.

## Requirements

Node.js 20+. No runtime dependencies, wallet connection, secret keys, account creation, or paid service required.

## Quick start

```bash
npm ci
npm test
node src/cli.js doctor --network testnet
node src/cli.js doctor --rpc-url https://soroban-testnet.stellar.org --json
node src/cli.js tx YOUR_64_CHARACTER_TRANSACTION_HASH --network testnet
node src/cli.js events YOUR_CONTRACT_ID --start-ledger 123456 --limit 20
node src/cli.js simulate YOUR_BASE64_TRANSACTION_ENVELOPE --instruction-leeway 3000000 --json
```

Commands use the public testnet by default. Mainnet uses a publicly operated gateway; production environments should supply their own managed/self-hosted RPC using `--rpc-url`. In `doctor`, the RPC network passphrase must match the selected network. `tx` and `events` currently trust the network supplied by the operator; network verification for every command is planned.

## JavaScript API

```js
import { StellarRpc, NETWORKS, diagnose } from './src/index.js';
const rpc = new StellarRpc(NETWORKS.testnet.url);
const report = await diagnose(rpc, { expectedPassphrase: NETWORKS.testnet.passphrase });
console.log(report);
```

## Scope and limitations

- `doctor`: runs `getNetwork`, `getHealth`, and `getLatestLedger`, verifying expected passphrase.
- `tx`: calls `getTransaction` with a validated 32-byte hexadecimal transaction hash; transaction may be unavailable if RPC retention has expired.
- `events`: calls `getEvents` with a required starting ledger and contract ID. Only one page is returned. The caller controls cursors and should stay within the configured RPC event retention window.
- Error handling: network/HTTP/JSON-RPC errors surface as `RpcError`; timeout defaults to 10 seconds.
- `simulate`: runs Stellar RPC `simulateTransaction` on a base64 XDR TransactionEnvelope containing a single InvokeHostFunction operation. Returns both a diagnostic summary and the unchanged RPC simulation result. No transaction is signed or submitted. Simulation is a network-state estimate, not a proof of future execution success.
- All CLI read commands verify the RPC network passphrase before querying data. The JS API exposes low-level calls and leaves network verification to the caller.
- This is an RPC *diagnostic utility*, **not** a smart-contract security audit tool. It cannot prove contract safety or index history outside the RPC retention period.
- No secrets should be placed in RPC URLs. Requests to third-party RPC providers disclose the queried identifiers and IP address to those providers.

## Roadmap

1. Add richer simulation failure diagnostics and return-value decoding.
2. Test against live Stellar RPC with controlled testnet fixtures.
3. Add structured transaction decoding and Soroban execution diagnostics.
4. Add optional integration with Stellar SDK simulation utilities.
5. Integrate with DevGuard Monitor for reliable incremental event indexing.

## Development

```bash
npm ci
npm run check
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance.

## License

MIT.

## Live testnet smoke check

Use `node --test integration/testnet.smoke.mjs` to perform a **read-only** health/network/ledger/event-query check against Stellar Testnet. This requires internet access and may fail during provider outages; it is intentionally excluded from deterministic unit tests. The `Live Stellar Testnet RPC Smoke` GitHub Action runs on a weekly schedule or manually via workflow dispatch. It does not deploy contracts, sign transactions, or require keys. The example contract ID is drawn from Stellar's published `getEvents` documentation; receiving zero events is valid.
