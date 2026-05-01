// annotationSummary.js
// 假设此文件放在 your-addon/content/annotationSummary.js
// 负责：向 Zotero "工具" 菜单添加"打开标注总结"菜单项，
//       导出当前库中所有 annotation 到临时 JSON 文件，并返回 file:// URI。

import { config } from "../package.json";
import { createZToolkit } from "./utils/ztoolkit";
import { getString } from "./utils/locale";

const ztoolkit = createZToolkit();

// —— 当 Zotero 主窗口加载完毕时，向 "工具" 菜单添加菜单项 —— 
export function onMainWindowLoad(
  win: Window,
  extractAllAnnotations?: () => Promise<string | null>
) {
  const toolsMenu = win.document.getElementById("menu_ToolsPopup");
  if (toolsMenu) {
    // "打开注释总结" 菜单项（合并"导出"+"打开"）
    const existingOpenTabButton = win.document.getElementById(
      "zotero-tb-open-tab"
    );
    if (!existingOpenTabButton) {
      const openTabMenuItem = win.document.createXULElement("menuitem");
      openTabMenuItem.setAttribute("label", getString("menuitem-open-annotation-summary"));
      openTabMenuItem.setAttribute("id", "zotero-tb-open-tab");
      openTabMenuItem.addEventListener("command", async () => {
        const fileUri = await extractAllAnnotations!();
        if (fileUri) openHelloZoteroTab(fileUri);
      });
      toolsMenu.appendChild(openTabMenuItem);
    }
  }
}

// —— 点击"打开注释总结"后，直接打开标签页并加载 index.html，用传入的 fileUri —— 
export function openHelloZoteroTab(fileUri: string) {
  const Zotero_Tabs = Zotero.getMainWindow().Zotero_Tabs;
  const { container } = Zotero_Tabs.add({
    type: "library",
    title: "Annotation Summary",
    data: {},
    select: true,
    onClose: () => {
      Zotero.debug("【清理】关闭 Annotation Summary tab");
    }
  });

  const encodedFileUri = encodeURIComponent(fileUri);
  const browserSrc = `chrome://${config.addonName}/content/index.html?file=${encodedFileUri}`;
  Zotero.debug("openHelloZoteroTab: browserSrc=" + browserSrc);

  ztoolkit.UI.appendElement(
    {
      tag: "browser", // 用 <browser> 保留 query string
      namespace: "xul",
      attributes: {
        type: "content-primary",
        flex: "1",
        src: browserSrc,
      },
      styles: {
        width: "100%",
        height: "100%",
        border: "none",
      },
    },
    container
  );

  // —— 设置当前新建标签的图标 —— 
  try {
    const win = Zotero.getMainWindow();
    const doc = win.document as any;
    const iconUrl = `chrome://${config.addonName}/content/icons/favicon@0.5x.png`;
    // 等一帧，等待 Tab DOM 完全渲染
    setTimeout(() => {
      try {
        const iconEl: any =
          doc.querySelector('.tab[aria-selected=\"true\"] .tab-icon') ||
          doc.querySelector('.tab[selected=\"true\"] .tab-icon') ||
          doc.querySelector('.tab[selected] .tab-icon') ||
          doc.querySelector('.selected .tab-icon');
        if (iconEl) {
          // 同时设置 listStyleImage 与 backgroundImage 提高兼容性
          try { iconEl.style.listStyleImage = `url(${iconUrl})`; } catch { }
          try { iconEl.style.setProperty('background-image', `url(${iconUrl})`, 'important'); } catch { }
          // 确保尺寸为 16x16
          try { iconEl.style.width = '16px'; iconEl.style.height = '16px'; } catch { }
        }
      } catch { }
    }, 0);
  } catch { }
}

// —— Collection 路径缓存构建（同步）——
// 在 Zotero.Items.getAll() 执行后，所有 Collection 对象已由 Zotero 加载到内存缓存中，
// 使用 getByLibrary + 同步 get 即可构建完整路径，无需任何异步等待。
function buildCollectionPathCache(libraryID: number): Map<number, string[]> {
  const cache = new Map<number, string[]>();
  const allCols: any[] = ((Zotero.Collections as any).getByLibrary(libraryID) || []) as any[];
  const colById = new Map<number, any>();
  allCols.forEach((col: any) => colById.set(col.id, col));

  // 递归构建路径片段（带缓存，防止重复计算）
  function getSegs(colID: number): string[] {
    if (cache.has(colID)) return cache.get(colID)!;
    const col = colById.get(colID);
    if (!col) { cache.set(colID, []); return []; }
    const parentSegs = col.parentID ? getSegs(col.parentID as number) : [];
    const segs = [...parentSegs, col.name as string];
    cache.set(colID, segs);
    return segs;
  }

  allCols.forEach((col: any) => getSegs(col.id as number));
  return cache;
}

// —— 提取所有注释，结果写入临时文件，返回 file:// URI；发生错误时返回 null ——
// 性能优化：
//   1. Zotero.Items.getAll() 会将文库内所有 Item 加载到 Zotero 内存缓存。
//      此后 Zotero.Items.get(id) 为纯同步操作，无需 await，消除了原有的 3000+ 串行微任务等待。
//   2. 通过 buildCollectionPathCache() 一次性预构建 Collection 完整路径映射，
//      彻底消除原有的嵌套循环 await Zotero.Collections.get()。
export async function extractAllAnnotations(): Promise<string | null> {
  const ZoteroPane = Zotero.getActiveZoteroPane();
  if (!ZoteroPane) return null;
  const libraryID = ZoteroPane.getSelectedLibraryID();
  if (!libraryID) return null;

  // 唯一一次真正的异步调用：将文库所有 Item 加载到缓存
  const items = await Zotero.Items.getAll(libraryID);
  const annotations = items.filter((i) => i.isAnnotation && i.isAnnotation());
  if (annotations.length === 0) return null;

  // 预构建 Collection 路径缓存（同步，O(collection数)，与 annotation 数量无关）
  const colPathCache = buildCollectionPathCache(libraryID);

  // —— 预渲染：为缺失缓存图片的 image 标注生成 PNG ——
  // Zotero 的图片缓存是懒生成的（仅在 PDF Reader 打开时才会创建），
  // 因此从未在本机打开过的 PDF（如同步过来的）不会有缓存。
  // 使用 PDFWorker.renderAttachmentAnnotations() 主动触发渲染。
  try {
    const imageAnnotations = (annotations as any[]).filter(
      (a: any) => a.annotationType === "image" || (a.toJSON && a.toJSON().annotationType === "image")
    );
    if (imageAnnotations.length > 0) {
      // 收集需要渲染的附件 ID（去重）
      const attachmentIds = new Set<number>();
      for (const ann of imageAnnotations) {
        if (ann.parentID) attachmentIds.add(ann.parentID as number);
      }
      // 并发触发渲染（PDFWorker 内部有队列，不会真正并行读取 PDF）
      const renderPromises: Promise<any>[] = [];
      for (const attId of attachmentIds) {
        try {
          renderPromises.push(
            (Zotero as any).PDFWorker.renderAttachmentAnnotations(attId, true)
          );
        } catch { /* 单个附件渲染失败不影响其他 */ }
      }
      if (renderPromises.length > 0) {
        Zotero.debug(`[annotation-summary] Pre-rendering image caches for ${attachmentIds.size} attachment(s)...`);
        await Promise.allSettled(renderPromises);
        Zotero.debug(`[annotation-summary] Pre-render complete.`);
      }
    }
  } catch (preRenderErr) {
    Zotero.debug(`[annotation-summary] Pre-render step failed (non-fatal): ${preRenderErr}`);
  }

  const result: any[] = [];
  for (const itemAny of annotations as any[]) {
    const item: any = itemAny;
    try {
      const fullItem: any = item.toJSON();
      const pos = JSON.parse(fullItem.annotationPosition ?? "{}");

      // 对 image 类型标注，获取缓存的截图 Data URI
      let imageDataUri = "";
      if (fullItem.annotationType === "image") {
        try {
          const itemRef = { libraryID: item.libraryID, key: fullItem.key };
          const imgPath = (Zotero as any).Annotations.getCacheImagePath(itemRef);
          Zotero.debug(`[annotation-summary] image cache path: ${imgPath}`);

          if (imgPath) {
            // 策略1: 使用 Zotero.Annotations.hasCacheImage（官方 API）
            // 策略2: 使用 IOUtils.exists（Zotero 7 / Firefox 115+ 推荐）
            // 策略3: 直接尝试读取（跳过存在性检查）
            let fileExists = false;
            try {
              fileExists = await (Zotero as any).Annotations.hasCacheImage(itemRef);
            } catch {
              try {
                fileExists = await (globalThis as any).IOUtils.exists(imgPath);
              } catch {
                // 跳过存在性检查，直接尝试读取
                fileExists = true;
              }
            }

            if (fileExists) {
              imageDataUri = await Zotero.File.generateDataURI(imgPath, "image/png");
              Zotero.debug(`[annotation-summary] image loaded: ${fullItem.key} (${imageDataUri.length} chars)`);
            }
          }
        } catch (imgErr) {
          Zotero.debug(`[annotation-summary] image extraction failed for ${fullItem.key}: ${imgErr}`);
        }
      }

      // 同步查缓存（getAll 后所有 attachment 已在 Zotero 内存中）
      const attachment: any = Zotero.Items.get(item.parentID);
      let title = "未知";
      let pdfKey = "";
      let topItem: any = null;
      if (attachment?.isAttachment()) {
        pdfKey = attachment.key ?? "";
        const parentID = typeof attachment.parentID === "number" || typeof attachment.parentID === "string"
          ? attachment.parentID : null;
        // 同步查缓存
        const parentItem: any = parentID ? Zotero.Items.get(parentID) : null;
        title = parentItem?.getField("title") ?? title;
        topItem = parentItem;
        // 向上追溯到顶层 Item（全同步）
        while (topItem && typeof topItem.isTopLevelItem === "function" && !topItem.isTopLevelItem()) {
          const pid = topItem.parentID;
          if (!pid) break;
          topItem = Zotero.Items.get(pid);
        }
      }

      // Collection 路径：直接从预构建缓存读取，无任何 await
      let collectionIDs: Array<number | string> = [];
      const collectionNames: string[] = [];
      const collectionPaths: string[] = [];
      if (topItem && typeof topItem.getCollections === "function") {
        const ids = topItem.getCollections();
        if (Array.isArray(ids)) {
          collectionIDs = ids as Array<number | string>;
          const seenNames = new Set<string>();
          const seenPaths = new Set<string>();
          for (const cid of ids) {
            const segs = colPathCache.get(cid as number) ?? [];
            segs.forEach((n) => { if (!seenNames.has(n)) { seenNames.add(n); collectionNames.push(n); } });
            for (let i = 0; i < segs.length; i++) {
              const path = segs.slice(0, i + 1).join(" / ");
              if (!seenPaths.has(path)) { seenPaths.add(path); collectionPaths.push(path); }
            }
          }
        }
      }

      const key = fullItem.key ?? "";
      const parentItemKey = fullItem.parentItem;
      const uri = parentItemKey ? `zotero://open/library/items/${parentItemKey}?page=&annotation=${key}` : "";

      let year = "";
      let authorSummary = "";
      let publicationTitle = "";
      let extra = "";

      if (topItem) {
        year = topItem.getField("date", true) || "";
        if (year && year.length > 4) {
          const match = year.match(/\d{4}/);
          if (match) year = match[0];
        }
        try { publicationTitle = topItem.getField("publicationTitle", true) || ""; } catch { }
        try { extra = topItem.getField("extra", true) || ""; } catch { }
        try {
          const creators = topItem.getCreators() || [];
          const authorNames = creators
            .filter((c: any) => c.creatorTypeID === Zotero.CreatorTypes.getID("author") || c.creatorType === "author" || !c.creatorType)
            .map((c: any) => [c.firstName, c.lastName].filter(Boolean).join(" "))
            .filter(Boolean);
          authorSummary = authorNames.join(", ");
        } catch { }
      }

      result.push({
        itemID: item.itemID,
        text: fullItem.annotationText ?? "",
        comment: fullItem.annotationComment ?? "",
        color: fullItem.annotationColor ?? "",
        pageLabel: fullItem.annotationPageLabel ?? "",
        pageIndex: pos.pageIndex ?? "",
        type: fullItem.annotationType ?? "",
        tags: (fullItem.tags || []).map((t: any) => t.tag),
        dateAdded: fullItem.dateAdded ?? "",
        key,
        sourceTitle: title,
        year,
        authorSummary,
        publicationTitle,
        extra,
        pdfKey,
        uri,
        parentID: item.parentID,
        topItemID: topItem?.itemID ?? undefined,
        collectionIDs,
        collectionNames,
        collectionPaths,
        // image 类型标注的 base64 Data URI（非 image 类型为空字符串）
        image: imageDataUri,
      });
    } catch { }
  }

  try {
    const json = JSON.stringify(result, null, 2);
    const tmpDir = (Components as any).classes["@mozilla.org/file/directory_service;1"]
      .getService((Components as any).interfaces.nsIProperties)
      .get("TmpD", (Components as any).interfaces.nsIFile);
    const tempFile = tmpDir.clone();
    tempFile.append(`annotation-summary-${Date.now()}.json`);
    await Zotero.File.putContents(tempFile, json);
    const fileUri = `file://${tempFile.path.replace(/\\/g, "/")}`;
    Zotero.Prefs.set(`${config.addonID}.lastTempFile`, fileUri);
    return fileUri;
  } catch {
    return null;
  }
}

export async function exportDataToFile(jsonString: string, defaultFilename: string): Promise<boolean> {
  try {
    const win = Zotero.getMainWindow();
    if (!win) return false;

    const fp = (win.Components as any).classes["@mozilla.org/filepicker;1"]
      .createInstance((win.Components as any).interfaces.nsIFilePicker);

    fp.init(
      (win as any).browsingContext || win,
      "Save Exported Annotations",
      (win.Components as any).interfaces.nsIFilePicker.modeSave
    );
    fp.appendFilter("JSON Files", "*.json");
    fp.defaultString = defaultFilename;

    const rv = await new Promise<number>((resolve) => {
      fp.open((result: number) => resolve(result));
    });

    const okCodes = [
      (win.Components as any).interfaces.nsIFilePicker.returnOK,
      (win.Components as any).interfaces.nsIFilePicker.returnReplace,
    ];
    if (!okCodes.includes(rv)) {
      return false;
    }

    const outFile = fp.file;
    await Zotero.File.putContents(outFile, jsonString);
    Zotero.debug("[annotation-summary] JSON exported to: " + outFile.path);
    return true;
  } catch (err) {
    Zotero.debug("[annotation-summary] exportDataToFile error: " + err);
    return false;
  }
}
