import { exec } from "child_process";

// 辅助函数：格式化本地日期为 YYYY-MM-DD（避免 UTC 时区问题）
function formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
import { promisify } from "util";
import { CalendarEvent } from "./types";
import { Notice, Platform } from "obsidian";

const execAsync = promisify(exec);

export class CalendarStorage {
    private isMac: boolean;

    constructor() {
        this.isMac = Platform.isMacOS;
    }

    // ========== macOS 检查 ==========
    private checkMacOS(): boolean {
        if (!this.isMac) {
            new Notice("此功能仅支持 macOS 系统");
            return false;
        }
        return true;
    }

    // ========== JXA 脚本 ==========
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JXA returns untyped output
    private async runJXA(script: string): Promise<any> {
        if (!this.checkMacOS()) return null;

        try {
            // 使用单引号包裹脚本，避免 shell 解析问题
            const { stdout } = await execAsync(`osascript -l JavaScript -e '${script}'`, {
                timeout: 60000,
            });
            return stdout.trim();
        } catch (error) {
            console.error("[Calendar] JXA Error:", error);
            new Notice("执行日历操作失败");
            return null;
        }
    }

    private escapeJXA(str: string): string {
        return str
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\n/g, "\\n");
    }

    // ========== 查询未来3天的日历事件 ==========
    async getEvents(): Promise<{ events: Record<string, CalendarEvent[]>; calendars: string[] }> {
        const script = `ObjC.import("EventKit");var store=$.EKEventStore.alloc.init;var status=$.EKEventStore.authorizationStatusForEntityType(0);if(status!=3){store.requestAccessToEntityTypeCompletion(0,null);delay(2);}var now=$.NSDate.date;var end=now.dateByAddingTimeInterval(3*24*60*60);var cals=store.calendarsForEntityType(0);var calNames=[];var events={};for(var i=0;i<cals.count;i++){var cal=cals.objectAtIndex(i);var name=ObjC.unwrap(cal.title);calNames.push(name);}var predicate=store.predicateForEventsWithStartDateEndDateCalendars(now,end,cals);var allEvents=store.eventsMatchingPredicate(predicate);for(var i=0;i<allEvents.count;i++){var e=allEvents.objectAtIndex(i);var calName=ObjC.unwrap(e.calendar.title);if(!events[calName])events[calName]=[];events[calName].push({title:ObjC.unwrap(e.title),id:ObjC.unwrap(e.calendarItemIdentifier),start:ObjC.unwrap(e.startDate).toISOString(),end:ObjC.unwrap(e.endDate).toISOString(),allDay:e.isAllDay,location:e.location?ObjC.unwrap(e.location):null,notes:e.notes?ObjC.unwrap(e.notes):null});}for(var k in events){events[k].sort(function(a,b){return new Date(a.start)-new Date(b.start);});}JSON.stringify({events:events,calendars:calNames});`;

        const result = await this.runJXA(script);
        if (!result) return { events: {}, calendars: [] };

        try {
            return JSON.parse(result);
        } catch (error) {
            console.error("[Calendar] Parse Error:", error);
            return { events: {}, calendars: [] };
        }
    }

    // ========== 获取所有日历 ==========
    async getCalendars(): Promise<string[]> {
        const script = `var Calendar=Application("Calendar");JSON.stringify(Calendar.calendars().map(function(c){return c.name();}));`;
        const result = await this.runJXA(script);
        if (!result) return [];

        try {
            return JSON.parse(result);
        } catch {
            return [];
        }
    }

    // ========== 增 (Create) ==========
    async createEvent(
        calendarName: string,
        title: string,
        startISO: string,
        endISO: string
    ): Promise<boolean> {
        const calName = this.escapeJXA(calendarName);
        const titleEsc = this.escapeJXA(title);

        const script = `ObjC.import("EventKit");var store=$.EKEventStore.alloc.init;var status=$.EKEventStore.authorizationStatusForEntityType(0);if(status!=3){store.requestAccessToEntityTypeCompletion(0,null);delay(2);}var cals=store.calendarsForEntityType(0);var targetCal=null;for(var i=0;i<cals.count;i++){var cal=cals.objectAtIndex(i);if(ObjC.unwrap(cal.title)==="${calName}"){targetCal=cal;break;}}if(!targetCal){var names=[];for(var i=0;i<cals.count;i++){names.push(ObjC.unwrap(cals.objectAtIndex(i).title));}"calendar not found. Available: "+names.join(", ");}else{var event=$.EKEvent.eventWithEventStore(store);event.title=$("${titleEsc}");event.startDate=$.NSDate.dateWithTimeIntervalSince1970(new Date("${startISO}").getTime()/1000);event.endDate=$.NSDate.dateWithTimeIntervalSince1970(new Date("${endISO}").getTime()/1000);event.calendar=targetCal;var error=$();store.saveEventSpanCommitError(event,0,true,error);error.js?error.js.localizedDescription:"ok";}`;

        const result = await this.runJXA(script);
        if (result === "ok") {
            new Notice("事件已添加");
            return true;
        }
        return false;
    }

    // ========== 删 (Delete) ==========
    async deleteEvent(eventId: string): Promise<boolean> {
        const script = `ObjC.import("EventKit");var store=$.EKEventStore.alloc.init;var status=$.EKEventStore.authorizationStatusForEntityType(0);if(status!=3){store.requestAccessToEntityTypeCompletion(0,null);delay(2);}var event=store.eventWithIdentifier("${eventId}");if(!event){"event not found";}else{var error=$();store.removeEventSpanCommitError(event,0,true,error);error.js?error.js.localizedDescription:"ok";}`;

        const result = await this.runJXA(script);
        if (result === "ok") {
            new Notice("事件已删除");
            return true;
        }
        return false;
    }

    // ========== 改 (Update) ==========
    async updateEvent(
        eventId: string,
        title: string,
        startISO: string,
        endISO: string
    ): Promise<boolean> {
        const titleEsc = this.escapeJXA(title);

        const script = `ObjC.import("EventKit");var store=$.EKEventStore.alloc.init;var status=$.EKEventStore.authorizationStatusForEntityType(0);if(status!=3){store.requestAccessToEntityTypeCompletion(0,null);delay(2);}var event=store.eventWithIdentifier("${eventId}");if(!event){"event not found";}else{event.title=$("${titleEsc}");event.startDate=$.NSDate.dateWithTimeIntervalSince1970(new Date("${startISO}").getTime()/1000);event.endDate=$.NSDate.dateWithTimeIntervalSince1970(new Date("${endISO}").getTime()/1000);var error=$();store.saveEventSpanCommitError(event,0,true,error);error.js?error.js.localizedDescription:"ok";}`;

        const result = await this.runJXA(script);
        if (result === "ok") {
            new Notice("事件已更新");
            return true;
        }
        return false;
    }

    // ========== 辅助方法 ==========
    groupEventsByDay(events: Record<string, CalendarEvent[]>): Array<{
        dateKey: string;
        label: string;
        events: CalendarEvent[];
    }> {
        const allEvents: CalendarEvent[] = [];
        for (const [calName, evts] of Object.entries(events)) {
            for (const evt of evts) {
                allEvents.push({ ...evt, calendar: calName });
            }
        }

        const grouped = new Map<string, CalendarEvent[]>();
        for (const event of allEvents) {
            const dateKey = this.getDateKey(event.start);
            if (!grouped.has(dateKey)) {
                grouped.set(dateKey, []);
            }
            grouped.get(dateKey)!.push(event);
        }

        const result = Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dateKey, events]) => ({
                dateKey,
                label: this.getDayLabel(dateKey),
                events: events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
            }));

        return result;
    }

    private getDateKey(isoStr: string): string {
        const date = new Date(isoStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    private getDayLabel(dateKey: string): string {
        const now = new Date();
        const todayKey = this.getDateKey(formatLocalDate(now));

        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowKey = this.getDateKey(formatLocalDate(tomorrow));

        const dayAfter = new Date(now);
        dayAfter.setDate(dayAfter.getDate() + 2);
        const dayAfterKey = this.getDateKey(formatLocalDate(dayAfter));

        if (dateKey === todayKey) return "今天";
        if (dateKey === tomorrowKey) return "明天";
        if (dateKey === dayAfterKey) return "后天";
        return dateKey.substring(5); // MM-DD
    }
}
