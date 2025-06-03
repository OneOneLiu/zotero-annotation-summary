import { config } from "../package.json";
import { ColumnOptions, DialogHelper } from "zotero-plugin-toolkit";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import { onMainWindowLoad, extractAllAnnotations } from "./events";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    prefs?: {
      window: Window;
      columns: Array<ColumnOptions>;
      rows: Array<{ [dataKey: string]: string }>;
    };
    dialog?: DialogHelper;
  };

  public hooks: typeof hooks;
  public api: object;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    this.api = {};
  }

  // 插件启动时自动调用
  public async onload(): Promise<void> {
    Zotero.debug(`[${this.data.config.addonName}] 插件已加载，准备添加 Tools 菜单项`);

    setTimeout(() => {
      try {
        const win = Zotero.getMainWindow();
        onMainWindowLoad(win, extractAllAnnotations);
      } catch (err) {
        Zotero.debug("❌ 插件注册菜单失败：" + err);
      }
    }, 100);
  }

  // public async extractAllAnnotations(): Promise<void> {
  //   ...
  // }
}

export default Addon;
