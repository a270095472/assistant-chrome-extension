import { structure3, semantics3, candidate3 } from './validate-v3.js';
import validateSchema from './validate-schema.generated.js';

const issue = (type, path, reason, hint, context = {}) => ({ type, path: path || '/', reason, hint, ...context });
const result = (errors, candidate = null) => ({ ok: errors.length === 0, errors, candidate: errors.length ? null : candidate });
export const emptyRuleset = () => ({ schemaVersion: '2.0.0', rulesetVersion: '0.0.0', mode: 'replace', platforms: [], rules: [] });

export function validateStructure(value) {
  if (['3.0.0', '3.1.0'].includes(value?.schemaVersion)) return structure3(value);
  if (value?.schemaVersion !== '2.0.0') return [issue('Schema 版本', '/schemaVersion',
    value?.schemaVersion === '1.1.0' ? 'v1.1.0 凍結原檔尚未取得，無法執行可信驗證。' : '不支援或缺少 Schema 版本。',
    '請使用 2.0.0 格式；舊格式不得只改版號，需取得原契約後另行轉接。')];
  if (validateSchema(value)) return [];
  return validateSchema.errors.slice(0, 100).map((e) => issue('欄位或列舉',
    `${e.instancePath}${e.params.missingProperty ? '/' + e.params.missingProperty : e.params.additionalProperty ? '/' + e.params.additionalProperty : ''}`,
    ({ required: '缺少必填欄位。', additionalProperties: '含有不允許的未知欄位。', type: '資料型別不符。', enum: '不在允許的選項內。', pattern: '字串格式不符。', uniqueItems: '陣列項目不可重複。', minLength: '文字不可空白。', maxItems: '資料筆數超過限制。' })[e.keyword] ?? '欄位不符合 Schema 限制。',
    `請依 2.0.0 契約修正（${e.keyword}）。`));
}

// Exact host + optional path-segment prefix only. Never executes user expressions.
export function validSite(site) {
  try {
    const url = new URL(`https://${site.host}${site.path ?? '/'}`);
    return site.host === url.hostname && site.host === site.host.toLowerCase() &&
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9](?:[a-z0-9-]{0,57}[a-z0-9])?)$/.test(site.host) &&
      !url.username && !url.password && !url.port && !url.search && !url.hash &&
      (!site.path || (url.pathname === site.path && !/[\\%?#]/.test(site.path) && (site.path === '/' || !site.path.endsWith('/'))));
  } catch { return false; }
}
// One trie per exact host. Segment boundaries preserve /shop vs /shop-fake,
// including empty segments in paths such as /shop//item. Only one conflicting
// location is needed to reject a site; never enumerate all conflicting pairs.
function registerSite(hosts, site, location) {
  const node = () => ({ children: new Map(), first: null, terminal: null });
  if (!hosts.has(site.host)) hosts.set(site.host, node());
  let current = hosts.get(site.host);
  const visited = [current];
  const segments = !site.path || site.path === '/' ? [] : site.path.slice(1).split('/');
  for (const segment of segments) {
    if (current.terminal) return current.terminal;
    if (!current.children.has(segment)) current.children.set(segment, node());
    current = current.children.get(segment);
    visited.push(current);
  }
  if (current.first) return current.first;
  current.terminal = location;
  for (const entry of visited) entry.first ??= location;
  return null;
}

export function validateSemantics(data) {
  if (['3.0.0', '3.1.0'].includes(data?.schemaVersion)) return semantics3(data, legacyPlatformSemantics);
  const errors = [];
  const limitReached = Symbol('semantic error limit');
  const add = (type, path, reason, context) => {
    errors.push(issue(type, path, reason, '請修正對應 ID、引用或配置後重新驗證。', context));
    if (errors.length === 100) throw limitReached;
  };
  try { collectSemanticErrors(data, add); }
  catch (error) { if (error !== limitReached) throw error; }
  return errors;
}

function collectSemanticErrors(data, add) {
  const platforms = new Map();
  const sites = new Map();
  for (const [i, p] of data.platforms.entries()) {
    const path = `/platforms/${i}`;
    if (platforms.has(p.id)) add('身分衝突', path + '/id', '平台 ID 重複。', { platformId: p.id });
    platforms.set(p.id, p);
    if (!p.name.trim()) add('欄位', path + '/name', '平台名稱不可全空白。');
    const branches = new Set();
    for (const [j, b] of p.subflows.entries()) {
      if (branches.has(b.id)) add('身分衝突', `${path}/subflows/${j}/id`, '同平台子流程 ID 重複。');
      if (!b.name.trim()) add('欄位', `${path}/subflows/${j}/name`, '子流程名稱不可全空白。');
      branches.add(b.id);
    }
    if ((p.strategy === 'single' && p.subflows.length) || (p.strategy !== 'single' && !p.subflows.length)) add('子流程引用', path + '/strategy', 'single 不含子流程，其他策略至少需一個子流程。');
    for (const [j, s] of p.sites.entries()) {
      const loc = `${path}/sites/${j}`;
      if (!validSite(s)) {
        add('網址配置', loc, '網域或路徑無效；只允許精確 HTTPS 主機及路徑區段。');
        continue;
      }
      if (p.strategy === 'byDomain' ? !branches.has(s.branch) : s.branch !== undefined) add('子流程引用', loc + '/branch', '僅 byDomain 網址必須引用該平台子流程；其他策略網址不得帶 branch。');
      const previous = registerSite(sites, s, loc);
      if (previous) add('網址配置衝突', loc, `與 ${previous} 匹配範圍重疊（含停用平台）。`);
    }
    if (p.strategy === 'byDomain' && p.subflows.some((b) => !p.sites.some((s) => s.branch === b.id))) add('網址配置', path + '/sites', '每個網址子流程都需要至少一個識別條件。');
  }
  const scopes = new Map(), globals = new Set();
  for (const [i, r] of data.rules.entries()) {
    const path = `/rules/${i}`;
    const scope = r.platformId ?? '';
    if (!scopes.has(scope)) scopes.set(scope, new Set());
    if (scopes.get(scope).has(r.id)) add('身分衝突', path + '/id', '同平台規則 ID 或全域規則 ID 重複。', { platformId: r.platformId, ruleId: r.id });
    scopes.get(scope).add(r.id);
    if (r.platformId === null) {
      globals.add(r.id);
      if (r.branch !== null || r.exceptions.length) add('跨規則引用', path, '全域規則不能指定子流程或引用例外。');
    } else {
      const p = platforms.get(r.platformId);
      if (!p) add('平台引用', path + '/platformId', '規則引用不存在的平台。', { platformId: r.platformId, ruleId: r.id });
      else if (r.branch !== null && !p.subflows.some((s) => s.id === r.branch)) add('子流程引用', path + '/branch', '規則引用不存在的子流程。');
    }
    if (!r.title.trim() || !r.content.trim()) add('欄位', path, '規則標題與內容不可全空白。');
  }
  for (const [i, r] of data.rules.entries()) for (const id of r.exceptions) {
    if (!globals.has(id)) add('跨規則引用', `/rules/${i}/exceptions`, `找不到有效全域規則 ${id}。`, { platformId: r.platformId, ruleId: r.id });
  }
}

function legacyPlatformSemantics(data) { return validateSemantics({ ...data, schemaVersion: '2.0.0', rules: [] }); }

// Patch replaces all rules for each supplied platform; global rules are a full
// replacement when at least one global is supplied. Clearing globals uses replace.
export function validateCandidate(value, current = emptyRuleset()) {
  if (['3.0.0', '3.1.0'].includes(value?.schemaVersion)) return candidate3(value, current, legacyPlatformSemantics);
  if (value?.mode === 'patch' && current?.schemaVersion === '3.0.0') return result([issue('PATCH_SCHEMA_MISMATCH', '/schemaVersion', '不可跨 Schema patch。', '請使用相同 Schema 的完整 current。')]);
  let errors = validateStructure(value);
  if (errors.length) return result(errors);
  // Validate input identity before merging: a patch must not conceal duplicates.
  const duplicateErrors = validateSemantics({ ...value, rules: [] });
  if (duplicateErrors.length) return result(duplicateErrors);
  let candidate = structuredClone(value);
  if (value.mode === 'patch') {
    errors = validateStructure(current);
    if (errors.length || validateSemantics(current).length) return result([issue('現行資料', '/', '現行完整資料無效，無法安全驗證局部更新。', '請先確認現行資料契約及來源。')]);
    const touched = new Set(value.platforms.map((p) => p.id));
    if (value.rules.some((r) => r.platformId !== null && !touched.has(r.platformId))) return result([issue('平台引用', '/rules', '局部更新的規則必須包含其平台定義。', '請一併提供該平台。')]);
    const globalsChanged = value.rules.some((r) => r.platformId === null);
    // Retained records must be detached too, including every nested collection.
    const retained = structuredClone({
      platforms: current.platforms.filter((p) => !touched.has(p.id)),
      rules: current.rules.filter((r) => r.platformId === null ? !globalsChanged : !touched.has(r.platformId)),
    });
    candidate = { ...candidate, platforms: [...retained.platforms, ...candidate.platforms],
      rules: [...retained.rules, ...candidate.rules] };
    // Count limits apply to the complete candidate too.
    errors = validateStructure(candidate);
  }
  errors.push(...validateSemantics(candidate));
  return result(errors, candidate);
}

export function parseCandidate(text, current) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > 2 * 1024 * 1024) return result([issue('檔案大小', '/', '候選 JSON 上限為 2 MiB。', '請縮小檔案。')]);
  let data;
  try { data = JSON.parse(text); } catch { return result([issue('JSON 格式', '/', 'JSON 語法無法解析。', '請檢查引號、逗號及括號；未推測行號。')]); }
  return validateCandidate(data, current);
}
export async function readCandidateFile(file, current) {
  if (!file || typeof file.text !== 'function') return result([issue('檔案讀取', '/', '尚未選擇可讀取的檔案。', '請選擇本機 JSON。')]);
  if (file.size > 2 * 1024 * 1024) return result([issue('檔案大小', '/', '檔案超過 2 MiB。', '請縮小檔案。')]);
  try { return parseCandidate(await file.text(), current); }
  catch { return result([issue('檔案讀取', '/', '無法讀取候選檔案。', '請確認檔案可存取後重新選取。')]); }
}
