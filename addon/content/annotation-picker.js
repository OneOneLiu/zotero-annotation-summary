let editorInstance = null;
let pos = null;
let allAnnotations = [];    // Full list loaded from Zotero (all, in memory)
let currentAnnotations = []; // Subset currently rendered in the table
let selectedIndex = -1;
var Zotero = undefined;

const DISPLAY_LIMIT = 100;

async function onLoad() {
    const args = window.arguments;
    if (args && args.length >= 3) {
        editorInstance = args[0];
        pos = args[1];
        Zotero = args[2];
    } else {
        console.error("[annotation-summary] annotation-picker: missing editor instance arguments");
        // Fallback
        if (typeof Components !== "undefined") {
            try {
                Zotero = Components.classes["@zotero.org/Zotero;1"]
                    .getService(Components.interfaces.nsISupports).wrappedJSObject;
            } catch (e) { }
        }
    }

    // Set fluent strings
    try {
        const Fluent = Zotero.Fluent || null; // Zotero 7 API
        document.title = Zotero.AnnotationSummary.getString('note-editor-insert-annotation').replace('...', '');
    } catch (e) {
        document.title = "Insert Annotation";
    }

    await loadAnnotations();
}

async function loadAnnotations() {
    const listbox = document.getElementById("annotation-list");

    try {
        const AnnotationSummary = Zotero.AnnotationSummary || Zotero.annotationSummary;
        if (!AnnotationSummary) {
            Zotero.debug("[annotation-summary] Cannot find AnnotationSummary plugin instance");
            throw new Error("Plugin instance not found.");
        }

        // —— 优先策略：读取 extractAllAnnotations() 已生成的临时 JSON 缓存 ——
        // 这样可以完全复用主界面的数据，无需重复遍历全库（避免与 events.ts 重复逻辑）。
        const PREFS_KEY = 'annotation-summary@ool.utoronto.ca.lastTempFile';
        let cachedLoaded = false;

        try {
            const lastFileUri = Zotero.Prefs.get(PREFS_KEY);
            if (lastFileUri) {
                const ioService = Components.classes["@mozilla.org/network/io-service;1"]
                    .getService(Components.interfaces.nsIIOService);
                const fileURL = ioService.newURI(lastFileUri, null, null)
                    .QueryInterface(Components.interfaces.nsIFileURL);
                const nsIFile = fileURL.file;

                if (nsIFile.exists()) {
                    const jsonStr = await Zotero.File.getContents(nsIFile);
                    if (jsonStr) {
                        const data = JSON.parse(jsonStr);
                        if (Array.isArray(data) && data.length > 0) {
                            // 将缓存 JSON 转换为 picker 所需的格式，按时间倒序
                            allAnnotations = data
                                .slice() // 不修改原数组
                                .sort((a, b) => {
                                    const aD = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
                                    const bD = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
                                    return bD - aD;
                                })
                                .map(a => ({
                                    annotationKey: a.key,
                                    attachmentKey: a.pdfKey,
                                    title: a.sourceTitle || "未知",
                                    text: a.text || "[Empty]",
                                    comment: a.comment || "",
                                    color: a.color || "#ffd400",
                                    type: a.type || "highlight",
                                    image: a.image || "",
                                    dateAdded: a.dateAdded
                                        ? new Date(a.dateAdded).toLocaleString()
                                        : "Unknown Date"
                                }));
                            renderAnnotations(allAnnotations.slice(0, DISPLAY_LIMIT));
                            cachedLoaded = true;
                            Zotero.debug("[annotation-summary] picker: loaded " + allAnnotations.length + " annotations from cache");
                        }
                    }
                }
            }
        } catch (cacheErr) {
            Zotero.debug("[annotation-summary] picker: cache read failed, will call extractAllAnnotations: " + cacheErr);
        }

        if (cachedLoaded) return;

        // —— 回退策略：调用 extractAllAnnotations() 生成新缓存后再读取 ——
        // 仅在首次（尚未打开过主界面）或缓存文件被清理时触发。
        Zotero.debug("[annotation-summary] picker: no valid cache, calling extractAllAnnotations");
        if (typeof AnnotationSummary.extractAllAnnotations === 'function') {
            const newUri = await AnnotationSummary.extractAllAnnotations();
            if (newUri) {
                // 递归调用自身，此时缓存已存在
                await loadAnnotations();
                return;
            }
        }

        // 无数据可用
        const tr = document.createElementNS("http://www.w3.org/1999/xhtml", "tr");
        const td = document.createElementNS("http://www.w3.org/1999/xhtml", "td");
        td.setAttribute('colspan', '5');
        td.textContent = 'No annotations found';
        td.style.padding = "6px";
        tr.appendChild(td);
        listbox.appendChild(tr);

    } catch (e) {
        Zotero.debug("[annotation-summary] loadAnnotations error: " + e);
        const tr = document.createElementNS("http://www.w3.org/1999/xhtml", 'tr');
        const td = document.createElementNS("http://www.w3.org/1999/xhtml", 'td');
        td.setAttribute('colspan', '5');
        td.textContent = 'Error loading annotations: ' + e;
        td.style.padding = '6px';
        td.style.color = 'red';
        tr.appendChild(td);
        listbox.appendChild(tr);
    }
}

function renderAnnotations(annoSubset) {
    const listbox = document.getElementById('annotation-list');
    // Clear existing rows
    while (listbox.firstChild) listbox.removeChild(listbox.firstChild);

    selectedIndex = -1;
    document.getElementById('insert-btn').disabled = true;
    currentAnnotations = annoSubset;

    for (let i = 0; i < annoSubset.length; i++) {
        const anno = annoSubset[i];

        const tr = document.createElementNS("http://www.w3.org/1999/xhtml", 'tr');
        tr.setAttribute('data-index', i);
        tr.className = 'anno-row';
        tr.onclick = function () { onRowSelect(this); };
        tr.ondblclick = function () { onRowSelect(this); onInsertClick(); };

        const tdColor = document.createElementNS("http://www.w3.org/1999/xhtml", 'td');
        const colorSpan = document.createElementNS("http://www.w3.org/1999/xhtml", 'span');
        colorSpan.className = 'color-dot';
        colorSpan.style.backgroundColor = anno.color;
        tdColor.appendChild(colorSpan);
        tr.appendChild(tdColor);

        const tdText = document.createElementNS("http://www.w3.org/1999/xhtml", 'td');
        if (anno.type === 'image' && anno.image) {
            // 图片标注：显示缩略图 + 标签
            const thumb = document.createElementNS("http://www.w3.org/1999/xhtml", 'img');
            thumb.src = anno.image;
            thumb.style.height = '40px';
            thumb.style.maxWidth = '80px';
            thumb.style.objectFit = 'contain';
            thumb.style.verticalAlign = 'middle';
            thumb.style.marginRight = '6px';
            thumb.style.borderRadius = '3px';
            tdText.appendChild(thumb);
            const label = document.createElementNS("http://www.w3.org/1999/xhtml", 'span');
            label.textContent = '[Image]';
            label.style.color = '#999';
            label.style.fontStyle = 'italic';
            tdText.appendChild(label);
        } else if (anno.type === 'image') {
            tdText.textContent = '🖼️ [Image]';
        } else {
            tdText.textContent = anno.text.substring(0, 100) + (anno.text.length > 100 ? '...' : '');
        }
        tr.appendChild(tdText);

        const tdComment = document.createElementNS("http://www.w3.org/1999/xhtml", 'td');
        tdComment.textContent = anno.comment.substring(0, 100) + (anno.comment.length > 100 ? '...' : '');
        tr.appendChild(tdComment);

        const tdTitle = document.createElementNS("http://www.w3.org/1999/xhtml", 'td');
        tdTitle.textContent = anno.title.substring(0, 50) + (anno.title.length > 50 ? '...' : '');
        tr.appendChild(tdTitle);

        const tdDate = document.createElementNS("http://www.w3.org/1999/xhtml", 'td');
        tdDate.textContent = anno.dateAdded;
        tr.appendChild(tdDate);

        listbox.appendChild(tr);
    }
}

function onRowSelect(rowEl) {
    selectedIndex = parseInt(rowEl.getAttribute('data-index'), 10);
    const listbox = document.getElementById('annotation-list');

    // Clear all rows styling
    for (let i = 0; i < listbox.children.length; i++) {
        const row = listbox.children[i];
        if (i === selectedIndex) {
            row.classList.add('selected');
        } else {
            row.classList.remove('selected');
        }
    }

    document.getElementById('insert-btn').disabled = false;
}

function onSearch() {
    const input = document.getElementById('search-input');
    const filter = input.value.trim().toLowerCase();

    if (!filter) {
        // No search query: show latest DISPLAY_LIMIT annotations
        renderAnnotations(allAnnotations.slice(0, DISPLAY_LIMIT));
        return;
    }

    // Search query present: filter from ALL annotations and take first DISPLAY_LIMIT matches
    const matched = allAnnotations.filter(anno =>
        anno.text.toLowerCase().includes(filter) ||
        anno.comment.toLowerCase().includes(filter)
    ).slice(0, DISPLAY_LIMIT);

    renderAnnotations(matched);
}

function onInsertClick() {
    if (selectedIndex < 0 || selectedIndex >= currentAnnotations.length) {
        return; // Nothing valid selected
    }

    const selectedAnno = currentAnnotations[selectedIndex];

    if (editorInstance && pos !== null) {
        // Construct Zotero URI
        const uri = `zotero://open/library/items/${selectedAnno.attachmentKey}?page=&annotation=${selectedAnno.annotationKey}`;

        // Create minimal HTML link format (superscript emoji)
        const tooltipText = `Text: ${selectedAnno.text}\nComment: ${selectedAnno.comment}\nItem: ${selectedAnno.title}`;
        // Escape quotes to prevent breaking HTML attributes
        const safeTooltip = tooltipText.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        const html = `<sup><a href="${uri}" title="${safeTooltip}">[📝]</a></sup>`;

        Zotero.debug("[annotation-summary] Inserting link: " + uri);

        // Call back to the editor instance to insert HTML
        try {
            editorInstance._originalPostMessage = editorInstance._originalPostMessage || editorInstance.__proto__._postMessage;

            const postMsg = editorInstance._postMessage_annotation_summary_hook_original || editorInstance._postMessage;

            if (typeof postMsg === 'function') {
                // Because we hooked it, we need to bypass our own hook or just let it process. 
                // Actually action: 'insertHTML' is handled normally by iframe natively.
                editorInstance._postMessage({
                    action: 'insertHTML',
                    pos: pos,
                    html: html
                });
            } else {
                editorInstance._iframeWindow.postMessage({ instanceID: editorInstance.instanceID, message: { action: 'insertHTML', pos: pos, html: html } }, '*');
            }
        } catch (e) {
            Zotero.debug("[annotation-summary] Failed to post message to editor instance: " + e);
        }
    }

    window.close();
}
