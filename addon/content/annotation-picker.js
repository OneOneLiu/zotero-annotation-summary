let editorInstance = null;
let pos = null;
let currentAnnotations = [];
let selectedIndex = -1;
var Zotero = undefined;

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

        // Limit to 100 for performance
        annotations = annotations.slice(0, 100);

        currentAnnotations = [];

        for (const itemAny of annotations) {
            const item = itemAny;
            try {
                let parentItemID = item.parentID;
                if (!parentItemID) parentItemID = item.parentItemID; // Try alternative property

                const fullItem = typeof item.toJSON === 'function' ? item.toJSON() : item;
                const attachment = await Zotero.Items.getAsync(parentItemID);
                let title = "未知";
                let pdfKey = "";
                let topItem = null;

                // Make sure attachment exists and gets loaded
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

                currentAnnotations.push({
                    annotationKey: fullItem.key || item.key,
                    attachmentKey: pdfKey,
                    title: title,
                    text: text,
                    comment: comment,
                    color: color,
                    dateAdded: dateStr
                });

                const tr = document.createElementNS("http://www.w3.org/1999/xhtml", 'tr');
                tr.setAttribute('data-index', currentAnnotations.length - 1);
                tr.className = 'anno-row';

                tr.onclick = function () { onRowSelect(this); };
                tr.ondblclick = function () { onRowSelect(this); onInsertClick(); };

                const tdColor = document.createElementNS("http://www.w3.org/1999/xhtml", 'td');
                const colorSpan = document.createElementNS("http://www.w3.org/1999/xhtml", 'span');
                colorSpan.className = 'color-dot';
                colorSpan.style.backgroundColor = color;
                tdColor.appendChild(colorSpan);
                tr.appendChild(tdColor);

                const tdText = document.createElementNS("http://www.w3.org/1999/xhtml", 'td');
                tdText.textContent = text.substring(0, 100) + (text.length > 100 ? '...' : '');
                tr.appendChild(tdText);

                const tdComment = document.createElementNS("http://www.w3.org/1999/xhtml", 'td');
                tdComment.textContent = comment.substring(0, 100) + (comment.length > 100 ? '...' : '');
                tr.appendChild(tdComment);

                const tdTitle = document.createElementNS("http://www.w3.org/1999/xhtml", 'td');
                tdTitle.textContent = title.substring(0, 50) + (title.length > 50 ? '...' : '');
                tr.appendChild(tdTitle);

                const tdDate = document.createElementNS("http://www.w3.org/1999/xhtml", 'td');
                tdDate.textContent = dateStr;
                tr.appendChild(tdDate);

                listbox.appendChild(tr);
            } catch (err) {
                Zotero.debug("[annotation-summary] loadAnnotations iter error: " + err);
            }
        }
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
    const filter = input.value.toLowerCase();
    const listbox = document.getElementById('annotation-list');

    // Clear selection when searching
    selectedIndex = -1;
    document.getElementById('insert-btn').disabled = true;

    for (let i = 0; i < listbox.children.length; i++) {
        const row = listbox.children[i];
        row.classList.remove('selected');

        // Skip the "No annotations found" or "Error" row if they don't have data-index
        if (!row.hasAttribute('data-index')) {
            continue;
        }

        const index = parseInt(row.getAttribute('data-index'), 10);
        const anno = currentAnnotations[index];

        if (anno && (
            anno.text.toLowerCase().includes(filter) ||
            anno.comment.toLowerCase().includes(filter)
        )) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    }
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
