import { parseCandidate } from '../features/import/validate.js';
import { canonicalContent, compareRulesets } from '../features/import/compare.js';

export const CURRENT_KEY = 'assistant.currentRuleset.v1';
export const CURRENT_LOCK = 'assistant.currentRuleset';
const fail = (code) => ({ ok: false, code });
// Transport success does not prove a usable Current/Previous snapshot. Accept
// legacy snapshots without Previous, but never turn a missing Current into null.
export function validCurrentSnapshot(snapshot) {
  const complete = value => value?.mode === 'replace' && parseCandidate(JSON.stringify(value)).ok;
  try {
    if(!snapshot||!Object.hasOwn(snapshot,'current')||!Object.hasOwn(snapshot,'revision'))return false;
    if(snapshot.current===null){if(snapshot.revision!==null||snapshot.previous!=null)return false;}
    else if(typeof snapshot.revision!=='string'||!snapshot.revision||!complete(snapshot.current))return false;
    return snapshot.previous==null||complete(snapshot.previous);
  } catch { return false; }
}

// Historical M5 service retained for v1 read compatibility and regression
// harnesses. Production writes now use sop-current.js / IndexedDB exclusively.
export function createCurrentService({ storage, locks, createId = () => crypto.randomUUID() }) {
  async function read() {
    let value;
    try { value = (await storage.get(CURRENT_KEY))[CURRENT_KEY]; }
    catch { return fail('read-failed'); }
    if (value === undefined) return { ok: true, snapshot: { revision: null, current: null } };
    const corrupt = async () => ({ ...fail('corrupt-current'), repairToken: Array.from(new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))))
      .map((byte) => byte.toString(16).padStart(2, '0')).join('') });
    if (!value || value.version !== 1 || typeof value.revision !== 'string' || !value.revision ||
      Object.keys(value).sort().join(',') !== 'current,revision,version' || value.current?.mode !== 'replace') return corrupt();
    const checked = parseCandidate(JSON.stringify(value.current));
    if (!checked.ok) return corrupt();
    return { ok: true, snapshot: { revision: value.revision, current: checked.candidate } };
  }
  async function locked(operation) {
    if (!locks?.request) return fail('lock-unavailable');
    try { return await locks.request(CURRENT_LOCK, { mode: 'exclusive' }, operation); }
    catch { return fail('lock-failed'); }
  }
  return {
    read: () => locked(read),
    replace: (request) => locked(async () => {
      // Re-read after acquiring the lock, including on first import. A failed
      // read must never be treated as empty. Confirmed damage can only be
      // repaired with the exact observed fingerprint, never a stale baseline.
      const loaded = await read();
      const repairing = request?.repair === true;
      if (!loaded.ok && !(repairing && loaded.code === 'corrupt-current' && loaded.repairToken)) return loaded;
      if (request?.confirmed !== true) return fail('confirmation-required');
      if (repairing && (loaded.ok || request.repairToken !== loaded.repairToken)) return fail('stale-baseline');
      const snapshot = loaded.ok ? loaded.snapshot : null;
      if (!repairing && (request.baseRevision !== snapshot.revision ||
        request.baseline !== (snapshot.current ? canonicalContent(snapshot.current) : null))) return fail('stale-baseline');
      if (request.candidate?.mode !== 'replace') return fail('replace-required');
      const validation = parseCandidate(JSON.stringify(request.candidate));
      if (!validation.ok) return fail('invalid-candidate');
      const comparison = compareRulesets(snapshot?.current ?? null, validation.candidate);
      if (comparison.status === 'identical') return { ...loaded, status: 'noop' };
      if (!['initial', 'changed'].includes(comparison.status)) return fail('version-conflict');
      const envelope = { version: 1, revision: createId(), current: validation.candidate };
      try { await storage.set({ [CURRENT_KEY]: envelope }); }
      catch { return fail('write-failed'); }
      // Never announce success from onChanged or a resolved set alone.
      const verified = await read();
      if (!verified.ok) return fail('readback-failed');
      if (verified.snapshot.revision !== envelope.revision ||
        canonicalContent(verified.snapshot.current) !== canonicalContent(envelope.current)) return fail('readback-mismatch');
      return { ...verified, status: 'applied' };
    }),
  };
}

export function bindCurrentMessages(runtime, service) {
  const listener = (message, sender, respond) => {
    if (message?.channel !== 'assistant-current') return;
    if (sender.id !== runtime.id || sender.url !== runtime.getURL('src/panel/index.html')) {
      respond(fail('unauthorized')); return;
    }
    const operation = ['read', 'replace', 'restore', 'reconcile'].includes(message.action) && typeof service[message.action] === 'function'
      ? service[message.action](message.request) : Promise.resolve(fail('unknown-action'));
    void operation.then(respond, () => respond(fail('operation-failed')));
    return true;
  };
  runtime.onMessage.addListener(listener);
  return () => runtime.onMessage.removeListener(listener);
}

// Sidebars observe notifications, but load only through the locked worker read.
// Thus storage.onChanged cannot publish unverified payloads during a write.
export function createCurrentClient({ runtime, storageEvents }) {
  let snapshot = null, disposed = false, generation = 0;
  const listeners = new Set();
  async function send(action, request) {
    try {
      const result = await runtime.sendMessage({ channel: 'assistant-current', action, request });
      return result && typeof result.ok === 'boolean' ? result : fail('connection-failed');
    }
    catch { return fail('connection-failed'); }
  }
  async function refresh() {
    const request = ++generation;
    let result = await send('read');
    if (disposed || request !== generation) return result;
    if(result.ok&&!validCurrentSnapshot(result.snapshot))result=fail('invalid-current-response');
    const changed = result.ok && (!snapshot || snapshot.revision !== result.snapshot.revision ||
      canonicalContent(snapshot.current) !== canonicalContent(result.snapshot.current));
    if (result.ok) snapshot = structuredClone(result.snapshot);
    for (const listener of listeners) listener(result, changed);
    return result;
  }
  const onChange = (changes, area) => { if (area === 'local' && Object.hasOwn(changes, CURRENT_KEY)) void refresh(); };
  storageEvents.addListener(onChange);
  const onMessage = (message) => { if (message?.channel === 'assistant-current-changed') void refresh(); };
  runtime.onMessage?.addListener(onMessage);
  async function mutate(action, request) {
    const result = await send(action, request);
    const reloaded = await refresh();
    return result.ok && !reloaded.ok ? { ...result, refreshPending: true } : result;
  }
  return { refresh,
    getSnapshot: () => snapshot ? structuredClone(snapshot) : null,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async replace(request) {
      const result = await send('replace', request);
      const reloaded = await refresh();
      if (result.ok && !reloaded.ok) return ['applied-verified', 'already-applied', 'noop'].includes(result.status)
        ? { ...result, refreshPending: true } : fail('sidebar-refresh-failed');
      return result;
    },
    restore: (request) => mutate('restore', request),
    reconcile: (request) => mutate('reconcile', request),
    dispose() { disposed = true; generation++; listeners.clear(); storageEvents.removeListener(onChange); runtime.onMessage?.removeListener(onMessage); },
  };
}
