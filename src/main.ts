import { App, Notice, Platform, Plugin, PluginSettingTab, Setting } from "obsidian";
import { CalendarStorage } from "./storage";
import { CalendarView, VIEW_TYPE_CALENDAR } from "./views/CalendarView";
import { DEFAULT_SETTINGS } from "./types";
import type { CalendarSettings } from "./types";
import { generateCalendarColor } from "./types";

export default class CalendarPlugin extends Plugin {
  storage: CalendarStorage;
  settings: CalendarSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

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

    this.addSettingTab(new CalendarSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Record<string, unknown> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    if (!this.settings.calendarColors) {
      this.settings.calendarColors = {};
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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

  async refreshViews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)) {
      if (leaf.view instanceof CalendarView) {
        await leaf.view.loadAndRender();
      }
    }
  }
}

class CalendarSettingTab extends PluginSettingTab {
  plugin: CalendarPlugin;

  constructor(app: App, plugin: CalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("显示凌晨时段")
      .setDesc("在日视图中显示 0:00 至 6:00 的时间轴")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showEarlyHours)
          .onChange(async (value) => {
            this.plugin.settings.showEarlyHours = value;
            await this.plugin.saveSettings();
            await this.plugin.refreshViews();
          }),
      );

    new Setting(containerEl).setName("日历颜色").setHeading();

    const colorsContainer = containerEl.createDiv();
    colorsContainer.createEl("p", { text: "加载日历中...", cls: "calendar-settings-hint" });

    void this.plugin.storage.getCalendars().then((calendars) => {
      colorsContainer.empty();
      if (calendars.length === 0) {
        colorsContainer.createEl("p", { text: "未找到日历" });
        return;
      }

      for (const calendar of calendars) {
        const color = this.plugin.settings.calendarColors[calendar] || generateCalendarColor(calendar);
        new Setting(colorsContainer)
          .setName(calendar)
          .setDesc("事件颜色")
          .addColorPicker((picker) =>
            picker
              .setValue(color)
              .onChange(async (value) => {
                this.plugin.settings.calendarColors[calendar] = value;
                await this.plugin.saveSettings();
                await this.plugin.refreshViews();
              }),
          );
      }
    });
  }
}
