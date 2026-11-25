import { parseCandidate } from '../features/import/validate.js';
import { canonicalContent, compareRulesets } from '../features/import/compare.js';
import { importPolicy } from '../features/import/import-policy.js';
import { CURRENT_KEY, CURRENT_LOCK, createCurrentService } from './current-ruleset.js';

export const SOP_MARKER = 'assistant.sopStore.v2';
const fail = (code) => ({ ok: false, code });
const validId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 128;
export async function sopHash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalContent(value)))))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}
function candidate(value) {
  if (value?.mode !== 'replace') return false;
  try { return parseCandidate(JSON.stringify(value)).ok; } catch { return false; }
}
export async function validateSopHead(head) {
  if (!head || Object.keys(head).sort().join(',') !== 'current,currentHash,formatVersion,lastOperation,previous,revision,storeId' ||
      head.formatVersion !== 2 || !validId(head.storeId) || !validId(head.revision) || !candidate(head.current) ||
      head.currentHash !== await sopHash(head.current)) return false;
  if (head.previous !== null && (!head.previous || Object.keys(head.previous).sort().join(',') !== 'hash,snapshot,sourceRevision' ||
      !validId(head.previous.sourceRevision) || !candidate(head.previous.snapshot) ||
      head.previous.hash !== await sopHash(head.previous.snapshot))) return false;
  const receipt = head.lastOperation;
  return !!receipt && Object.keys(receipt).sort().join(',') === 'baseRevision,candidateHash,id,kind,resultRevision' &&
    validId(receipt.id) && ['import', 'restore'].includes(receipt.kind) &&
    (receipt.baseRevision === null || validId(receipt.baseRevision)) && receipt.resultRevision === head.revision && receipt.candidateHash === head.currentHash &&
    (receipt.kind !== 'restore' || head.previous === null);
}

// All methods share the same worker Web Lock, including migration/reconcile.
// Legacy service is used ONLY to validate/read v1, never to write it.
export function createSopCurrentService({ repository, storage, locks, createId = () => crypto.randomUUID(),
  estimate = () => globalThis.navigator?.storage?.estimate?.(), notify = () => {} }) {
  const legacy = createCurrentService({ storage, locks: { request: (_name, _options, fn) => fn() } });
  async function load() {
    const head = await repository.read();
    const marker = (await storage.get(SOP_MARKER))[SOP_MARKER];
    if (marker !== undefined && (!marker || Object.keys(marker).sort().join(',') !== 'phase,storeId,version' ||
        marker.version !== 2 || !['preparing', 'active'].includes(marker.phase) || !validId(marker.storeId)))
      return fail('corrupt-storage');
    if (head !== null) {
      if (!await validateSopHead(head) || !marker || marker.storeId !== head.storeId) return fail('corrupt-storage');
      return { ok: true, head, marker, snapshot: { revision: head.revision, current: head.current, previous: head.previous?.snapshot ?? null,
        lastOperation: { id: head.lastOperation.id, kind: head.lastOperation.kind } } };
    }
    if (marker?.phase === 'active') return fail('corrupt-storage');
    const old = await legacy.read();
    if (!old.ok) return old.code === 'corrupt-current' ? fail('corrupt-storage') : old;
    return { ...old, head: null, marker, snapshot: { ...old.snapshot, previous: null } };
  }
  async function finishMigration(loaded) {
    if (!loaded.head) return;
    const marker = { version: 2, phase: 'active', storeId: loaded.head.storeId };
    if (loaded.marker?.phase !== 'active') {
      await storage.set({ [SOP_MARKER]: marker });
      if (canonicalContent((await storage.get(SOP_MARKER))[SOP_MARKER]) !== canonicalContent(marker)) throw Error('marker-readback');
    }
    if ((await storage.get(CURRENT_KEY))[CURRENT_KEY] !== undefined) {
      await storage.remove(CURRENT_KEY);
      if ((await storage.get(CURRENT_KEY))[CURRENT_KEY] !== undefined) throw Error('legacy-cleanup');
    }
  }
  async function safeLoad() { try { return await load(); } catch { return fail('storage-unavailable'); } }
  async function reconcile(request) {
    const loaded = await safeLoad();
    if (!loaded.ok) return { ...fail('outcome-unknown'), detail: loaded.code };
    const receipt = loaded.head?.lastOperation;
    if (receipt?.id === request.operationId) {
      if (receipt.candidateHash !== request.candidateHash) return fail('operation-mismatch');
      try { await finishMigration(loaded); } catch { return fail('migration-pending'); }
      try { notify(loaded.snapshot.revision); } catch { /* not a transaction */ }
      return { ok: true, snapshot: loaded.snapshot, status: 'already-applied' };
    }
    if (loaded.snapshot.revision === request.baseRevision && (request.baseHash !== undefined
      ? (loaded.snapshot.current ? await sopHash(loaded.snapshot.current) : null) === request.baseHash
      : (loaded.snapshot.current ? canonicalContent(loaded.snapshot.current) : null) === request.baseline))
      return fail('not-applied');
    return fail('stale-baseline');
  }
  async function mutate(request, kind) {
    if (!request || request.confirmed !== true) return fail('confirmation-required');
    if (!validId(request.operationId)) return fail('operation-required');
    const loaded = await safeLoad();
    if (!loaded.ok) return loaded;
    const next = kind === 'restore' ? loaded.snapshot.previous : request.candidate;
    // Check receipt before requiring Previous: a duplicate restore must reconcile.
    if (loaded.head?.lastOperation.id === request.operationId) return reconcile(request);
    if (!next) return fail('no-previous');
    if (!candidate(next)) return fail('invalid-candidate');
    const hash = await sopHash(next);
    if (request.candidateHash !== hash) return fail('candidate-changed');
    if (request.baseRevision !== loaded.snapshot.revision || request.baseline !==
        (loaded.snapshot.current ? canonicalContent(loaded.snapshot.current) : null)) return fail('stale-baseline');
    const comparison = compareRulesets(loaded.snapshot.current, next), policy = importPolicy(comparison);
    if (!policy.allowed) return fail('invalid-candidate');
    if (request.policyVersion !== policy.version || !Array.isArray(request.acknowledged) ||
        canonicalContent(request.acknowledged) !== canonicalContent(policy.reasons.map((r) => r.id))) return fail('risk-confirmation-required');
    if (comparison.status === 'identical' && kind !== 'restore') return { ok: true, status: 'noop', snapshot: loaded.snapshot };
    try { await finishMigration(loaded); } catch { return fail('migration-pending'); }
    const revision = createId(), storeId = loaded.head?.storeId ?? loaded.marker?.storeId ?? createId();
    const head = { formatVersion: 2, storeId, revision, current: structuredClone(next), currentHash: hash,
      previous: kind === 'restore' || !loaded.snapshot.current ? null : { snapshot: loaded.snapshot.current,
        hash: await sopHash(loaded.snapshot.current), sourceRevision: loaded.snapshot.revision },
      lastOperation: { id: request.operationId, kind, baseRevision: loaded.snapshot.revision, candidateHash: hash, resultRevision: revision } };
    try {
      const capacity = await estimate();
      const bytes = new TextEncoder().encode(JSON.stringify(head)).length;
      if (capacity?.quota && capacity.quota - (capacity.usage ?? 0) < bytes * 3) return fail('storage-full');
    } catch { /* estimate is advisory; actual transaction quota remains binding */ }
    if (!loaded.head) {
      const preparing = { version: 2, phase: 'preparing', storeId };
      try {
        await storage.set({ [SOP_MARKER]: preparing });
        if (canonicalContent((await storage.get(SOP_MARKER))[SOP_MARKER]) !== canonicalContent(preparing)) return fail('migration-pending');
      } catch { return fail('migration-pending'); }
    }
    try {
      if (!await repository.commit(loaded.head, head)) return fail('stale-baseline');
    } catch { /* even a rejected completion may have committed; never rollback */ }
    const result = await reconcile({ ...request, candidateHash: hash });
    if (result.ok) return { ...result, status: 'applied-verified' };
    return result;
  }
  async function locked(fn) {
    if (!locks?.request) return fail('lock-unavailable');
    try { return await locks.request(CURRENT_LOCK, { mode: 'exclusive' }, fn); }
    catch { return fail('outcome-unknown'); }
  }
  return { read: () => locked(async () => {
    const loaded = await safeLoad();
    if (!loaded.ok) return loaded;
    return { ok: true, snapshot: loaded.snapshot, migrationPending: !!loaded.head && loaded.marker?.phase !== 'active' };
  }), replace: (r) => locked(() => mutate(r, 'import')), restore: (r) => locked(() => mutate(r, 'restore')),
  reconcile: (r) => locked(() => reconcile(r)) };
}
