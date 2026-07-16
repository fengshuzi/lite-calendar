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
    private mode: "list" | "day" = "list";
    private currentDay = new Date();
    private calendarSelectRef: HTMLSelectElement | null = null;
    private dayViewContainer: HTMLElement | null = null;
    private dayGridRef: HTMLElement | null = null;
    private dayEvents: CalendarEvent[] = [];
    private daySelection: { start: Date; end: Date } | null = null;
    private dragStartY = 0;
    private isDragging = false;
    private dragStartSlot = 0;
    private dragEndSlot = 0;

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
        this.calendarSelectRef = calendarSelect;
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
                this.applyTimeSelection(start, end);
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

        this.applyTimeSelection = (start: Date, end: Date) => {
            startTime = start;
            endTime = end;
            updateTimeDisplay();
            this.timeBtn?.addClass("active");
            this.textarea?.focus();
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

    private applyTimeSelection(_start: Date, _end: Date): void {
        // assigned dynamically in renderInputArea
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

        const header = listContainer.createDiv("calendar-view-header");
        const titleEl = header.createDiv("calendar-view-title");
        titleEl.textContent = this.mode === "day" ? "日视图" : "日程列表";

        const toggleGroup = header.createDiv("calendar-view-toggle");
        const listBtn = toggleGroup.createEl("button", { cls: `calendar-toggle-btn ${this.mode === "list" ? "active" : ""}` });
        setIcon(listBtn, "list");
        listBtn.title = "列表视图";
        const dayBtn = toggleGroup.createEl("button", { cls: `calendar-toggle-btn ${this.mode === "day" ? "active" : ""}` });
        setIcon(dayBtn, "clock");
        dayBtn.title = "日视图";

        listBtn.onclick = () => {
            if (this.mode === "list") return;
            this.mode = "list";
            void this.loadAndRender();
        };
        dayBtn.onclick = () => {
            if (this.mode === "day") return;
            this.mode = "day";
            void this.loadAndRender();
        };

        if (this.mode === "day") {
            this.renderDayView(listContainer, events);
            return;
        }

        const days = this.plugin.storage.groupEventsByDay(events);

        if (days.length === 0) {
            const emptyState = listContainer.createDiv({ cls: "calendar-empty-state" });
            emptyState.createDiv({ text: "📅", cls: "calendar-empty-empty-icon" });
            emptyState.createDiv({ text: "未来3天没有日程", cls: "calendar-empty-title" });
            emptyState.createDiv({ text: "在上方输入框开始添加", cls: "calendar-empty-desc" });
            return;
        }

        for (const day of days) {
            this.renderDayGroup(listContainer, day);
        }
    }

    private renderDayView(
        container: HTMLElement,
        events: Record<string, CalendarEvent[]>,
    ): void {
        const dayDate = new Date(this.currentDay);
        dayDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(dayDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const allEvents: CalendarEvent[] = [];
        for (const [calName, evts] of Object.entries(events)) {
            for (const evt of evts) {
                const start = new Date(evt.start);
                const end = new Date(evt.end);
                if (start < nextDay && end > dayDate) {
                    allEvents.push({ ...evt, calendar: calName });
                }
            }
        }
        this.dayEvents = allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        const dayHeader = container.createDiv("calendar-dayview-header");
        const prevBtn = dayHeader.createEl("button", { cls: "calendar-dayview-nav" });
        setIcon(prevBtn, "chevron-left");
        prevBtn.onclick = () => {
            this.currentDay.setDate(this.currentDay.getDate() - 1);
            void this.loadAndRender();
        };

        const dateText = dayHeader.createDiv("calendar-dayview-date");
        dateText.textContent = this.formatDateLong(dayDate);

        const nextBtn = dayHeader.createEl("button", { cls: "calendar-dayview-nav" });
        setIcon(nextBtn, "chevron-right");
        nextBtn.onclick = () => {
            this.currentDay.setDate(this.currentDay.getDate() + 1);
            void this.loadAndRender();
        };

        const todayBtn = dayHeader.createEl("button", { cls: "calendar-dayview-today" });
        todayBtn.textContent = "今天";
        todayBtn.onclick = () => {
            this.currentDay = new Date();
            void this.loadAndRender();
        };

        const gridWrapper = container.createDiv("calendar-dayview-grid-wrapper");
        this.dayViewContainer = gridWrapper;
        const grid = gridWrapper.createDiv("calendar-dayview-grid");
        this.dayGridRef = grid;

        const slotsPerHour = 2;
        const slotMinutes = 60 / slotsPerHour;
        const totalSlots = 24 * slotsPerHour;

        const slotElements: HTMLElement[] = [];
        for (let i = 0; i < totalSlots; i++) {
            const hour = Math.floor(i / slotsPerHour);
            const minute = (i % slotsPerHour) * slotMinutes;
            const row = grid.createDiv("calendar-dayview-row");
            row.dataset.slot = String(i);
            row.dataset.hour = String(hour);
            row.dataset.minute = String(minute);

            const label = row.createDiv("calendar-dayview-hour-label");
            if (i % slotsPerHour === 0) {
                label.textContent = `${String(hour).padStart(2, "0")}:00`;
            }

            const track = row.createDiv("calendar-dayview-track");
            track.dataset.slot = String(i);
            slotElements.push(track);
        }

        this.renderDayEvents(grid, slotElements, slotsPerHour, slotMinutes, dayDate);
        this.attachDayGridInteractions(grid, slotElements, slotsPerHour, slotMinutes, dayDate);
    }

    private renderDayEvents(
        grid: HTMLElement,
        slotElements: HTMLElement[],
        slotsPerHour: number,
        slotMinutes: number,
        dayDate: Date,
    ): void {
        const dayStart = dayDate.getTime();
        for (const event of this.dayEvents) {
            const start = new Date(event.start);
            const end = new Date(event.end);
            const startSlot = Math.max(0, Math.floor((start.getTime() - dayStart) / (slotMinutes * 60 * 1000)));
            const endSlot = Math.min(slotElements.length, Math.ceil((end.getTime() - dayStart) / (slotMinutes * 60 * 1000)));
            if (startSlot >= slotElements.length || endSlot <= 0) continue;

            const eventEl = grid.createDiv("calendar-dayview-event");
            eventEl.textContent = event.title;
            eventEl.title = `${event.title} · ${this.formatTime(event.start)} - ${this.formatTime(event.end)}`;
            eventEl.style.top = `${(startSlot / slotsPerHour) * 60}px`;
            eventEl.style.height = `${((endSlot - startSlot) / slotsPerHour) * 60}px`;

            eventEl.onclick = (e) => {
                e.stopPropagation();
                this.startEditEvent?.(event);
            };
            eventEl.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showContextMenu(e, event);
            };
        }
    }

    private attachDayGridInteractions(
        grid: HTMLElement,
        slotElements: HTMLElement[],
        slotsPerHour: number,
        slotMinutes: number,
        dayDate: Date,
    ): void {
        const updateSelection = () => {
            const minSlot = Math.min(this.dragStartSlot, this.dragEndSlot);
            const maxSlot = Math.max(this.dragStartSlot, this.dragEndSlot);
            for (let i = 0; i < slotElements.length; i++) {
                const track = slotElements[i];
                if (i >= minSlot && i < maxSlot) {
                    track.addClass("is-selected");
                } else {
                    track.removeClass("is-selected");
                }
            }
        };

        const clearSelection = () => {
            for (const track of slotElements) {
                track.removeClass("is-selected");
            }
        };

        const slotFromY = (clientY: number): number => {
            const rect = grid.getBoundingClientRect();
            const y = clientY - rect.top + grid.scrollTop;
            const slotHeight = rect.height / slotElements.length;
            return Math.max(0, Math.min(slotElements.length - 1, Math.floor(y / slotHeight)));
        };

        const commitSelection = () => {
            const minSlot = Math.min(this.dragStartSlot, this.dragEndSlot);
            const maxSlot = Math.max(this.dragStartSlot, this.dragEndSlot);
            if (maxSlot <= minSlot) return;

            const start = new Date(dayDate);
            start.setHours(0, minSlot * slotMinutes, 0, 0);
            const end = new Date(dayDate);
            end.setHours(0, maxSlot * slotMinutes, 0, 0);
            if ((end.getTime() - start.getTime()) / (60 * 1000) < 30) {
                end.setMinutes(start.getMinutes() + 30);
            }

            this.daySelection = { start, end };
            this.applyTimeSelection(start, end);
            clearSelection();
        };

        grid.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.closest(".calendar-dayview-event")) return;

            this.isDragging = true;
            this.dragStartY = e.clientY;
            const slot = slotFromY(e.clientY);
            this.dragStartSlot = slot;
            this.dragEndSlot = slot + 1;
            grid.setPointerCapture(e.pointerId);
            updateSelection();
        });

        grid.addEventListener("pointermove", (e) => {
            if (!this.isDragging) return;
            this.dragEndSlot = slotFromY(e.clientY) + 1;
            updateSelection();
        });

        grid.addEventListener("pointerup", (e) => {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.dragEndSlot = slotFromY(e.clientY) + 1;
            grid.releasePointerCapture(e.pointerId);
            commitSelection();
        });

        grid.addEventListener("pointercancel", () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            clearSelection();
        });
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

    private formatDateLong(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        const weekDay = weekDays[date.getDay()];
        return `${year}年${month}月${day}日 ${weekDay}`;
    }
}
