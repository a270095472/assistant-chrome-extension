export const layeredContract = (value) => ['3.0.0', '3.1.0'].includes(value?.schemaVersion);
// Explicit, lossless migration; never overwrites the input or stored Current.
export function documentRules31(value) {
  if (value?.schemaVersion !== '3.0.0' || value.mode !== 'replace') throw Error('Unsupported migration');
  return { ...structuredClone(value), schemaVersion: '3.1.0',
    rules: value.rules.map((rule) => ({ ...structuredClone(rule), origin: 'documentReferenced' })) };
}
