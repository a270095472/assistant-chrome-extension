const labels = { added: '新增', modified: '修改', removed: '刪除' };
export const DIFF_BATCH = 30;

// Only the current batch owns DOM. Full JSON is materialized when expanded.
export function createDifferenceView(document, host) {
  let comparison = null, platform = '', action = '', limit = DIFF_BATCH, generation = 0;
  const expanded = new Set();
  const text = (tag, value) => { const node = document.createElement(tag); node.textContent = value; return node; };
  const button = (label, listener) => {
    const node = text('button', label); node.type = 'button'; node.disabled = false; node.addEventListener('click', listener); return node;
  };
  function filtered() { return (comparison?.changes ?? []).filter((c) => (!platform || c.platformIds.includes(platform)) && (!action || c.action === action)); }
  function render(focusLabel) {
    generation++;
    host.replaceChildren();
    if (!comparison) return;
    const controls = document.createElement('div'); controls.className = 'diff-controls';
    const select = (labelText, options, value, change) => {
      const label = document.createElement('label'), node = document.createElement('select'); node.disabled = false;
      for (const [id, name] of options) { const option = text('option', name); option.value = id; node.append(option); }
      node.value = value; node.addEventListener('change', () => { change(node.value); limit = DIFF_BATCH; render(labelText); });
      label.append(text('span', labelText), node); controls.append(label);
      if (focusLabel === labelText) queueMicrotask(() => node.focus());
    };
    select('差異平台', [['', '全部平台'], ...(comparison.platformStatistics ?? []).map((p) => [p.id, p.name + '（' + p.id + '）'])], platform, (v) => { platform = v; });
    select('變更類型', comparison.repair ? [['', '候選內容（舊資料無法比較）']] : [['', '全部變更'], ...Object.entries(labels)], action, (v) => { action = v; });
    controls.append(button('展開目前篩選全部', () => { for (const c of filtered()) expanded.add(JSON.stringify(c.identity)); renderRows(); }),
      button('收合目前篩選全部', () => { for (const c of filtered()) expanded.delete(JSON.stringify(c.identity)); renderRows(); }));
    host.append(controls);
    const count = text('p', ''); count.setAttribute('role', 'status'); host.append(count);
    const rows = document.createElement('div'); host.append(rows);
    const more = button('載入更多', () => { limit += DIFF_BATCH; renderRows(); }); host.append(more);
    function renderRows() {
      const currentGeneration = ++generation;
      const matches = filtered(), visible = matches.slice(0, limit);
      count.textContent = '篩選結果 ' + matches.length + ' 筆；已載入 ' + visible.length + ' 筆／全部 ' + comparison.changes.length + ' 筆。';
      rows.replaceChildren(...visible.map((c) => {
        const id = JSON.stringify(c.identity), row = document.createElement('details'); row.open = expanded.has(id); row.className = 'diff-row';
        row.append(text('summary', (comparison.repair ? '候選內容' : labels[c.action]) + '｜' + c.identity.join('／')));
        const body = document.createElement('div'); row.append(body);
        const fill = () => { body.replaceChildren(); if (row.open) body.append(
          text('p', '變更欄位：' + (c.fields.join('、') || '完整新增／刪除')),
          text('pre', '原資料：' + (comparison.repair ? '損壞，無法確認' : c.before === null ? '無' : JSON.stringify(c.before, null, 2))),
          text('pre', '候選資料：' + (c.after === null ? '刪除' : JSON.stringify(c.after, null, 2)))); };
        row.addEventListener('toggle', () => {
          if (currentGeneration !== generation) return;
          if (row.open) expanded.add(id); else expanded.delete(id); fill();
        }); fill(); return row;
      }));
      more.hidden = visible.length >= matches.length;
    }
    renderRows();
  }
  return { set(value) { comparison = value; platform = ''; action = ''; limit = DIFF_BATCH; expanded.clear(); render(); },
    clear() { generation++; comparison = null; expanded.clear(); host.replaceChildren(); } };
}
