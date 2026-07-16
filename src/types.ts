export interface CalendarEvent {
    id: string;
    title: string;
    calendar: string;
    start: string;
    end: string;
    allDay: boolean;
    location?: string;
    notes?: string;
}

export interface CalendarSettings {
    showEarlyHours: boolean;
    calendarColors: Record<string, string>;
}

export const DEFAULT_SETTINGS: CalendarSettings = {
    showEarlyHours: false,
    calendarColors: {},
};

export function generateCalendarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const value = Math.abs(hash % 0xffffff);
    return `#${value.toString(16).padStart(6, "0")}`;
}
