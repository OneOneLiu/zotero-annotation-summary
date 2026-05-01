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

  // —— 在笔记编辑器右键菜单中注入"插入标注"按钮 ——
  setupNoteEditorContextMenu();
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

// —— Note Editor 右键菜单"插入标注"注入逻辑 ——
let _noteEditorListenerRegistered = false;
let _originalOpenPopup: any = null;
let _originalPostMessage: any = null;
// Prototype 标记键，防止热重载时对同一 prototype 重复 patch 造成递归调用
const _PATCH_MARKER = "__annotationSummaryPatched";

function setupNoteEditorContextMenu() {
  if (_noteEditorListenerRegistered) return;

  try {
    const EditorInstance = (Zotero as any).EditorInstance;
    if (!EditorInstance || !EditorInstance.prototype) {
      Zotero.debug("[annotation-summary] Zotero.EditorInstance 未找到，无法注入笔记菜单");
      return;
    }

    if (!EditorInstance.prototype._openPopup || !EditorInstance.prototype._postMessage) {
      Zotero.debug("[annotation-summary] Zotero.EditorInstance 缺少核心方法，无法注入笔记菜单");
      return;
    }

    // 防止重复 patch（热重载保护：若已打过标记则直接跳过）
    if (EditorInstance.prototype[_PATCH_MARKER]) {
      Zotero.debug("[annotation-summary] Note Editor hook 已存在，跳过重复注入");
      _noteEditorListenerRegistered = true;
      return;
    }

    // 1. Hook _openPopup: 在生成 XUL 菜单前注入我们的项目
    _originalOpenPopup = EditorInstance.prototype._openPopup;
    EditorInstance.prototype._openPopup = function (x: number, y: number, pos: any, itemGroups: any[]) {
      try {
        // Avoid XrayWrapper Exception: Deep clone the itemGroups into the chrome context
        try {
          itemGroups = JSON.parse(JSON.stringify(itemGroups));
        } catch (e) { }
        // Output the actual structure of itemGroups to debug
        Zotero.debug("[annotation-summary] _openPopup called with itemGroups:");
        // Avoid cyclic dependent JSON error, just basic logging
        try {
          Zotero.debug(JSON.stringify(itemGroups, null, 2));
        } catch (je) {
          Zotero.debug("[annotation-summary] itemGroups stringify failed: " + Array.from(itemGroups).map(g => typeof g).join(", "));
        }
        const injectAnnotation = (groups: any[]) => {
          if (!Array.isArray(groups)) return false;
          for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            if (Array.isArray(group)) {
              const citationIndex = group.findIndex((item: any) => item && item.name === 'insertCitation');
              if (citationIndex !== -1) {
                const hasInsertAnnotation = group.some((item: any) => item && item.name === 'insertAnnotationSummary');
                if (!hasInsertAnnotation) {
                  group.splice(citationIndex + 1, 0, {
                    name: 'insertAnnotationSummary',
                    label: getString('note-editor-insert-annotation'),
                    enabled: true
                  });
                }
                return true;
              }
              if (injectAnnotation(group)) return true;
            } else if (group && group.groups) {
              if (injectAnnotation(group.groups)) return true;
            }
          }
          return false;
        };

        if (itemGroups && Array.isArray(itemGroups)) {
          injectAnnotation(itemGroups);
        }
      } catch (e) {
        Zotero.debug("[annotation-summary] Hook _openPopup 异常: " + e);
      }
      return _originalOpenPopup.call(this, x, y, pos, itemGroups);
    };

    // 2. Hook _postMessage: 拦截点击事件，打开弹窗并插入链接
    _originalPostMessage = EditorInstance.prototype._postMessage;
    EditorInstance.prototype._postMessage = function (message: any) {
      if (message && message.action === 'contextMenuAction' && message.ctxAction === 'insertAnnotationSummary') {
        try {
          // 这里是点击 Insert Annotation 后的处理逻辑
          Zotero.debug("[annotation-summary] 点击 Insert Annotation 菜单，打开选择弹窗");

          // 打开选择弹窗，并将当前 instance 传递过去，以便插入 HTML
          const win = Zotero.getMainWindow();
          if (win) {
            win.openDialog(
              `chrome://${config.addonRef}/content/annotation-picker.xhtml`,
              "annotation-summary-annotation-picker",
              "chrome,titlebar,toolbar,centerscreen,modal,resizable",
              this, // argument 1: editorInstance (because this is the editor instance)
              message.pos, // argument 2
              Zotero // argument 3: pass the main Zotero object!
            );
          }
        } catch (e) {
          Zotero.debug("[annotation-summary] 处理 insertAnnotationSummary 异常: " + e);
        }
        return; // 拦截消息，不发给 iframe，直接吃掉自己处理
      }
      return _originalPostMessage.call(this, message);
    };

    // 标记 prototype 已被 patch
    EditorInstance.prototype[_PATCH_MARKER] = true;
    _noteEditorListenerRegistered = true;
    Zotero.debug("[annotation-summary] 已注册 Note Editor 右键菜单 hook");
  } catch (e) {
    Zotero.debug("[annotation-summary] 注册 Note Editor hook 失败: " + e);
  }
}

function cleanupNoteEditorContextMenu() {
  if (!_noteEditorListenerRegistered) return;
  try {
    const EditorInstance = (Zotero as any).EditorInstance;
    if (EditorInstance && EditorInstance.prototype) {
      if (_originalOpenPopup) {
        EditorInstance.prototype._openPopup = _originalOpenPopup;
      }
      if (_originalPostMessage) {
        EditorInstance.prototype._postMessage = _originalPostMessage;
      }
      // 清除 patch 标记，允许重新注入
      delete EditorInstance.prototype[_PATCH_MARKER];
    }
    _noteEditorListenerRegistered = false;
  } catch (e) { }
}


async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  cleanupReaderCopyLink();
  cleanupNoteEditorContextMenu();
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  // Remove addon object
  addon.data.alive = false;
  // @ts-ignore - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  // 当前插件无需处理 Notify 事件，保留空实现供后续扩展
  ztoolkit.log("notify", event, type, ids, extraData);
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
  // 保留函数签名（hooks 接口要求），当前无快捷键功能
  ztoolkit.log("shortcut", type);
}

function onDialogEvents(type: string) {
  // 保留函数签名（hooks 接口要求），当前无对话框事件
  ztoolkit.log("dialogEvent", type);
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
