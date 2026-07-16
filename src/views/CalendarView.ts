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
    private textarea: HTMLTextAreaElement | null = null;
    private submitBtn: HTMLButtonElement | null = null;
    private cancelBtn: HTMLButtonElement | null = null;
    private timeBtn: HTMLButtonElement | null = null;
    private timeDisplay: HTMLElement | null = null;
    private statusHint: HTMLElement | null = null;

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
        // cleanup placeholder
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

        this.statusHint = inputWrapper.createDiv("calendar-input-hint is-hidden");

        this.textarea = inputWrapper.createEl("textarea", {
            cls: "calendar-input",
            attr: {
                placeholder: "添加日历事件...",
                rows: "2",
            },
        });

        this.timeDisplay = inputWrapper.createDiv("calendar-time-display is-hidden");

        const inputActions = inputWrapper.createDiv("calendar-input-actions");
        const toolbar = inputActions.createDiv("calendar-input-toolbar");

        const calendarSelect = toolbar.createEl("select", { cls: "calendar-select" });
        void this.plugin.storage.getCalendars().then((calendars) => {
            calendarSelect.empty();
            for (const cal of calendars) {
                calendarSelect.createEl("option", { text: cal, value: cal });
            }
        });

        let startTime: Date | null = null;
        let endTime: Date | null = null;

        const setDefaultTimes = () => {
            const now = new Date();
            startTime = new Date(now);
            startTime.setHours(startTime.getHours() + 1, 0, 0, 0);
            endTime = new Date(startTime);
            endTime.setHours(endTime.getHours() + 1);
        };
        setDefaultTimes();

        const updateTimeDisplay = () => {
            if (!this.timeDisplay) return;
            if (startTime && endTime) {
                this.timeDisplay.removeClass("is-hidden");
                this.timeDisplay.empty();
                const inner = this.timeDisplay.createDiv({ cls: "calendar-time-display-inner" });
                const chip = inner.createDiv({ cls: "calendar-time-chip" });
                setIcon(chip.createSpan(), "calendar-clock");
                chip.createSpan({
                    text: `${this.formatDateTime(startTime)} - ${this.formatTime(endTime.toISOString())}`,
                    cls: "calendar-time-text",
                });
                const clearBtn = inner.createEl("button", { cls: "calendar-time-clear", text: "清除" });
                clearBtn.addEventListener("click", () => {
                    startTime = null;
                    endTime = null;
                    this.timeDisplay?.addClass("is-hidden");
                    this.timeBtn?.removeClass("active");
                    this.textarea?.focus();
                });
            } else {
                this.timeDisplay.addClass("is-hidden");
            }
        };

        this.timeBtn = toolbar.createEl("button", { cls: "calendar-toolbar-btn" });
        setIcon(this.timeBtn, "calendar-range");
        this.timeBtn.title = "选择日期时间";
        this.timeBtn.onclick = () => {
            this.showDateTimePicker(startTime || new Date(), (start, end) => {
                startTime = start;
                endTime = end;
                updateTimeDisplay();
                this.timeBtn?.addClass("active");
                this.textarea?.focus();
            });
        };

        const actionButtons = inputActions.createDiv("calendar-action-buttons");

        this.cancelBtn = actionButtons.createEl("button", {
            cls: "calendar-cancel-btn is-hidden",
            text: "取消",
        });

        this.submitBtn = actionButtons.createEl("button", {
            cls: "calendar-submit-btn",
            text: "添加事件",
        });

        let editingEventId: string | null = null;

        this.cancelBtn.onclick = () => {
            this.resetComposer();
            setDefaultTimes();
            editingEventId = null;
            this.textarea?.focus();
        };

        this.submitBtn.onclick = () => {
            void (async () => {
                const title = this.textarea?.value.trim();
                if (!title) return;

                const calendar = calendarSelect.value;

                if (!startTime || !endTime) {
                    new Notice("请设置时间");
                    return;
                }

                const startISO = startTime.toISOString();
                const endISO = endTime.toISOString();

                if (editingEventId) {
                    await this.plugin.storage.updateEvent(editingEventId, title, startISO, endISO);
                } else {
                    await this.plugin.storage.createEvent(calendar, title, startISO, endISO);
                }

                this.resetComposer();
                setDefaultTimes();
                editingEventId = null;
                await this.loadAndRender();
            })();
        };

        this.textarea.onkeydown = (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void this.submitBtn?.click();
            } else if (e.key === "Escape" && editingEventId) {
                e.preventDefault();
                this.cancelBtn?.click();
            } else if (e.key === "Escape") {
                e.preventDefault();
                this.textarea?.blur();
            }
        };

        this.textarea.oninput = () => {
            this.autoResizeTextarea();
        };

        this.startEditEvent = (event: CalendarEvent) => {
            editingEventId = event.id;
            if (this.textarea) this.textarea.value = event.title;
            startTime = new Date(event.start);
            endTime = new Date(event.end);
            updateTimeDisplay();
            this.timeBtn?.addClass("active");

            if (this.statusHint) {
                this.statusHint.textContent = "正在编辑事件";
                this.statusHint.removeClass("is-hidden");
            }
            this.cancelBtn?.removeClass("is-hidden");
            if (this.submitBtn) this.submitBtn.textContent = "保存";
            if (this.textarea) {
                this.textarea.placeholder = "编辑事件内容...";
                this.textarea.focus();
                this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
            }
            this.autoResizeTextarea();
            this.containerEl.scrollTop = 0;
        };

        this.autoResizeTextarea();
    }

    private autoResizeTextarea(): void {
        if (!this.textarea) return;
        this.textarea.style.height = "auto";
        const maxHeight = 160;
        this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, maxHeight)}px`;
    }

    private resetComposer(): void {
        if (this.textarea) {
            this.textarea.value = "";
            this.textarea.style.height = "auto";
            this.textarea.placeholder = "添加日历事件...";
        }
        this.timeDisplay?.empty();
        this.timeDisplay?.addClass("is-hidden");
        this.statusHint?.addClass("is-hidden");
        this.cancelBtn?.addClass("is-hidden");
        this.timeBtn?.removeClass("active");
        if (this.submitBtn) this.submitBtn.textContent = "添加事件";
    }

    private showDateTimePicker(
        initialDate: Date,
        onSelect: (start: Date, end: Date) => void,
    ): void {
        const modal = new DateTimePickerModal({
            app: this.app,
            initialDate,
            onSelect,
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
            const emptyState = listContainer.createDiv({ cls: "calendar-empty-state" });
            emptyState.createDiv({ text: "📅", cls: "calendar-empty-icon" });
            emptyState.createDiv({ text: "未来3天没有日程", cls: "calendar-empty-title" });
            emptyState.createDiv({ text: "在上方输入框开始添加", cls: "calendar-empty-desc" });
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
        const dayHeader = dayGroup.createDiv("calendar-day-header");
        const isToday = day.label === "今天";
        dayHeader.createSpan({
            text: day.label,
            cls: isToday ? "calendar-day-label-today" : "calendar-day-label",
        });
        dayHeader.createSpan({
            text: `${day.events.length}`,
            cls: "calendar-day-count",
        });

        const eventsList = dayGroup.createDiv("calendar-events-list");
        for (const event of day.events) {
            this.renderEventItem(eventsList, event);
        }
    }

    private renderEventItem(container: HTMLElement, event: CalendarEvent): void {
        const item = container.createDiv("calendar-event-item");
        item.dataset.eventId = event.id;

        const card = item.createDiv("calendar-event-card");

        const cardHeader = card.createDiv("calendar-event-header");

        const timeEl = cardHeader.createDiv("calendar-event-time");
        if (event.allDay) {
            timeEl.textContent = "全天";
        } else {
            timeEl.textContent = `${this.formatTime(event.start)} - ${this.formatTime(event.end)}`;
        }

        const calendarBadge = cardHeader.createDiv("calendar-event-badge");
        calendarBadge.textContent = event.calendar;

        const cardActions = cardHeader.createDiv("calendar-event-actions");

        const editBtn = cardActions.createEl("button", { cls: "calendar-action-btn" });
        setIcon(editBtn, "pencil");
        editBtn.title = "编辑";
        editBtn.onclick = (e) => {
            e.stopPropagation();
            this.startEditEvent?.(event);
        };

        const moreBtn = cardActions.createEl("button", { cls: "calendar-action-btn" });
        setIcon(moreBtn, "more-horizontal");
        moreBtn.title = "更多操作";
        moreBtn.onclick = (e) => {
            e.stopPropagation();
            this.showContextMenu(e, event);
        };

        const cardBody = card.createDiv("calendar-event-body");
        cardBody.createDiv({ text: event.title, cls: "calendar-event-title" });

        if (event.location || event.notes) {
            const metaEl = cardBody.createDiv({ cls: "calendar-event-meta" });
            if (event.location) {
                const loc = metaEl.createDiv({ cls: "calendar-meta-row" });
                setIcon(loc.createSpan(), "map-pin");
                loc.createSpan({ text: event.location });
            }
            if (event.notes) {
                const notes = metaEl.createDiv({ cls: "calendar-meta-row" });
                setIcon(notes.createSpan(), "file-text");
                notes.createSpan({ text: event.notes });
            }
        }

        cardBody.onclick = () => {
            this.startEditEvent?.(event);
        };

        card.oncontextmenu = (e) => {
            e.preventDefault();
            this.showContextMenu(e, event);
        };
    }

    private showContextMenu(e: MouseEvent, event: CalendarEvent): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle("编辑").setIcon("pencil").onClick(() => {
                this.startEditEvent?.(event);
            });
        });

        menu.addItem((item) => {
            item.setTitle("删除").setIcon("trash").onClick(() => {
                void this.confirmAndDelete(event);
            });
        });

        menu.showAtMouseEvent(e);
    }

    private async confirmAndDelete(event: CalendarEvent): Promise<void> {
        const confirmed = await new Promise<boolean>((resolve) => {
            const modal = new Modal(this.app);
            modal.titleEl.setText("确认删除");
            modal.contentEl.createEl("p", { text: `确定删除事件"${event.title}"吗？` });
            const btnGroup = modal.contentEl.createDiv({ cls: "calendar-modal-actions" });
            btnGroup.createEl("button", { text: "取消", cls: "calendar-modal-btn" }).onclick = () => {
                modal.close();
                resolve(false);
            };
            const confirmBtn = btnGroup.createEl("button", { text: "删除", cls: "calendar-modal-btn mod-warning" });
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
