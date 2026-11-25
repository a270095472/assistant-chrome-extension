import { createDisclosureMotion } from './disclosure-motion.js';

let instance = 0;
export function createHomeDisclosure(document) {
  const motion = createDisclosureMotion(document);
  const prefix = ++instance;
  let sequence = 0;
  function wrap(root, summary, content, id = 'home-disclosure-' + prefix + '-' + ++sequence) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'disclosure-toggle home-disclosure-toggle';
    const arrow = document.createElement('span'); arrow.textContent = '▸'; arrow.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.append(...summary);
    button.append(arrow, label); button.setAttribute('aria-controls', id); button.setAttribute('aria-expanded', 'false');
    const body = document.createElement('div'); body.id = id; body.className = 'encyclopedia-inline';
    body.hidden = true; body.inert = true; body.setAttribute('aria-hidden', 'true'); body.append(...content);
    button.addEventListener('click', () => {
      motion.finishAll();
      const opening = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(opening)); arrow.textContent = opening ? '▾' : '▸';
      if (opening) motion.show(body); else motion.hide(body);
    });
    root.replaceChildren(button, body);
    return { button, body };
  }
  return { wrap, dispose: () => motion.dispose() };
}
