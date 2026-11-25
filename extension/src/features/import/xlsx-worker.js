import { readXlsxCandidate } from './xlsx-reader.js';
self.onmessage = ({ data }) => {
  try { self.postMessage(readXlsxCandidate(data, { deferIdentity: true })); }
  catch (error) { self.postMessage({ ok: false, errors: [{ type: 'XLSX', path: '/', location: error.location ?? /([^\s]+![A-Z]+[1-9][0-9]*)$/.exec(error.message)?.[1], reason: error.message,
    hint: '請檢查支援範本、來源工作表與錯誤座標。公式、未知欄位或不支援的結構不能匯入。' }] }); }
};
