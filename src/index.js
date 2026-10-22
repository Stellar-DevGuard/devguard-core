/** Network-specific Stellar RPC defaults. Override RPC URLs for self-hosted deployments. */
export const NETWORKS = Object.freeze({
  testnet: { url: 'https://soroban-testnet.stellar.org', passphrase: 'Test SDF Network ; September 2015' },
  mainnet: { url: 'https://soroban-rpc.mainnet.stellar.gateway.fm', passphrase: 'Public Global Stellar Network ; September 2015' }
});

export class RpcError extends Error {
  constructor(message, { code, data, method } = {}) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
    this.method = method;
  }
}

function assertUrl(raw) {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol)) throw new TypeError('RPC URL must use http or https');
  if (url.username || url.password) throw new TypeError('Do not embed credentials in an RPC URL');
  return url.toString();
}

function assertHex(value, name, size) {
  if (typeof value !== 'string' || !new RegExp(`^[a-fA-F0-9]{${size}}$`).test(value)) {
    throw new TypeError(`${name} must be ${size} hexadecimal characters`);
  }
  return value.toLowerCase();
}

/** A small strict JSON-RPC 2.0 client; no wallet keys or signing operations. */
export class StellarRpc {
  #url; #fetch; #timeout; #id = 0;
  constructor(url, { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
    this.#url = assertUrl(url);
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new RangeError('timeoutMs must be positive');
    this.#fetch = fetchImpl;
    this.#timeout = timeoutMs;
  }

  async call(method, params = {}) {
    const id = ++this.#id;
    let response;
    try {
      response = await this.#fetch(this.#url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: AbortSignal.timeout(this.#timeout)
      });
    } catch (error) {
      throw new RpcError(`RPC request failed: ${error.message}`, { method });
    }
    if (!response.ok) throw new RpcError(`RPC HTTP ${response.status}`, { method });
    let payload;
    try { payload = await response.json(); }
    catch { throw new RpcError('RPC returned invalid JSON', { method }); }
    if (!payload || payload.jsonrpc !== '2.0' || payload.id !== id) {
      throw new RpcError('RPC response does not match request', { method });
    }
    if (payload.error) {
      throw new RpcError(payload.error.message || 'RPC error', { code: payload.error.code, data: payload.error.data, method });
    }
    if (!Object.hasOwn(payload, 'result')) throw new RpcError('RPC response missing result', { method });
    return payload.result;
  }

  getNetwork() { return this.call('getNetwork'); }
  getHealth() { return this.call('getHealth'); }
  getLatestLedger() { return this.call('getLatestLedger'); }
  getTransaction(hash) { return this.call('getTransaction', { hash: assertHex(hash, 'Transaction hash', 64) }); }

  /** See Stellar RPC getEvents; defaults avoid unbounded historical queries. */
  getEvents({ startLedger, contractIds, limit = 20, cursor } = {}) {
    if (!Number.isSafeInteger(startLedger) || startLedger < 1) throw new RangeError('startLedger must be a positive integer');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError('limit must be between 1 and 100');
    if (!Array.isArray(contractIds) || contractIds.length < 1 || contractIds.some(id => typeof id !== 'string' || !/^C[A-Z2-7]{55}$/.test(id))) {
      throw new TypeError('contractIds must contain valid Stellar C... contract IDs');
    }
    if (cursor !== undefined && (typeof cursor !== 'string' || !cursor)) throw new TypeError('cursor must be nonempty');
    return this.call('getEvents', {
      startLedger,
      filters: [{ type: 'contract', contractIds }],
      pagination: { limit, ...(cursor ? { cursor } : {}) }
    });
  }
}

/** Checks RPC availability and verifies the network identity before displaying ledger state. */
export async function diagnose(rpc, { expectedPassphrase } = {}) {
  const [network, health, ledger] = await Promise.all([
    rpc.getNetwork(), rpc.getHealth(), rpc.getLatestLedger()
  ]);
  if (expectedPassphrase && network.passphrase !== expectedPassphrase) {
    throw new RpcError('RPC network passphrase mismatch; refusing to use endpoint', { method: 'getNetwork' });
  }
  return {
    networkPassphrase: network.passphrase,
    protocolVersion: network.protocolVersion ?? null,
    healthStatus: health.status ?? 'unknown',
    latestLedger: ledger.sequence ?? null,
    latestLedgerClosedAt: ledger.closedAt ?? null
  };
}
