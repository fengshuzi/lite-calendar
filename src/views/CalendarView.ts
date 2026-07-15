import {
  ItemView,
  WorkspaceLeaf,
  Menu,
  Modal,
  setIcon,
  Notice,
} from "obsidian";
import type CalendarPlugin from "../main";
import type { CalendarEvent } from "../types";
import { DateTimePickerModal } from "../components/DateTimePicker";

export const VIEW_TYPE_CALENDAR = "calendar-view";

export class CalendarView extends ItemView {
  plugin: CalendarPlugin;
  private listContainer: HTMLElement | null = null;
  private startEditEvent: ((event: CalendarEvent) => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_CALENDAR;
  }

  getDisplayText(): string {
    return "日历事项";
  }

  getIcon(): string {
    return "calendar-days";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    // 清理
  }

  render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("calendar-view");

    this.renderInputArea(container);
    this.renderEventsList(container);
  }

  private renderInputArea(container: HTMLElement): void {
    const inputArea = container.createDiv("calendar-input-area");
    const inputWrapper = inputArea.createDiv("calendar-input-wrapper");

    // 状态提示
    const statusHint = inputWrapper.createDiv("calendar-input-hint is-hidden");

    const textarea = inputWrapper.createEl("textarea", {
      cls: "calendar-input",
      attr: {
        placeholder: "添加日历事件...",
        rows: "2",
      },
    });

    const inputActions = inputWrapper.createDiv("calendar-input-actions");

    // 底部工具栏
    const toolbar = inputActions.createDiv("calendar-input-toolbar");

    // 日历选择
    const calendarSelect = toolbar.createEl("select", {
      cls: "calendar-select",
    });

    // 加载日历列表
    void this.plugin.storage.getCalendars().then((calendars) => {
      calendarSelect.empty();
      for (const cal of calendars) {
        calendarSelect.createEl("option", { text: cal, value: cal });
      }
    });

    // 存储选中的时间
    let startTime: Date | null = null;
    let endTime: Date | null = null;

    // 设置默认时间（当前时间+1小时）
    const setDefaultTimes = () => {
      const now = new Date();
      startTime = new Date(now);
      startTime.setHours(startTime.getHours() + 1, 0, 0, 0);
      endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + 1);
    };
    setDefaultTimes();

    // 时间显示区域
    const timeDisplay = inputWrapper.createDiv(
      "calendar-time-display is-hidden",
    );

    const updateTimeDisplay = () => {
      if (startTime && endTime) {
        timeDisplay.removeClass("is-hidden");

        timeDisplay.empty();
        const wrapper = timeDisplay.createDiv({
          cls: "calendar-time-display-inner",
        });
        wrapper.createSpan({
          text: `📅 ${this.formatDateTime(startTime)} - ${this.formatTime(endTime.toISOString())}`,
        });
        const clearBtn = wrapper.createEl("button", {
          cls: "calendar-time-clear",
          text: "清除",
        });
        clearBtn.addEventListener("click", () => {
          startTime = null;
          endTime = null;
          timeDisplay.addClass("is-hidden");
          timeBtn.removeClass("active");
        });
      } else {
        timeDisplay.addClass("is-hidden");
      }
    };

    // 时间按钮 - 点击打开日期选择器
    const timeBtn = toolbar.createEl("button", { cls: "calendar-toolbar-btn" });
    setIcon(timeBtn, "calendar-range");
    timeBtn.title = "选择日期时间";
    timeBtn.onclick = () => {
      this.showDateTimePicker(startTime || new Date(), (start, end) => {
        startTime = start;
        endTime = end;
        updateTimeDisplay();
        timeBtn.addClass("active");
      });
    };

    const actionButtons = inputActions.createDiv("calendar-action-buttons");

    const cancelBtn = actionButtons.createEl("button", {
      cls: "calendar-cancel-btn is-hidden",
      text: "取消编辑",
    });

    const submitBtn = actionButtons.createEl("button", {
      cls: "calendar-submit-btn",
      text: "添加",
    });

    // 存储当前编辑的事件 ID
    let editingEventId: string | null = null;

    cancelBtn.onclick = () => {
      textarea.value = "";
      startTime = null;
      endTime = null;
      timeDisplay.addClass("is-hidden");
      statusHint.addClass("is-hidden");
      cancelBtn.addClass("is-hidden");
      submitBtn.textContent = "添加";
      textarea.placeholder = "添加日历事件...";
      editingEventId = null;
      timeBtn.removeClass("active");
    };

    submitBtn.onclick = () => {
      void (async () => {
        const title = textarea.value.trim();
        if (!title) return;

        const calendar = calendarSelect.value;

        if (!startTime || !endTime) {
          new Notice("请设置时间");
          return;
        }

        const startISO = startTime.toISOString();
        const endISO = endTime.toISOString();

        if (editingEventId) {
          // 更新模式
          await this.plugin.storage.updateEvent(
            editingEventId,
            title,
            startISO,
            endISO,
          );
        } else {
          // 新建模式
          await this.plugin.storage.createEvent(
            calendar,
            title,
            startISO,
            endISO,
          );
        }

        textarea.value = "";
        startTime = null;
        endTime = null;
        timeDisplay.addClass("is-hidden");
        statusHint.addClass("is-hidden");
        cancelBtn.addClass("is-hidden");
        submitBtn.textContent = "添加";
        textarea.placeholder = "添加日历事件...";
        editingEventId = null;
        timeBtn.removeClass("active");

        await this.loadAndRender();
      })();
    };

    // 回车提交
    textarea.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitBtn.click();
      } else if (e.key === "Escape" && editingEventId) {
        e.preventDefault();
        cancelBtn.click();
      }
    };

    // 暴露编辑方法供外部调用
    this.startEditEvent = (event: CalendarEvent) => {
      editingEventId = event.id;
      textarea.value = event.title;

      startTime = new Date(event.start);
      endTime = new Date(event.end);
      updateTimeDisplay();
      timeBtn.addClass("active");

      statusHint.textContent = "Modifying...";
      statusHint.removeClass("is-hidden");
      cancelBtn.removeClass("is-hidden");
      submitBtn.textContent = "保存";
      textarea.placeholder = "编辑事件内容...";
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);

      // 滚动到顶部
      this.containerEl.scrollTop = 0;
    };
  }

  private showDateTimePicker(
    initialDate: Date,
    onSelect: (start: Date, end: Date) => void,
  ): void {
    const modal = new DateTimePickerModal({
      app: this.app,
      initialDate,
      onSelect: (start, end) => {
        onSelect(start, end);
      },
    });

    modal.open();
  }

  private renderEventsList(container: HTMLElement): void {
    this.listContainer = container.createDiv("calendar-list-container");
    this.listContainer.createDiv({ text: "加载中...", cls: "calendar-loading" });

    void this.plugin.storage.getEvents().then(({ events, calendars }) => {
      if (!this.listContainer) return;
      this.listContainer.empty();
      this.renderEventsContent(events, calendars, this.listContainer);
    });
  }

  private async loadAndRender(): Promise<void> {
    const { events, calendars } = await this.plugin.storage.getEvents();
    this.renderEventsContent(events, calendars);
  }

  private renderEventsContent(
    events: Record<string, CalendarEvent[]>,
    _calendars: string[],
    container?: HTMLElement,
  ): void {
    const listContainer = container || this.listContainer;
    if (!listContainer) return;

    listContainer.empty();

    const days = this.plugin.storage.groupEventsByDay(events);

    if (days.length === 0) {
      const emptyState = listContainer.createDiv({
        cls: "calendar-empty-state",
      });
      emptyState.createDiv({ text: "📅", cls: "calendar-empty-icon" });
      emptyState.createDiv({
        text: "未来3天没有日程",
        cls: "calendar-empty-title",
      });
      emptyState.createDiv({
        text: "在上方输入框开始添加",
        cls: "calendar-empty-desc",
      });
      return;
    }

    for (const day of days) {
      this.renderDayGroup(listContainer, day);
    }
  }

  private renderDayGroup(
    container: HTMLElement,
    day: {
      dateKey: string;
      label: string;
      events: CalendarEvent[];
    },
  ): void {
    const dayGroup = container.createDiv("calendar-day-group");

    // 日期标题
    const dayHeader = dayGroup.createDiv("calendar-day-header");
    const isToday = day.label === "今天";
    dayHeader.createSpan({
      text: day.label,
      cls: isToday ? "calendar-day-label-today" : "calendar-day-label",
    });
    dayHeader.createSpan({
      text: `(${day.events.length})`,
      cls: "calendar-day-count",
    });

    // 事件列表
    const eventsList = dayGroup.createDiv("calendar-events-list");
    for (const event of day.events) {
      this.renderEventItem(eventsList, event);
    }
  }

  private renderEventItem(container: HTMLElement, event: CalendarEvent): void {
    const item = container.createDiv("calendar-event-item");
    item.dataset.eventId = event.id;

    // 卡片
    const card = item.createDiv("calendar-event-card");

    // 卡片头部
    const cardHeader = card.createDiv("calendar-event-header");

    // 时间显示
    const timeEl = cardHeader.createDiv("calendar-event-time");
    if (event.allDay) {
      timeEl.textContent = "全天";
    } else {
      timeEl.textContent = this.formatTime(event.start);
    }

    // 日历名称
    const calendarBadge = cardHeader.createDiv("calendar-event-badge");
    calendarBadge.textContent = event.calendar;

    const cardActions = cardHeader.createDiv("calendar-event-actions");

    const moreBtn = cardActions.createEl("button", {
      cls: "calendar-more-btn",
    });
    setIcon(moreBtn, "more-horizontal");
    moreBtn.title = "更多操作";
    moreBtn.onclick = (e) => {
      e.stopPropagation();
      this.showContextMenu(e, event);
    };

    // 卡片内容
    const cardBody = card.createDiv("calendar-event-body");
    cardBody.createDiv({ text: event.title, cls: "calendar-event-title" });

    if (event.notes) {
      const notesEl = cardBody.createDiv({ cls: "calendar-event-meta" });
      notesEl.createSpan({ text: `📝 ${event.notes}` });
    }

    // 双击进入编辑模式
    cardBody.ondblclick = () => {
      if (this.startEditEvent) {
        this.startEditEvent(event);
      }
    };

    card.oncontextmenu = (e) => {
      e.preventDefault();
      this.showContextMenu(e, event);
    };
  }

  private showContextMenu(e: MouseEvent, event: CalendarEvent): void {
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle("编辑")
        .setIcon("pencil")
        .onClick(() => {
          if (this.startEditEvent) {
            this.startEditEvent(event);
          }
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("删除")
        .setIcon("trash")
        .onClick(() => {
          void this.confirmAndDelete(event);
        });
    });

    menu.showAtMouseEvent(e);
  }

  private async confirmAndDelete(event: CalendarEvent): Promise<void> {
    const confirmed = await new Promise<boolean>((resolve) => {
      const modal = new Modal(this.app);
      modal.titleEl.setText("确认删除");
      modal.contentEl.createEl("p", {
        text: `确定删除事件"${event.title}"吗？`,
      });
      const btnGroup = modal.contentEl.createDiv();
      btnGroup.createEl("button", { text: "取消" }).onclick = () => {
        modal.close();
        resolve(false);
      };
      const confirmBtn = btnGroup.createEl("button", {
        text: "删除",
        cls: "mod-warning",
      });
      confirmBtn.onclick = () => {
        modal.close();
        resolve(true);
      };
      modal.open();
    });

    if (confirmed) {
      await this.plugin.storage.deleteEvent(event.id);
      await this.loadAndRender();
    }
  }

  private formatTime(isoStr: string): string {
    const date = new Date(isoStr);
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${hour}:${minute}`;
  }

  private formatDateTime(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${month}-${day} ${hour}:${minute}`;
  }
}
