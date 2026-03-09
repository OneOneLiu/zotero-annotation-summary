import {
  BasicExampleFactory,
  HelperExampleFactory,
  KeyExampleFactory,
  PromptExampleFactory,
  UIExampleFactory,
} from "./modules/examples";
import { getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";
import { config } from "../package.json";
import { extractAllAnnotations, openHelloZoteroTab } from "./events";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  // —— 注册工具栏按钮（最小实现：克隆原生按钮 + 16px 图标）——
  try {
    const doc: any = win.document;
    const toolbar = doc.getElementById("zotero-items-toolbar");
    if (!toolbar || doc.getElementById("annotation-summary-toolbarbutton")) return;

    const template: any =
      toolbar.querySelector("#zotero-tb-add") ||
      toolbar.querySelector("#zotero-tb-note-add") ||
      toolbar.querySelector("toolbarbutton.zotero-tb-button");

    const btn: any = template ? template.cloneNode(true) : doc.createXULElement("toolbarbutton");
    btn.setAttribute("id", "annotation-summary-toolbarbutton");
    btn.setAttribute("tooltiptext", getString("menuitem-open-annotation-summary"));
    if (!template) btn.setAttribute("class", "zotero-tb-button");
    ["command", "oncommand", "onclick", "onmousedown", "type", "wantdropmarker"].forEach((a) => btn.removeAttribute(a));
    btn.querySelector("menupopup")?.remove();
    btn.querySelector("dropmarker")?.remove();

    // 16px 运行时降采样图标
    const setIcon16 = (button: any, url: string) => {
      const img = new (win as any).Image();
      img.onload = () => {
        const c: any = win.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
        c.width = c.height = 16;
        const ctx = c.getContext("2d");
        ctx?.drawImage(img, 0, 0, 16, 16);
        (button as any).style.listStyleImage = `url(${c.toDataURL("image/png")})`;
        const inner = button.querySelector("image.toolbarbutton-icon");
        if (inner) { inner.removeAttribute("type"); inner.setAttribute("width", "16"); inner.setAttribute("height", "16"); }
      };
      img.src = url;
    };
    setIcon16(btn, `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`);

    btn.addEventListener("command", async () => {
      const fileUri = await extractAllAnnotations();
      if (fileUri) openHelloZoteroTab(fileUri);
    });

    // 插到“原生按钮组”的最后一个（搜索框之前的最后一个原生按钮之后）
    const searchNode = toolbar.querySelector("#zotero-tb-search");
    let lastNativeBeforeSearch: any = null;
    const kids: any[] = Array.from((toolbar as any).children || []);
    for (const el of kids) {
      if (el === searchNode) break;
      if (
        el &&
        String(el.tagName).toLowerCase() === "toolbarbutton" &&
        el.classList &&
        el.classList.contains("zotero-tb-button") &&
        el.id !== "annotation-summary-toolbarbutton"
      ) {
        lastNativeBeforeSearch = el;
      }
    }
    if (lastNativeBeforeSearch && lastNativeBeforeSearch.parentNode === toolbar) {
      if (lastNativeBeforeSearch.nextSibling) {
        toolbar.insertBefore(btn, lastNativeBeforeSearch.nextSibling);
      } else {
        toolbar.appendChild(btn);
      }
    } else if (searchNode && searchNode.parentNode === toolbar) {
      toolbar.insertBefore(btn, searchNode);
    } else {
      toolbar.appendChild(btn);
    }
  } catch (e) {
    Zotero.debug("⚠️ 注册工具栏按钮失败: " + e);
  }

  // —— 在 PDF 阅读器标注右键菜单中注入"复制链接"按钮 ——
  setupReaderCopyLink();
}

// —— Reader 右键菜单"复制链接"注入逻辑 ——
// 使用 Zotero 官方 Reader 插件 API: Zotero.Reader.registerEventListener
let _readerListenerRegistered = false;

function setupReaderCopyLink() {
  if (_readerListenerRegistered) return;

  try {
    const pluginID = "annotation-summary@ool.utoronto.ca";
    (Zotero as any).Reader.registerEventListener(
      "createAnnotationContextMenu",
      (event: any) => {
        const { reader, params, append } = event;
        // params.ids 是当前选中标注的 key 数组
        const annotationKeys: string[] = params.ids;
        if (!annotationKeys || annotationKeys.length === 0) return;

        // 获取 attachment key
        let attachmentKey = "";
        try {
          const itemID = reader.itemID;
          if (itemID) {
            const item = Zotero.Items.get(itemID) as any;
            attachmentKey = item?.key || "";
          }
        } catch { }
        if (!attachmentKey) return;

        // 构造 URI（使用第一个选中的标注）
        const annotationKey = annotationKeys[0];
        const uri = `zotero://open/library/items/${attachmentKey}?page=&annotation=${annotationKey}`;

        append({
          label: getString("reader-copy-link"),
          onCommand: () => {
            try {
              // 使用 Zotero/Mozilla 的剪贴板工具
              const clipboardHelper = (Components as any).classes["@mozilla.org/widget/clipboardhelper;1"]
                ?.getService((Components as any).interfaces.nsIClipboardHelper);
              if (clipboardHelper) {
                clipboardHelper.copyString(uri);
              } else {
                // 回退方案
                const ta = event.doc.createElement("textarea");
                ta.value = uri;
                ta.style.position = "fixed";
                ta.style.left = "-9999px";
                event.doc.body.appendChild(ta);
                ta.select();
                event.doc.execCommand("copy");
                event.doc.body.removeChild(ta);
              }
              Zotero.debug("[annotation-summary] 已复制链接: " + uri);
            } catch (err) {
              Zotero.debug("[annotation-summary] 复制链接失败: " + err);
            }
          }
        });
      },
      pluginID
    );
    _readerListenerRegistered = true;
    Zotero.debug("[annotation-summary] 已注册 createAnnotationContextMenu 事件监听");
  } catch (e) {
    Zotero.debug("[annotation-summary] 注册 Reader 事件监听失败: " + e);
  }
}

function cleanupReaderCopyLink() {
  // Zotero 插件卸载时会自动清理依据 pluginID 注册的事件，为了保险我们可以手动调一下
  try {
    const pluginID = "annotation-summary@ool.utoronto.ca";
    (Zotero as any).Reader._unregisterEventListenerByPluginID?.(pluginID);
  } catch (e) { }
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  cleanupReaderCopyLink();
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  // Remove addon object
  addon.data.alive = false;
  // @ts-ignore - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  // You can add your code to the corresponding notify type
  ztoolkit.log("notify", event, type, ids, extraData);
  if (
    event == "select" &&
    type == "tab" &&
    extraData[ids[0]].type == "reader"
  ) {
    BasicExampleFactory.exampleNotifierCallback();
  } else {
    return;
  }
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

function onShortcuts(type: string) {
  switch (type) {
    case "larger":
      KeyExampleFactory.exampleShortcutLargerCallback();
      break;
    case "smaller":
      KeyExampleFactory.exampleShortcutSmallerCallback();
      break;
    default:
      break;
  }
}

function onDialogEvents(type: string) {
  switch (type) {
    case "dialogExample":
      HelperExampleFactory.dialogExample();
      break;
    case "clipboardExample":
      HelperExampleFactory.clipboardExample();
      break;
    case "filePickerExample":
      HelperExampleFactory.filePickerExample();
      break;
    case "progressWindowExample":
      HelperExampleFactory.progressWindowExample();
      break;
    case "vtableExample":
      HelperExampleFactory.vtableExample();
      break;
    default:
      break;
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
