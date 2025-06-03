import { BasicTool } from "zotero-plugin-toolkit";
import Addon from "./addon";
import { config } from "../package.json";

const basicTool = new BasicTool();

// @ts-ignore - Plugin instance is not typed
if (!basicTool.getGlobal("Zotero")[config.addonInstance]) {
  _globalThis.addon = new Addon();

  // ✅ 添加一行调试信息
  Zotero.debug(`[${config.addonName}] 插件已加载，实例名: ${config.addonInstance}`);

  defineGlobal("ztoolkit", () => {
    return _globalThis.addon.data.ztoolkit;
  });

  // ✅ 注册到 Zotero 对象
  // @ts-ignore - Plugin instance is not typed
  Zotero[config.addonInstance] = _globalThis.addon;

  // ✅ ✨关键：调用插件入口函数！
  if (_globalThis.addon.onload) {
    _globalThis.addon.onload();
  }
}

function defineGlobal(name: Parameters<BasicTool["getGlobal"]>[0]): void;
function defineGlobal(name: string, getter: () => any): void;
function defineGlobal(name: string, getter?: () => any) {
  Object.defineProperty(_globalThis, name, {
    get() {
      return getter ? getter() : basicTool.getGlobal(name);
    }, 
  });
}
