// UI-only finite animations. Semantic state changes immediately; a closing
// body is inert while visible, and is removed only when its animation settles.
export function createDisclosureMotion(document) {
  const media = document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Set();
  const finishAll = () => { for (const state of [...active]) state.finish(); };
  media?.addEventListener('change', finishAll);
  function run(node, opening, cleanup = () => {}) {
    node.hidden = false; node.inert = !opening;
    node.setAttribute('aria-hidden', String(!opening));
    let animation, done = false;
    const overflow = node.style?.overflow ?? '';
    const state = { finish() {
      if (done) return;
      done = true; active.delete(state); animation?.cancel();
      if (node.style) node.style.overflow = overflow;
      node.hidden = !opening;
      if (!opening) cleanup();
    } };
    if (media?.matches || !node.animate || !node.isConnected) { state.finish(); return; }
    node.style.overflow = 'hidden';
    const height = node.getBoundingClientRect().height;
    if (!height) { state.finish(); return; }
    active.add(state);
    animation = node.animate(opening ? [{height:'0px',opacity:0},{height:height+'px',opacity:1}] :
      [{height:height+'px',opacity:1},{height:'0px',opacity:0}], {duration:200,easing:'ease-out'});
    animation.finished.then(state.finish, state.finish);
  }
  return { show: node => run(node, true), hide: (node, cleanup) => run(node, false, cleanup), finishAll,
    dispose() { finishAll(); media?.removeEventListener('change', finishAll); } };
}
