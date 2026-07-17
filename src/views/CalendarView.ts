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
import { generateCalendarColor } from "../types";
import { DateTimePickerModal } from "../components/DateTimePicker";

export const VIEW_TYPE_CALENDAR = "calendar-view";

type InspectorMode = "create" | "edit";

export class CalendarView extends ItemView {
    plugin: CalendarPlugin;
    private shellEl: HTMLElement | null = null;
    private calendarContainer: HTMLElement | null = null;
    private inspectorEl: HTMLElement | null = null;
    private inspectorModeEl: HTMLElement | null = null;
    private titleInput: HTMLInputElement | null = null;
    private locationInput: HTMLInputElement | null = null;
    private notesInput: HTMLTextAreaElement | null = null;
    private calendarSelectRef: HTMLSelectElement | null = null;
    private timeButton: HTMLButtonElement | null = null;
    private timeTextEl: HTMLElement | null = null;
    private deleteBtn: HTMLButtonElement | null = null;
    private saveBtn: HTMLButtonElement | null = null;
    private currentDay = new Date();
    private dayEvents: CalendarEvent[] = [];
    private selectedEventId: string | null = null;
    private draftStart: Date | null = null;
    private draftEnd: Date | null = null;
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
        // no-op
    }

    render(): void {
        const container = this.contentEl;
        container.empty();
        container.addClass("calendar-view");

        this.shellEl = container.createDiv("calendar-shell");
        const stage = this.shellEl.createDiv("calendar-stage");
        this.renderCalendar(stage);
        this.renderInspector(this.shellEl);
    }

    private getCalendarColor(calendar: string): string {
        return this.plugin.settings.calendarColors[calendar] || generateCalendarColor(calendar);
    }

    private getContrastColor(hex: string): string {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? "#000000" : "#ffffff";
    }

    private renderInspector(container: HTMLElement): void {
        const inspector = container.createEl("aside", { cls: "calendar-inspector is-hidden" });
        this.inspectorEl = inspector;

        const miniHeader = inspector.createDiv("calendar-mini-header");
        const miniTitle = miniHeader.createDiv({ cls: "calendar-mini-title", text: this.formatMonthTitle(this.currentDay) });
        const miniActions = miniHeader.createDiv("calendar-mini-actions");
        const prevMonthBtn = miniActions.createEl("button", { cls: "calendar-mini-nav", attr: { "aria-label": "上个月" } });
        setIcon(prevMonthBtn, "chevron-left");
        const todayBtn = miniActions.createEl("button", { cls: "calendar-mini-today", text: "今天" });
        const nextMonthBtn = miniActions.createEl("button", { cls: "calendar-mini-nav", attr: { "aria-label": "下个月" } });
        setIcon(nextMonthBtn, "chevron-right");

        const miniGrid = inspector.createDiv("calendar-mini-month");
        const renderMiniMonth = () => {
            miniTitle.setText(this.formatMonthTitle(this.currentDay));
            this.renderMiniMonth(miniGrid);
        };
        prevMonthBtn.onclick = () => {
            this.currentDay.setMonth(this.currentDay.getMonth() - 1);
            renderMiniMonth();
            void this.loadAndRender();
        };
        todayBtn.onclick = () => {
            this.currentDay = new Date();
            renderMiniMonth();
            void this.loadAndRender();
        };
        nextMonthBtn.onclick = () => {
            this.currentDay.setMonth(this.currentDay.getMonth() + 1);
            renderMiniMonth();
            void this.loadAndRender();
        };
        renderMiniMonth();

        const card = inspector.createDiv("calendar-editor-card");
        const cardTop = card.createDiv("calendar-editor-top");
        this.inspectorModeEl = cardTop.createDiv({ cls: "calendar-editor-mode", text: "新建日程" });
        const closeBtn = cardTop.createEl("button", { cls: "calendar-editor-close", attr: { "aria-label": "关闭" } });
        setIcon(closeBtn, "x");
        closeBtn.onclick = () => this.closeInspector();

        this.titleInput = card.createEl("input", {
            cls: "calendar-editor-title",
            attr: { placeholder: "添加标题", type: "text" },
        });
        this.titleInput.onkeydown = (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                void this.saveInspector();
            } else if (event.key === "Escape") {
                event.preventDefault();
                this.closeInspector();
            }
        };

        const calendarRow = card.createDiv("calendar-editor-row calendar-editor-calendar-row");
        const colorDot = calendarRow.createSpan("calendar-editor-color-dot");
        calendarRow.createSpan({ cls: "calendar-editor-row-label", text: "日历" });
        this.calendarSelectRef = calendarRow.createEl("select", { cls: "calendar-editor-select" });
        this.calendarSelectRef.onchange = () => {
            const color = this.getCalendarColor(this.calendarSelectRef?.value || "");
            colorDot.style.background = color;
        };
        void this.plugin.storage.getCalendars().then((calendars) => {
            if (!this.calendarSelectRef) return;
            this.calendarSelectRef.empty();
            for (const calendar of calendars) {
                this.calendarSelectRef.createEl("option", { text: calendar, value: calendar });
            }
            const color = this.getCalendarColor(this.calendarSelectRef.value || calendars[0] || "");
            colorDot.style.background = color;
        });
        this.timeButton = card.createEl("button", { cls: "calendar-editor-time" });
        setIcon(this.timeButton.createSpan("calendar-editor-time-icon"), "calendar-clock");
        this.timeTextEl = this.timeButton.createSpan("calendar-editor-time-text");
        this.timeButton.onclick = () => {
            this.showDateTimePicker(this.draftStart || new Date(), (start, end) => {
                this.draftStart = start;
                this.draftEnd = end;
                this.updateInspectorTime();
            });
        };

        this.locationInput = card.createEl("input", {
            cls: "calendar-editor-field",
            attr: { placeholder: "添加位置或视频通话", type: "text" },
        });
        this.notesInput = card.createEl("textarea", {
            cls: "calendar-editor-notes",
            attr: { placeholder: "添加备注、URL 或附件", rows: "3" },
        });

        const footer = card.createDiv("calendar-editor-footer");
        this.deleteBtn = footer.createEl("button", { cls: "calendar-editor-delete", text: "删除" });
        this.deleteBtn.onclick = () => {
            const event = this.getSelectedEvent();
            if (event) void this.confirmAndDelete(event);
        };
        const cancelBtn = footer.createEl("button", { cls: "calendar-editor-cancel", text: "取消" });
        cancelBtn.onclick = () => this.closeInspector();
        this.saveBtn = footer.createEl("button", { cls: "calendar-editor-save", text: "添加" });
        this.saveBtn.onclick = () => {
            void this.saveInspector();
        };
    }

    private renderMiniMonth(container: HTMLElement): void {
        container.empty();
        const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
        for (const day of weekdays) {
            container.createDiv({ cls: "calendar-mini-weekday", text: day });
        }

        const monthStart = new Date(this.currentDay.getFullYear(), this.currentDay.getMonth(), 1);
        const gridStart = new Date(monthStart);
        gridStart.setDate(monthStart.getDate() - monthStart.getDay());
        const selectedKey = this.getDateKey(this.currentDay);
        const todayKey = this.getDateKey(new Date());

        for (let i = 0; i < 42; i++) {
            const date = new Date(gridStart);
            date.setDate(gridStart.getDate() + i);
            const dateKey = this.getDateKey(date);
            const classes = ["calendar-mini-day"];
            if (date.getMonth() !== this.currentDay.getMonth()) classes.push("is-outside");
            if (dateKey === selectedKey) classes.push("is-selected");
            if (dateKey === todayKey) classes.push("is-today");
            const button = container.createEl("button", { cls: classes.join(" "), text: String(date.getDate()) });
            button.onclick = () => {
                this.currentDay = new Date(date);
                this.closeInspector();
                this.renderMiniMonth(container);
                void this.loadAndRender();
            };
        }
    }

    private openInspector(mode: InspectorMode, event?: CalendarEvent): void {
        if (event) {
            this.selectedEventId = event.id;
            this.draftStart = new Date(event.start);
            this.draftEnd = new Date(event.end);
            if (this.titleInput) this.titleInput.value = event.title;
            if (this.locationInput) this.locationInput.value = event.location || "";
            if (this.notesInput) this.notesInput.value = event.notes || "";
            if (this.calendarSelectRef) this.calendarSelectRef.value = event.calendar;
        } else {
            this.selectedEventId = null;
            if (this.titleInput) this.titleInput.value = "";
            if (this.locationInput) this.locationInput.value = "";
            if (this.notesInput) this.notesInput.value = "";
        }

        if (this.inspectorModeEl) this.inspectorModeEl.setText(mode === "edit" ? "编辑日程" : "新建日程");
        if (this.saveBtn) this.saveBtn.setText(mode === "edit" ? "保存" : "添加");
        this.deleteBtn?.toggleClass("is-hidden", mode !== "edit");
        this.shellEl?.addClass("has-inspector");
        this.inspectorEl?.removeClass("is-hidden");
        this.updateInspectorTime();
        this.highlightSelectedEvent();
        this.titleInput?.focus();
        this.titleInput?.select();
    }

    private closeInspector(): void {
        this.selectedEventId = null;
        this.draftStart = null;
        this.draftEnd = null;
        this.shellEl?.removeClass("has-inspector");
        this.inspectorEl?.addClass("is-hidden");
        this.highlightSelectedEvent();
    }

    private updateInspectorTime(): void {
        if (!this.timeTextEl || !this.draftStart || !this.draftEnd) return;
        this.timeTextEl.setText(`${this.formatDateLong(this.draftStart)}  ${this.formatTime(this.draftStart.toISOString())} – ${this.formatTime(this.draftEnd.toISOString())}`);
    }

    private getSelectedEvent(): CalendarEvent | null {
        if (!this.selectedEventId) return null;
        return this.dayEvents.find((event) => event.id === this.selectedEventId) || null;
    }

    private highlightSelectedEvent(): void {
        this.calendarContainer?.querySelectorAll(".calendar-dayview-event.is-selected").forEach((element) => {
            element.removeClass("is-selected");
        });
        if (!this.selectedEventId) return;
        this.calendarContainer?.querySelector(`[data-event-id="${CSS.escape(this.selectedEventId)}"]`)?.addClass("is-selected");
    }

    private async saveInspector(): Promise<void> {
        const title = this.titleInput?.value.trim();
        if (!title) {
            new Notice("请输入日程标题");
            return;
        }
        if (!this.draftStart || !this.draftEnd) {
            new Notice("请设置时间");
            return;
        }

        const calendar = this.calendarSelectRef?.value || "";
        const location = this.locationInput?.value.trim() || "";
        const notes = this.notesInput?.value.trim() || "";
        const startISO = this.draftStart.toISOString();
        const endISO = this.draftEnd.toISOString();

        if (this.selectedEventId) {
            await this.plugin.storage.updateEvent(this.selectedEventId, calendar, title, startISO, endISO, location, notes);
        } else {
            await this.plugin.storage.createEvent(calendar, title, startISO, endISO, location, notes);
        }

        this.closeInspector();
        await this.loadAndRender();
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

    private renderCalendar(container: HTMLElement): void {
        this.calendarContainer = container.createDiv("calendar-main-container");
        this.calendarContainer.createDiv({ text: "加载中...", cls: "calendar-loading" });

        void this.plugin.storage.getEvents().then(({ events }) => {
            if (!this.calendarContainer) return;
            this.calendarContainer.empty();
            this.renderCalendarContent(events, this.calendarContainer);
        });
    }

    private async loadAndRender(): Promise<void> {
        const { events } = await this.plugin.storage.getEvents();
        this.renderCalendarContent(events);
    }

    private renderCalendarContent(
        events: Record<string, CalendarEvent[]>,
        container?: HTMLElement,
    ): void {
        const calendarContainer = container || this.calendarContainer;
        if (!calendarContainer) return;

        calendarContainer.empty();
        this.renderDayView(calendarContainer, events);
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

        const topbar = container.createDiv("calendar-topbar");
        const addBtn = topbar.createEl("button", { cls: "calendar-topbar-add", attr: { "aria-label": "新建日程" } });
        setIcon(addBtn, "plus");
        addBtn.onclick = () => {
            const start = new Date(dayDate);
            start.setHours(new Date().getHours() + 1, 0, 0, 0);
            const end = new Date(start);
            end.setHours(end.getHours() + 1);
            this.draftStart = start;
            this.draftEnd = end;
            this.openInspector("create");
        };

        const titleBlock = topbar.createDiv("calendar-topbar-title");
        titleBlock.createDiv({ cls: "calendar-topbar-date", text: this.formatLargeDate(dayDate) });
        titleBlock.createDiv({ cls: "calendar-topbar-subtitle", text: this.formatWeekSubtitle(dayDate) });

        const nav = topbar.createDiv("calendar-topbar-nav");
        const prevBtn = nav.createEl("button", { cls: "calendar-dayview-nav", attr: { "aria-label": "前一天" } });
        setIcon(prevBtn, "chevron-left");
        prevBtn.onclick = () => {
            this.currentDay.setDate(this.currentDay.getDate() - 1);
            this.closeInspector();
            void this.loadAndRender();
        };
        const todayBtn = nav.createEl("button", { cls: "calendar-dayview-today", text: "今天" });
        todayBtn.onclick = () => {
            this.currentDay = new Date();
            this.closeInspector();
            void this.loadAndRender();
        };
        const nextBtn = nav.createEl("button", { cls: "calendar-dayview-nav", attr: { "aria-label": "后一天" } });
        setIcon(nextBtn, "chevron-right");
        nextBtn.onclick = () => {
            this.currentDay.setDate(this.currentDay.getDate() + 1);
            this.closeInspector();
            void this.loadAndRender();
        };

        const gridWrapper = container.createDiv("calendar-dayview-grid-wrapper");
        const grid = gridWrapper.createDiv("calendar-dayview-grid");

        const slotsPerHour = 2;
        const slotMinutes = 60 / slotsPerHour;
        const slotHeightPx = 48;
        const totalSlots = 24 * slotsPerHour;
        const showEarlyHours = this.plugin.settings.showEarlyHours;
        const startSlotOffset = showEarlyHours ? 0 : 6 * slotsPerHour;
        grid.style.setProperty(
            "--calendar-dayview-grid-height",
            `${(totalSlots - startSlotOffset) * slotHeightPx}px`,
        );

        const slotElements: HTMLElement[] = [];
        for (let i = startSlotOffset; i < totalSlots; i++) {
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

        this.renderCurrentTimeIndicator(grid, slotHeightPx, slotMinutes, dayDate, startSlotOffset, slotElements.length);
        this.renderDayEvents(grid, slotElements, slotMinutes, slotHeightPx, dayDate, startSlotOffset, totalSlots);
        this.attachDayGridInteractions(grid, slotElements, slotMinutes, dayDate, startSlotOffset);
    }

    private renderCurrentTimeIndicator(
        grid: HTMLElement,
        slotHeightPx: number,
        slotMinutes: number,
        dayDate: Date,
        startSlotOffset: number,
        visibleSlots: number,
    ): void {
        const now = new Date();
        if (this.getDateKey(now) !== this.getDateKey(dayDate)) return;
        const minutes = now.getHours() * 60 + now.getMinutes();
        const slot = minutes / slotMinutes - startSlotOffset;
        if (slot < 0 || slot > visibleSlots) return;

        const line = grid.createDiv("calendar-now-line");
        line.style.top = `${slot * slotHeightPx}px`;
        line.createSpan({ cls: "calendar-now-label", text: this.formatTime(now.toISOString()) });
    }

    private renderDayEvents(
        grid: HTMLElement,
        slotElements: HTMLElement[],
        slotMinutes: number,
        slotHeightPx: number,
        dayDate: Date,
        startSlotOffset: number,
        totalSlots: number,
    ): void {
        const dayStart = dayDate.getTime();

        type EventLayout = {
            event: CalendarEvent;
            startSlot: number;
            endSlot: number;
            cluster: number;
            column: number;
        };

        const layouts: EventLayout[] = [];
        for (const event of this.dayEvents) {
            const start = new Date(event.start);
            const end = new Date(event.end);
            const actualStartSlot = Math.max(0, Math.floor((start.getTime() - dayStart) / (slotMinutes * 60 * 1000)));
            const actualEndSlot = Math.min(totalSlots, Math.ceil((end.getTime() - dayStart) / (slotMinutes * 60 * 1000)));
            if (actualEndSlot <= startSlotOffset) continue;

            const startSlot = Math.max(0, actualStartSlot - startSlotOffset);
            const endSlot = Math.min(slotElements.length, actualEndSlot - startSlotOffset);
            if (startSlot >= slotElements.length || endSlot <= 0) continue;

            layouts.push({ event, startSlot, endSlot, cluster: 0, column: 0 });
        }

        layouts.sort((a, b) => a.startSlot - b.startSlot || a.endSlot - b.endSlot);

        const clusters: { columns: number; layouts: EventLayout[] }[] = [];
        let active: EventLayout[] = [];

        for (const layout of layouts) {
            active = active.filter((a) => a.endSlot > layout.startSlot);
            if (active.length === 0) {
                clusters.push({ columns: 0, layouts: [] });
            }
            const cluster = clusters[clusters.length - 1];
            cluster.layouts.push(layout);
            layout.cluster = clusters.length - 1;
            active.push(layout);
            cluster.columns = Math.max(cluster.columns, active.length);
        }

        for (const cluster of clusters) {
            const assigned: EventLayout[] = [];
            for (const layout of cluster.layouts) {
                const usedColumns = new Set<number>();
                for (const other of assigned) {
                    if (other.endSlot > layout.startSlot && other.startSlot < layout.endSlot) {
                        usedColumns.add(other.column);
                    }
                }
                let col = 0;
                while (usedColumns.has(col)) col++;
                layout.column = col;
                assigned.push(layout);
            }
        }

        const labelWidth = 58;
        const rightGap = 0;
        const totalFixed = labelWidth + rightGap;
        const gap = 6;

        for (const layout of layouts) {
            const cluster = clusters[layout.cluster];
            const columns = cluster.columns || 1;
            const unit = `((100% - ${totalFixed}px) / ${columns})`;
            const left = `calc(${labelWidth}px + ${layout.column} * ${unit} + ${gap / 2}px)`;
            const width = `calc(${unit} - ${gap}px)`;

            const eventEl = grid.createDiv("calendar-dayview-event");
            const eventColor = this.getCalendarColor(layout.event.calendar);
            eventEl.dataset.eventId = layout.event.id;
            if (layout.event.id === this.selectedEventId) eventEl.addClass("is-selected");
            eventEl.style.top = `${layout.startSlot * slotHeightPx}px`;
            eventEl.style.height = `${(layout.endSlot - layout.startSlot) * slotHeightPx}px`;
            eventEl.style.left = left;
            eventEl.style.width = width;
            eventEl.style.background = eventColor;
            eventEl.style.color = this.getContrastColor(eventColor);
            eventEl.title = `${layout.event.title} · ${this.formatTime(layout.event.start)} - ${this.formatTime(layout.event.end)}`;
            eventEl.createDiv({ cls: "calendar-dayview-event-title", text: layout.event.title });
            eventEl.createDiv({ cls: "calendar-dayview-event-time", text: `${this.formatTime(layout.event.start)} - ${this.formatTime(layout.event.end)}` });

            eventEl.onclick = (e) => {
                e.stopPropagation();
                this.openInspector("edit", layout.event);
            };
            eventEl.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showContextMenu(e, layout.event);
            };
        }
    }

    private attachDayGridInteractions(
        grid: HTMLElement,
        slotElements: HTMLElement[],
        slotMinutes: number,
        dayDate: Date,
        startSlotOffset: number,
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
            const wrapper = grid.parentElement;
            const scrollTop = wrapper ? wrapper.scrollTop : 0;
            const y = clientY - rect.top + scrollTop;
            const slotHeight = rect.height / slotElements.length;
            return Math.max(0, Math.min(slotElements.length - 1, Math.floor(y / slotHeight)));
        };

        const commitSelection = () => {
            const minSlot = Math.min(this.dragStartSlot, this.dragEndSlot);
            const maxSlot = Math.max(this.dragStartSlot, this.dragEndSlot);
            if (maxSlot <= minSlot) return;

            const start = new Date(dayDate);
            start.setHours(0, (minSlot + startSlotOffset) * slotMinutes, 0, 0);
            const end = new Date(dayDate);
            end.setHours(0, (maxSlot + startSlotOffset) * slotMinutes, 0, 0);
            if ((end.getTime() - start.getTime()) / (60 * 1000) < 30) {
                end.setMinutes(start.getMinutes() + 30);
            }

            this.draftStart = start;
            this.draftEnd = end;
            this.openInspector("create");
            clearSelection();
        };

        grid.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.closest(".calendar-dayview-event")) return;

            this.isDragging = true;
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

    private showContextMenu(e: MouseEvent, event: CalendarEvent): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle("编辑").setIcon("pencil").onClick(() => {
                this.openInspector("edit", event);
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
            modal.contentEl.createEl("p", { text: `确定删除事件\"${event.title}\"吗？` });
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
            this.closeInspector();
            await this.loadAndRender();
        }
    }

    private formatTime(isoStr: string): string {
        const date = new Date(isoStr);
        const hour = String(date.getHours()).padStart(2, "0");
        const minute = String(date.getMinutes()).padStart(2, "0");
        return `${hour}:${minute}`;
    }

    private formatMonthTitle(date: Date): string {
        return `${date.getFullYear()}年${date.getMonth() + 1}月`;
    }

    private formatLargeDate(date: Date): string {
        return `${date.getFullYear()}年 ${date.getMonth() + 1}月${date.getDate()}日`;
    }

    private formatDateLong(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const weekDays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
        const weekDay = weekDays[date.getDay()];
        return `${year}年${month}月${day}日 ${weekDay}`;
    }

    private formatWeekSubtitle(date: Date): string {
        const weekDays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
        const firstDay = new Date(date.getFullYear(), 0, 1);
        const week = Math.ceil((((date.getTime() - firstDay.getTime()) / 86400000) + firstDay.getDay() + 1) / 7);
        return `${weekDays[date.getDay()]}，第 ${week} 周`;
    }

    private getDateKey(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
}
