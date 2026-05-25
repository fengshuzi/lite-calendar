import { Notice, Platform, Plugin } from "obsidian";
import { CalendarStorage } from "./storage";
import { CalendarView, VIEW_TYPE_CALENDAR } from "./views/CalendarView";

export default class CalendarPlugin extends Plugin {
  storage: CalendarStorage;

  onload(): void {
    if (!Platform.isMacOS) {
      new Notice("日历事项插件仅支持 macOS 系统");
      return;
    }

    this.storage = new CalendarStorage();

    this.registerView(
      VIEW_TYPE_CALENDAR,
      (leaf) => new CalendarView(leaf, this),
    );

    // 添加右侧边栏图标
    this.addRibbonIcon("calendar-days", "日历事项", () => {
      void this.activateView();
    });

    // 添加命令
    this.addCommand({
      id: "open-calendar",
      name: "打开日历事项",
      callback: () => {
        void this.activateView();
      },
    });

    this.addCommand({
      id: "add-event",
      name: "快速添加事件",
      callback: () => {
        void this.activateView();
      },
    });
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;

    // 先关闭所有已存在的日历视图
    workspace.detachLeavesOfType(VIEW_TYPE_CALENDAR);

    // 获取主编辑区域的 leaf
    const leaf = workspace.getLeaf("tab");

    await leaf.setViewState({
      type: VIEW_TYPE_CALENDAR,
      active: true,
    });

    // 激活这个 leaf
    workspace.setActiveLeaf(leaf, { focus: true });
  }
}
