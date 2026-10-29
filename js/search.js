let matches = [];
let activeIndex = -1;
let activeQuery = '';

function unwrapMarks(root) {
  if (!root) return;
  root.querySelectorAll('mark.search-hit').forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

function info() {
  return { count: matches.length, index: activeIndex };
}

function activate(index, scroll) {
  if (matches.length === 0) {
    activeIndex = -1;
    return info();
  }
  matches.forEach((mark) => mark.classList.remove('search-active'));
  activeIndex = ((index % matches.length) + matches.length) % matches.length;
  const current = matches[activeIndex];
  current.classList.add('search-active');
  if (scroll) {
    current.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  return info();
}

export function clearSearch(root) {
  unwrapMarks(root);
  matches = [];
  activeIndex = -1;
  activeQuery = '';
  return info();
}

export function applySearch(root, query) {
  unwrapMarks(root);
  matches = [];
  activeIndex = -1;
  activeQuery = query;

  if (!root || !query) return info();

  const needle = query.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.toLowerCase().includes(needle)) {
        return NodeFilter.FILTER_REJECT;
      }
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    const text = node.nodeValue;
    if (!text) continue;
    const lower = text.toLowerCase();
    let start = 0;
    let found = lower.indexOf(needle, start);
    if (found === -1) continue;

    const fragment = document.createDocumentFragment();
    while (found !== -1) {
      if (found > start) {
        fragment.appendChild(document.createTextNode(text.slice(start, found)));
      }
      const mark = document.createElement('mark');
      mark.className = 'search-hit';
      mark.textContent = text.slice(found, found + query.length);
      fragment.appendChild(mark);
      matches.push(mark);
      start = found + query.length;
      found = lower.indexOf(needle, start);
    }
    if (start < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(start)));
    }
    if (node.parentNode) node.parentNode.replaceChild(fragment, node);
  }

  if (matches.length > 0) activate(0, false);
  return info();
}

export function stepSearch(delta) {
  if (matches.length === 0) return info();
  return activate(activeIndex + delta, true);
}

export function getSearchInfo() {
  return { ...info(), query: activeQuery };
}
