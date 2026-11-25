import { read } from '../../vendor/sheetjs/xlsx.mjs';
import { inspectXlsxZip, parseXml, list, XLSX_LIMITS } from './xlsx-zip.js';
import { mapSources } from './xlsx-map.js';
import { TEMPLATE_HEADERS, XLSX_HEADER_ALIASES } from './xlsx-template.js';
import { parseCandidate } from './validate.js';
import { isNameLayout } from './catalog-names.js';

const bounds = { '規則總表': 22, '例外規則': 24, '平台資料': 11, '商品品類': 4, '轉檔設定': 3, '來源資料': 5, '人工條件': 4 };
const column = (letters) => [...letters].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
export function readXlsxCandidate(bytes, { deferIdentity = false } = {}) {
  const { parts } = inspectXlsxZip(bytes);
  const workbookXml = parseXml(parts.get('xl/workbook.xml'), 'workbook');
  const relationships = parseXml(parts.get('xl/_rels/workbook.xml.rels') ?? '', 'workbook relationships');
  const rels = new Map();
  for (const rel of list(relationships.Relationships?.Relationship)) {
    if (rels.has(rel.Id)) throw Error('DUPLICATE_RELATIONSHIP');
    const target = rel.Target?.startsWith('/') ? rel.Target.slice(1) : 'xl/' + rel.Target;
    if (!target || target.split('/').includes('..') || !parts.has(target)) throw Error('RELATIONSHIP_PATH');
    rels.set(rel.Id, target);
  }
  const seenNames = new Set(), seenIds = new Set(); let cellCount = 0;
  for (const sheet of list(workbookXml.workbook?.sheets?.sheet)) {
    if (seenNames.has(sheet.name) || seenIds.has(sheet.id)) throw Error('DUPLICATE_SHEET');
    seenNames.add(sheet.name); seenIds.add(sheet.id);
    if (!Object.hasOwn(bounds, sheet.name)) continue;
    const part = rels.get(sheet.id); if (!part) throw Error('MISSING_SHEET ' + sheet.name);
    const xml = parseXml(parts.get(part), part), cells = new Set(), rows = new Set();
    for (const row of list(xml.worksheet?.sheetData?.row)) {
      if (rows.has(row.r)) throw Error('DUPLICATE_ROW ' + sheet.name); rows.add(row.r);
      for (const cell of list(row.c)) {
        if (cells.has(cell.r)) throw Error('DUPLICATE_CELL ' + sheet.name + '!' + cell.r); cells.add(cell.r);
        const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(cell.r ?? '');
        if (!match || Number(match[2]) !== Number(row.r)) throw Error('CELL_ADDRESS ' + sheet.name);
        if (++cellCount > XLSX_LIMITS.cells) throw Error('CELL_LIMIT');
        if (Number(match[2]) < 4) continue;
        if (column(match[1]) <= (sheet.name === '轉檔設定' ? 3 : bounds[sheet.name]) && cell.f !== undefined)
          throw Error('SOURCE_FORMULA ' + sheet.name + '!' + cell.r);
        const populated = cell.v !== undefined || cell.is !== undefined || cell.f !== undefined;
        if (populated && (Number(match[2]) > XLSX_LIMITS.rows || column(match[1]) > bounds[sheet.name])) {
          // The version-control prototype's E:F/J helpers are explicitly
          // non-authoritative. A:D source settings contract remains unchanged.
          const controlCell = sheet.name === '轉檔設定' &&
            (['E', 'F'].includes(match[1]) && Number(match[2]) <= 21 || match[1] === 'J' && Number(match[2]) >= 5 && Number(match[2]) <= 8);
          const sourceChoiceHelper = sheet.name === '來源資料' && match[1] === 'F' && Number(match[2]) <= XLSX_LIMITS.rows;
          if (!controlCell && !sourceChoiceHelper)
            throw Error('UNSUPPORTED_DATA ' + sheet.name + '!' + cell.r);
        }
      }
    }
  }
  for (const name of Object.keys(bounds)) if (!seenNames.has(name)) throw Error('MISSING_SHEET ' + name);
  const book = read(bytes, { type: 'array', sheets: Object.keys(bounds), cellFormula: true, cellDates: false,
    cellStyles: false, cellHTML: false, bookVBA: false, WTF: true });
  const grids = Object.create(null);
  const settings = book.Sheets['轉檔設定'];
  const sourceSheet = book.Sheets['來源資料'];
  if (Object.entries(sourceSheet ?? {}).some(([a, c]) => /^F[1-9][0-9]*$/.test(a) && Number(a.slice(1)) >= 4 &&
      (c.v !== undefined || c.f !== undefined)) && sourceSheet.F4?.v !== '文件選項（自動，勿改）') throw Error('UNSUPPORTED_DATA 來源資料!F4');
  for (const [address, cell] of Object.entries(settings ?? {})) {
    if (/^[EFJ][1-9][0-9]*$/.test(address) && Number(address.slice(1)) >= 4 && (cell.v !== undefined || cell.f !== undefined) &&
        settings.E4?.v !== 'SOP 版本升級控制區（無巨集）') throw Error('UNSUPPORTED_DATA 轉檔設定!' + address);
  }
  for (const [name, max] of Object.entries(bounds)) {
    const sheet = book.Sheets[name], grid = Object.create(null);
    if (!sheet) throw Error('MISSING_SHEET ' + name);
    if ((sheet['!merges'] ?? []).some((m) => m.e.r >= 3 && m.s.c < (name === '轉檔設定' ? 3 : max))) throw Error('MERGED_DATA ' + name);
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith('!')) continue;
      const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(address);
      if (!match || Number(match[2]) < 4 || column(match[1]) > max) continue;
      if (cell.f !== undefined || cell.F !== undefined) throw Error('SOURCE_FORMULA ' + name + '!' + address);
      if (cell.t === 'e' || !['s', 'n', 'b', 'z'].includes(cell.t)) throw Error('SOURCE_TYPE ' + name + '!' + address);
      grid[address] = cell.v ?? '';
    }
    for (const [address, expected] of Object.entries(TEMPLATE_HEADERS[name])) {
      if ((name === '平台資料' && address === 'K4' || name === '商品品類' && address === 'D4') && !grid[address]) continue;
      if (!(XLSX_HEADER_ALIASES[name]?.[address] ?? [expected]).includes(grid[address])) throw Error('HEADER_CONTRACT ' + name + '!' + address);
    }
    grids[name] = grid;
  }
  if(isNameLayout(grids)){
    const settings=grids['轉檔設定'];
    const versionAddress=Object.keys(settings).find(a=>/^A\d+$/.test(a)&&settings[a]==='schemaVersion');
    if(!versionAddress||settings['B'+versionAddress.slice(1)]!=='3.1.0')throw Error('CATALOG_LAYOUT_REQUIRES_31');
    if(!deferIdentity)throw Error('CATALOG_CONFIRMATION_REQUIRED');
    const ruleRows=[...new Set(Object.entries(grids['規則總表']).filter(([a,v])=>v!==''&&!/^[AHIUV]\d+$/.test(a)).map(([a])=>Number(a.replace(/[A-Z]/g,''))).filter(r=>r>=5))].sort((a,b)=>a-b);
    return {ok:true,catalogDraft:{grids,ruleRows},originalMode:'replace',format:'xlsx'};
  }
  const candidate = mapSources(grids);
  if(candidate.schemaVersion!=='3.1.0'&&Object.entries(grids['規則總表']).some(([a,v])=>/^V\d+$/.test(a)&&v!==''))throw Error('UNSUPPORTED_DATA 規則總表!V4');
  const ruleRows = [...new Set(Object.entries(grids['規則總表']).filter(([a,v])=>v!==''&&!/^[AHIUV]\d+$/.test(a))
    .map(([a])=>Number(a.replace(/[A-Z]/g,''))).filter(r=>r>=5))].sort((a,b)=>a-b);
  if(deferIdentity&&candidate.schemaVersion==='3.1.0')return {ok:true,draft:candidate,ruleRows,originalMode:'replace',format:'xlsx'};
  const result = parseCandidate(JSON.stringify(candidate));
  if (!result.ok) {
    const locations = { platforms: ['平台資料', { id: 'A', name: 'B', enabled: 'D', order: 'E', strategy: 'F', subflows: 'G', sites: 'H' }],
      productTypes: ['商品品類', { id: 'A', name: 'B' }], sources: ['來源資料', { id: 'A', documentVersion: 'B', title: 'C', documentPath: 'D', nature: 'E' }],
      facts: ['人工條件', { id: 'A', name: 'B', values: 'C' }], rules: ['規則總表', { id: 'A', scope: 'B', title: 'C', content: 'D',
        category: 'J', priority: 'K', placements: 'L', appliesTo: 'O', sourceRefs: 'R' }],
      exceptions: ['例外規則', { id: 'A', target: 'G', action: 'H', replacement: 'I', appliesTo: 'D', reason: 'M', sourceRefs: 'U' }] };
    const rowNumbers = (sheet) => [...new Set(Object.entries(grids[sheet]).filter(([a, v]) => v !== '' &&
      !(sheet === '規則總表' && /^[HIU][0-9]+$/.test(a)))
      .map(([a]) => Number(a.replace(/[A-Z]/g, ''))).filter((r) => r >= 5))].sort((a, b) => a - b);
    return { ...result, errors: result.errors.map((e) => {
      const match = /^\/(platforms|productTypes|sources|facts|rules|exceptions)\/(\d+)(?:\/([^/]+))?/.exec(e.path);
      if (!match) return e;
      const [sheet, columns] = locations[match[1]], row = rowNumbers(sheet)[Number(match[2])];
      const rule = match[1] === 'rules' ? candidate.rules[Number(match[2])] : null;
      let col = columns[match[3]] ?? 'A';
      if (match[1] === 'rules') {
        if (/\/scope\/platformId$/.test(e.path)) col = 'E';
        if (/\/scope\/productTypeId$/.test(e.path)) col = 'F';
        if (/\/sourceRefs\/\d+\/policyId$/.test(e.path)) col = 'S';
        if (/\/sourceRefs\/\d+\/locator$/.test(e.path)) col = 'G';
        if (e.type === 'RULE_SCOPE_MISMATCH' && rule?.scope.kind === 'platform') col = 'E';
      }
      return row ? { ...e, jsonPath: e.path, location: sheet + '!' + col + row,
        scopeKind: e.scopeKind ?? rule?.scope.kind,
        path: sheet + '!' + col + row + '（' + e.path + '）' } : e;
    }) };
  }
  return { ...result, originalMode: 'replace', format: 'xlsx' };
}
