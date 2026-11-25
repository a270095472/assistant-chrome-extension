export function createNoteSyncClient(runtime) {
  let revision = null, state = null;
  async function send(action, request) {
    let result;
    try { result = await runtime.sendMessage({ channel: 'assistant-notes', action, request }); }
    catch { throw Error('筆記服務連線中斷；請重開側欄確認已保存內容。'); }
    if (!result?.ok) throw Error(result?.error ?? '筆記操作未確認；請重新載入。');
    return result;
  }
  function accept(result) { revision = result.revision; state = result; return structuredClone(result.data); }
  return {
    async load() { return accept(await send('read')); },
    async save(data) { return accept(await send('save', { revision, data })); },
    async check() { state = await send('read'); return state; },
    async retry() { state = await send('flush'); return state; },
    preview: () => send('preview'),
    async apply(preview, mode) { return accept(await send('apply', { revision: preview.revision, token: preview.token, mode, confirmed: true })); },
    backup: () => send('backup'),
    previewFile: (text) => send('previewFile', { text }),
    async restoreFile(preview, text, mode) { return accept(await send('restoreFile', { revision: preview.revision, token: preview.token, text, mode, confirmed: true })); },
    async undo(preview) { return accept(await send('undo', { revision: preview.revision, token: preview.token, confirmed: true })); },
    getState: () => state,
  };
}
