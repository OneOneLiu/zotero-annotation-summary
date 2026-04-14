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
        // Find extractAllAnnotations from our plugin
        const AnnotationSummary = Zotero.AnnotationSummary || Zotero.annotationSummary;
        if (!AnnotationSummary) {
            Zotero.debug("[annotation-summary] Cannot find AnnotationSummary plugin instance");
            throw new Error("Plugin instance not found.");
        }

        // Due to module structure, it might be heavily bundled, but let's try calling the same logic 
        // that the export uses. Alternatively, we can use Zotero's search if wait for loaded.

        let itemsJSON = null;

        // To be safe and identical to the summary logic, we will redo the search logic 
        // that ensures it gets everything loaded with all attachments.
        const ZoteroPane = Zotero.getActiveZoteroPane();
        const libraryID = ZoteroPane.getSelectedLibraryID();

        if (!libraryID) throw new Error("No library selected");

        const items = await Zotero.Items.getAll(libraryID);
        let annotations = items.filter((i) => i.isAnnotation && i.isAnnotation());

        if (annotations.length === 0) {
            const tr = document.createElementNS("http://www.w3.org/1999/xhtml", "tr");
            const td = document.createElementNS("http://www.w3.org/1999/xhtml", "td");
            td.setAttribute('colspan', '5');
            td.textContent = 'No annotations found';
            td.style.padding = "6px";
            tr.appendChild(td);
            listbox.appendChild(tr);
            return;
        }

        // Sort by dateAdded descending (newest first)
        annotations.sort((a, b) => {
            // Avoid undefined date issues
            let aD = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
            let bD = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
            return bD - aD;
        });

        allAnnotations = [];

        for (const itemAny of annotations) {
            const item = itemAny;
            try {
                let parentItemID = item.parentID;
                if (!parentItemID) parentItemID = item.parentItemID;

                const fullItem = typeof item.toJSON === 'function' ? item.toJSON() : item;
                const attachment = await Zotero.Items.getAsync(parentItemID);
                let title = "未知";
                let pdfKey = "";

                const attachmentItem = Array.isArray(attachment) ? attachment[0] : attachment;

                if (attachmentItem && typeof attachmentItem.isAttachment === 'function' && attachmentItem.isAttachment()) {
                    pdfKey = attachmentItem.key || "";
                    let pID = attachmentItem.parentID;
                    if (!pID) pID = attachmentItem.parentItemID;

                    if (pID) {
                        const parentItems = await Zotero.Items.getAsync(pID);
                        const parentItem = Array.isArray(parentItems) ? parentItems[0] : parentItems;
                        if (parentItem && typeof parentItem.getField === 'function') {
                            title = parentItem.getField("title") || title;
                        }
                    }
                }

                const color = fullItem.annotationColor || item.annotationColor || '#ffd400';
                const text = fullItem.annotationText || '[Empty]';
                const comment = fullItem.annotationComment || '';
                let dateStr = "Unknown Date";
                if (fullItem.dateAdded) {
                    dateStr = new Date(fullItem.dateAdded).toLocaleString();
                }

                allAnnotations.push({
                    annotationKey: fullItem.key || item.key,
                    attachmentKey: pdfKey,
                    title: title,
                    text: text,
                    comment: comment,
                    color: color,
                    dateAdded: dateStr
                });
            } catch (err) {
                Zotero.debug("[annotation-summary] loadAnnotations iter error: " + err);
            }
        }

        // Render the first DISPLAY_LIMIT annotations by default
        renderAnnotations(allAnnotations.slice(0, DISPLAY_LIMIT));

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
        tdText.textContent = anno.text.substring(0, 100) + (anno.text.length > 100 ? '...' : '');
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
