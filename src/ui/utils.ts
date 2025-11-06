// @ts-nocheck
export function escapeHTML(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function decodeHtmlEntities(str) {
  if (!str) return "";
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
}

export function sanitizeHtml(html) {
  const allowedTags = new Set([
    "b","strong","i","em","u","sub","sup","br","span",
    "p","ul","ol","li","code","pre","a"
  ]);
  const allowedAttrs = new Set(["href","title"]);
  const container = document.createElement("div");
  container.innerHTML = decodeHtmlEntities(html || "");
  const all = container.querySelectorAll("*");
  all.forEach((el) => {
    const tag = (el as any).tagName.toLowerCase();
    if (!allowedTags.has(tag)) {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      return;
    }
    Array.from((el as any).attributes).forEach((attr: any) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        (el as any).removeAttribute(attr.name);
        return;
      }
      if (!allowedAttrs.has(name)) {
        (el as any).removeAttribute(attr.name);
        return;
      }
      if (name === "href") {
        const v = (el as any).getAttribute("href") || "";
        if (!/^(https?:|mailto:|zotero:)/i.test(v)) {
          (el as any).removeAttribute("href");
        }
      }
    });
  });
  return container.innerHTML;
}

export function escapeRegExp(str) {
  return (str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightHTML(text, query) {
  if (!query) return escapeHTML(text);
  const re = new RegExp("(" + escapeRegExp(query) + ")", "gi");
  const parts = (text || "").split(re);
  let html = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 1) {
      html += '<mark class="highlight">' + escapeHTML(part) + '</mark>';
    } else {
      html += escapeHTML(part);
    }
  }
  return html;
}

export function highlightInElement(rootEl, query) {
  if (!rootEl || !query) return;
  const re = new RegExp(escapeRegExp(query), "gi");
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null, false);
  const nodes: any[] = [];
  let n;
  while ((n = walker.nextNode())) {
    if ((n as any).nodeValue && re.test((n as any).nodeValue)) {
      nodes.push(n);
      re.lastIndex = 0;
    }
  }
  nodes.forEach((textNode) => {
    const text = (textNode as any).nodeValue || "";
    let last = 0;
    let m;
    const frag = document.createDocumentFragment();
    while ((m = re.exec(text)) !== null) {
      const plain = text.slice(last, m.index);
      if (plain) frag.appendChild(document.createTextNode(plain));
      const mark = document.createElement("mark");
      mark.className = "highlight";
      (mark as any).textContent = m[0];
      frag.appendChild(mark);
      last = m.index + m[0].length;
    }
    const tail = text.slice(last);
    if (tail) frag.appendChild(document.createTextNode(tail));
    (textNode as any).parentNode && (textNode as any).parentNode.replaceChild(frag, textNode);
    re.lastIndex = 0;
  });
}


