import { config } from "../package.json";
import { createZToolkit } from "./utils/ztoolkit";
import { getString } from "./utils/locale";

const ztoolkit = createZToolkit();

// 当 Zotero 主窗口加载完毕时，向"工具"菜单添加菜单项
export function onMainWindowLoad(
  win: Window,
  extractAllAnnotations?: () => Promise<string | null>
) {
  const toolsMenu = win.document.getElementById("menu_ToolsPopup");
  if (toolsMenu) {
    // "打开注释总结"菜单项（合并"提取"+"打开"）
    const existingOpenTabButton = win.document.getElementById(
      "zotero-tb-open-tab"
    );
    if (!existingOpenTabButton) {
      const openTabMenuItem = win.document.createXULElement("menuitem");
      openTabMenuItem.setAttribute("label", getString("menuitem-open-annotation-summary"));
      openTabMenuItem.setAttribute("id", "zotero-tb-open-tab");
      openTabMenuItem.addEventListener("command", async () => {
        Zotero.debug("【菜单点击】开始导出并打开注释总结");
        // 先导出注释到临时文件，返回其 fileUri
        const fileUri = await extractAllAnnotations!();
        if (fileUri) {
          // 再打开标签页
          openHelloZoteroTab(fileUri);
        } else {
          Zotero.debug("❌ extractAllAnnotations 返回 null，未打开页面");
        }
      });
      toolsMenu.appendChild(openTabMenuItem);
    }
  }
}

// 点击"打开注释总结"后，直接打开标签页并加载 index.html，用传入的 fileUri
function openHelloZoteroTab(fileUri: string) {
  const Zotero_Tabs = Zotero.getMainWindow().Zotero_Tabs;
  const { container } = Zotero_Tabs.add({
    type: "library",
    title: "Annotation Summary",
    data: {},
    select: true,
    onClose: () => {
      // 关闭时清除临时文件 Pref
      const rawKey = `${config.addonID}.lastTempFile`;
      if (Zotero.Prefs.get(rawKey) !== null) {
        (Zotero.Prefs as any).clearUserPref(rawKey);
        Zotero.debug("【清理】已清除临时文件 Pref: " + rawKey);
      }
    },
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
}

// 提取所有注释，结果写入临时文件，返回 file:// URI；发生错误时返回 null
export async function extractAllAnnotations(): Promise<string | null> {
  Zotero.debug("🟡 开始执行 extractAllAnnotations");

  let items: any[] = [];
  let libraryID: number | undefined;
  const result: any[] = [];

  try {
    const libs = await Zotero.Libraries.getAll();
    if (libs.length === 0) throw new Error("没有找到任何 Library");

    libraryID = libs.find((lib) => lib.libraryType === "user")?.libraryID;
    if (!libraryID) throw new Error("未找到有效的 user library");

    Zotero.debug(`📚 使用库 ID: ${libraryID}`);
    items = await Zotero.Items.getAll(libraryID);
    Zotero.debug(`🟢 获取到 ${items.length} 个条目`);
  } catch (e) {
    Zotero.debug(`🔴 获取条目出错: ${e}`);
    return null;
  }

  // 过滤出 annotation 类型条目
  const annotations = items.filter((i) => {
    try {
      return i.isAnnotation && i.isAnnotation();
    } catch (e) {
      Zotero.debug(`⚠️ 条目处理出错: ${e}`);
      return false;
    }
  });
  Zotero.debug(`🔍 找到 ${annotations.length} 条注释`);
  if (annotations.length === 0) {
    Zotero.debug("⚠️ 没有找到 annotation 类型条目");
    return null;
  }

  // 逐条收集所需字段
  for (let i = 0; i < annotations.length; i++) {
    const item = annotations[i];
    try {
      const fullItem = item.toJSON();
      const text = fullItem.annotationText ?? "";
      const comment = fullItem.annotationComment ?? "";
      const color = fullItem.annotationColor ?? "";
      const pageLabel = fullItem.annotationPageLabel ?? "";
      const posRaw = fullItem.annotationPosition ?? "{}";
      const pos = JSON.parse(posRaw);
      const pageIndex = pos.pageIndex ?? "";
      const type = fullItem.annotationType ?? "";
      const tags = (fullItem.tags || []).map((t: any) => t.tag).join(", ");
      const dateAdded = fullItem.dateAdded ?? "";
      const key = fullItem.key ?? "";

      let title = "未知";
      const attachment = await Zotero.Items.get(item.parentID);
      let pdfKey = "";
      if (attachment?.isAttachment()) {
        pdfKey = attachment.key ?? "";
        const parentID = attachment.parentID;
        if (parentID) {
          const parentItem = await Zotero.Items.get(parentID);
          title = parentItem?.getField("title") ?? "未知";
        } else {
          Zotero.debug(`⚠️ 附件无 parentItem`);
        }
      } else {
        Zotero.debug(`⚠️ 该注释父项不是附件？ID: ${item.parentID}`);
      }

      let uri = "";
      if (fullItem.parentItem && pageIndex !== "") {
        uri = `zotero://open-pdf/library/items/${fullItem.parentItem}?annotation=${key}`;
      }

      result.push({
        text,
        comment,
        color,
        pageLabel,
        pageIndex,
        type,
        tags,
        dateAdded,
        key,
        sourceTitle: title,
        pdfKey,
        uri,
        parentID: item.parentID,
      });
    } catch (e) {
      Zotero.debug(`❌ 注释 ${i + 1} 处理出错: ${e}`);
    }
  }

  try {
    const json = JSON.stringify(result, null, 2);

    // 1. 用 XPCOM 获取系统临时目录
    const tmpDir = (Components as any).classes["@mozilla.org/file/directory_service;1"]
      .getService((Components as any).interfaces.nsIProperties)
      .get("TmpD", (Components as any).interfaces.nsIFile);

    // 2. 在临时目录下创建唯一文件名
    const fileName = `annotation-summary-${Date.now()}.json`;
    const tempFile = tmpDir.clone();
    tempFile.append(fileName);

    // 3. 将 JSON 写到该临时文件
    await Zotero.File.putContents(tempFile, json);

    // 4. 构造 file:// URI
    const fileUri = `file://${tempFile.path.replace(/\\/g, "/")}`;

    // 5. 把 fileUri 存到 Pref："<addonID>.lastTempFile"
    const rawKey = `${config.addonID}.lastTempFile`;
    Zotero.Prefs.set(rawKey, fileUri);
    Zotero.debug("✅ 已将临时文件 URI 写入 Pref: " + rawKey + " ==> " + fileUri);

    return fileUri;
  } catch (e) {
    Zotero.debug("❌ 写入临时文件失败: " + e);
    return null;
  }
}
