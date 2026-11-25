// Session-only latest observed update. The host belongs to import-page, so
// navigation never interrupts another page or discards an unread update.
export const REMOVAL_PREVIEW_COUNT = 3;
export function createUpdateNotice(document) {
  const host = document.getElementById('sop-update-notice');
  const removal = document.getElementById('sop-removal-section');
  const list = document.getElementById('sop-removal-list');
  const toggle = document.getElementById('sop-removal-toggle');
  let titles = [], expanded = false;
  function renderList() {
    const visible = expanded ? titles : titles.slice(0, REMOVAL_PREVIEW_COUNT);
    list.replaceChildren(...visible.map((title) => {
      const item = document.createElement('li'); item.textContent = title; return item;
    }));
    list.className = 'sop-removal-list' + (expanded ? ' is-expanded' : '');
    list.scrollTop = 0;
    toggle.hidden = titles.length <= REMOVAL_PREVIEW_COUNT;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? '收合明細' : '展開全部';
    document.getElementById('sop-removal-notice').textContent = '本次移除 ' + titles.length + ' 條規則。' +
      (titles.length > visible.length ? '先顯示前 ' + visible.length + ' 條，可展開全部。' : '');
  }
  const onToggle = () => { expanded = !expanded; renderList(); };
  toggle.addEventListener('click', onToggle);
  return {
    notify(version, removed, { removedPlatforms = [], selectedPlatformRemoved = false } = {}) {
      document.getElementById('sop-update-content').textContent = '公司 SOP 已更新至 v' + version;
      titles = removed.map((change) => change.before?.title ?? change.identity.at(-1));
      expanded = false; removal.hidden = titles.length === 0; renderList();
      document.getElementById('sop-platform-section').hidden = removedPlatforms.length === 0;
      document.getElementById('sop-platform-removal-notice').textContent = removedPlatforms.length ?
        '平台已移除或停用：' + removedPlatforms.map((p) => p.name).join('、') + '。' +
        (selectedPlatformRemoved ? '目前平台已失效，已觸發依目前網址重新偵測。' : '原平台偏好保留。') : '';
      host.hidden = false;
    },
    dispose() { toggle.removeEventListener('click', onToggle); titles = []; host.hidden = true; list.replaceChildren(); },
  };
}
