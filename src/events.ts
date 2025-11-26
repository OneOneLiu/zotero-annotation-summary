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
          try { iconEl.style.listStyleImage = `url(${iconUrl})`; } catch {}
          try { iconEl.style.setProperty('background-image', `url(${iconUrl})`, 'important'); } catch {}
          // 确保尺寸为 16x16
          try { iconEl.style.width = '16px'; iconEl.style.height = '16px'; } catch {}
        }
      } catch {}
    }, 0);
  } catch {}
}

// —— 提取所有注释，结果写入临时文件，返回 file:// URI；发生错误时返回 null —— 
export async function extractAllAnnotations(): Promise<string | null> {
  const ZoteroPane = Zotero.getActiveZoteroPane();
  if (!ZoteroPane) return null;
  const libraryID = ZoteroPane.getSelectedLibraryID();
  if (!libraryID) return null;

  const items = await Zotero.Items.getAll(libraryID);
  const annotations = items.filter((i) => i.isAnnotation && i.isAnnotation());
  if (annotations.length === 0) return null;

  const result: any[] = [];
  for (const itemAny of annotations as any[]) {
    const item: any = itemAny;
    try {
      const fullItem: any = item.toJSON();
      const pos = JSON.parse(fullItem.annotationPosition ?? "{}");

      const attachment: any = await Zotero.Items.get(item.parentID);
      let title = "未知";
      let pdfKey = "";
      let topItem: any = null;
      if (attachment?.isAttachment()) {
        pdfKey = attachment.key ?? "";
        const parentItem = (typeof attachment.parentID === "number" || typeof attachment.parentID === "string")
          ? await Zotero.Items.get(attachment.parentID)
          : null;
        title = parentItem?.getField("title") ?? title;
        topItem = parentItem;
        while (topItem && typeof topItem.isTopLevelItem === "function" && !topItem.isTopLevelItem()) {
          const pid = topItem.parentID;
          if (!pid) break;
          topItem = await Zotero.Items.get(pid);
        }
      }

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
            try {
              const col = await Zotero.Collections.get(cid as any);
              if (!col) continue;
              const segs: string[] = [];
              let cursor: any = col;
              let guard = 0;
              while (cursor && guard < 30) {
                if (cursor.name) segs.unshift(cursor.name);
                if (!cursor.parentID) break;
                cursor = await Zotero.Collections.get(cursor.parentID);
                guard++;
              }
              segs.forEach((n) => { if (!seenNames.has(n)) { seenNames.add(n); collectionNames.push(n); } });
              for (let i = 0; i < segs.length; i++) {
                const path = segs.slice(0, i + 1).join(" / ");
                if (!seenPaths.has(path)) { seenPaths.add(path); collectionPaths.push(path); }
              }
            } catch {}
          }
        }
      }

      const key = fullItem.key ?? "";
      const parentItemKey = fullItem.parentItem;
      const uri = parentItemKey ? `zotero://open/library/items/${parentItemKey}?page=&annotation=${key}` : "";

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
        pdfKey,
        uri,
        parentID: item.parentID,
        topItemID: topItem?.itemID ?? undefined,
        collectionIDs,
        collectionNames,
        collectionPaths,
      });
    } catch {}
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
