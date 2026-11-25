import { Inflate, XMLParser, XMLValidator } from '../../vendor/xlsx-tools.js';
export const XLSX_LIMITS = Object.freeze({ input: 4 * 1024 * 1024, entries: 128, entry: 4 * 1024 * 1024,
  total: 16 * 1024 * 1024, ratio: 100, cells: 50000, rows: 10000 });
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseTagValue: false,
  parseAttributeValue: false, processEntities: true, removeNSPrefix: true });
export const list = (v) => v === undefined ? [] : Array.isArray(v) ? v : [v];
export function parseXml(text, name) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) throw Error('XML_INVALID ' + name);
  return parser.parse(text);
}
const crcTable = Array.from({ length: 256 }, (_, i) => { for (let j = 0; j < 8; j++) i = i >>> 1 ^ ((i & 1) ? 0xedb88320 : 0); return i >>> 0; });
function crc32(bytes) { let crc = -1; for (const b of bytes) crc = crc >>> 8 ^ crcTable[(crc ^ b) & 255]; return (crc ^ -1) >>> 0; }
// Preflight every entry (including unselected sheets) before SheetJS allocates
// workbook structures. Stream compressed input in bounded chunks, check actual
// expanded bytes, CRC, overlapping local records and central/local consistency.
export function inspectXlsxZip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input), L = XLSX_LIMITS;
  if (bytes.length > L.input || bytes.length < 22) throw Error('XLSX_INPUT_LIMIT');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (p) => view.getUint16(p, true), u32 = (p) => view.getUint32(p, true);
  const decode = (b) => new TextDecoder('utf-8', { fatal: true }).decode(b);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) if (u32(p) === 0x06054b50 && p + 22 + u16(p + 20) === bytes.length) { end = p; break; }
  if (end < 0 || u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) throw Error('ZIP_DIRECTORY');
  const count = u16(end + 10), startDirectory = u32(end + 16), directorySize = u32(end + 12);
  if (!count || count > L.entries || startDirectory + directorySize !== end) throw Error('ZIP_DIRECTORY');
  let p = startDirectory, total = 0, declared = 0;
  const parts = new Map(), spans = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || u32(p) !== 0x02014b50) throw Error('ZIP_DIRECTORY');
    const flags = u16(p + 8), method = u16(p + 10), crc = u32(p + 16), size = u32(p + 20), expanded = u32(p + 24);
    const n = u16(p + 28), extra = u16(p + 30), comment = u16(p + 32), offset = u32(p + 42);
    if (p + 46 + n + extra + comment > end || flags & ~0x808 || ![0, 8].includes(method) || u16(p + 34) ||
        [size, expanded, offset].includes(0xffffffff)) throw Error('ZIP_UNSUPPORTED');
    const name = decode(bytes.subarray(p + 46, p + 46 + n));
    if (!name || /[\\%\x00-\x1f]/.test(name) || name.startsWith('/') || name.split('/').some((s) => ['..', '.'].includes(s)) || parts.has(name)) throw Error('ZIP_PATH');
    if (/vbaProject|externalLinks|embeddings|\.bin$/i.test(name)) throw Error('ACTIVE_CONTENT');
    declared += expanded;
    if (expanded > L.entry || declared > L.total || expanded / Math.max(size, 1) > L.ratio) throw Error('EXPANSION_LIMIT');
    if (offset + 30 > startDirectory || u32(offset) !== 0x04034b50 || u16(offset + 6) !== flags || u16(offset + 8) !== method) throw Error('LOCAL_HEADER');
    const ln = u16(offset + 26), le = u16(offset + 28), start = offset + 30 + ln + le;
    if (start + size > startDirectory || decode(bytes.subarray(offset + 30, offset + 30 + ln)) !== name) throw Error('LOCAL_HEADER');
    if (!(flags & 8) && (u32(offset + 14) !== crc || u32(offset + 18) !== size || u32(offset + 22) !== expanded)) throw Error('LOCAL_SIZE');
    let spanEnd = start + size;
    if (flags & 8) {
      const d = spanEnd + (u32(spanEnd) === 0x08074b50 ? 4 : 0);
      if (d + 12 > startDirectory || u32(d) !== crc || u32(d + 4) !== size || u32(d + 8) !== expanded) throw Error('DESCRIPTOR');
      spanEnd = d + 12;
    }
    if (spans.some(([a, b]) => offset < b && spanEnd > a)) throw Error('ZIP_OVERLAP');
    spans.push([offset, spanEnd]);
    let actual = 0; const chunks = [];
    const accept = (chunk) => { actual += chunk.length; total += chunk.length;
      if (actual > expanded || actual > L.entry || total > L.total) throw Error('ACTUAL_EXPANSION_LIMIT'); chunks.push(chunk.slice()); };
    if (method === 0) accept(bytes.subarray(start, start + size));
    else { const stream = new Inflate(accept); for (let at = 0; at < size; at += 1024) stream.push(bytes.subarray(start + at, start + Math.min(size, at + 1024)), at + 1024 >= size); }
    const content = new Uint8Array(actual); let at = 0; for (const chunk of chunks) { content.set(chunk, at); at += chunk.length; }
    if (actual !== expanded || crc32(content) !== crc) throw Error('ZIP_CRC');
    let text = null;
    if (/\.(?:xml|rels)$/i.test(name)) {
      text = decode(content); const xml = parseXml(text, name);
      if (name.endsWith('.rels')) for (const rel of list(xml.Relationships?.Relationship)) {
        if (rel.TargetMode === 'External' || /^(?:[a-z]+:|\/\/)/i.test(rel.Target ?? '')) throw Error('EXTERNAL_RELATIONSHIP');
      }
      if (name === '[Content_Types].xml' && /macroEnabled|vbaProject|oleObject|activeX/i.test(text)) throw Error('ACTIVE_CONTENT');
    }
    parts.set(name, text); p += 46 + n + extra + comment;
  }
  if (p !== end || !parts.has('[Content_Types].xml') || !parts.has('xl/workbook.xml')) throw Error('ZIP_DIRECTORY');
  return { parts, total };
}
