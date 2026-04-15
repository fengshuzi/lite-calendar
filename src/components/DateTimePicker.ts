import { Modal, App } from "obsidian";

export interface DateTimePickerOptions {
    app: App;
    initialDate?: Date;
    onSelect: (start: Date, end: Date) => void;
    onClose?: () => void;
}

export class DateTimePickerModal extends Modal {
    private options: DateTimePickerOptions;
    private startInput: HTMLInputElement;
    private endInput: HTMLInputElement;

    constructor(options: DateTimePickerOptions) {
        super(options.app);
        this.options = options;
    }

    onOpen(): void {
        this.titleEl.setText("选择日期和时间");
        
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("datetime-picker-modal");
        
        const initialDate = this.options.initialDate || new Date();
        const endDate = new Date(initialDate);
        endDate.setHours(endDate.getHours() + 1);
        
        // 开始时间
        const startGroup = contentEl.createDiv("datetime-group");
        startGroup.createEl("label", { text: "开始时间:" });
        this.startInput = startGroup.createEl("input", {
            type: "datetime-local",
            cls: "datetime-input"
        });
        this.startInput.value = this.formatDateTimeLocal(initialDate);
        
        // 结束时间
        const endGroup = contentEl.createDiv("datetime-group");
        endGroup.createEl("label", { text: "结束时间:" });
        this.endInput = endGroup.createEl("input", {
            type: "datetime-local",
            cls: "datetime-input"
        });
        this.endInput.value = this.formatDateTimeLocal(endDate);
        
        // 按钮
        const buttonGroup = contentEl.createDiv("datetime-buttons");
        
        const cancelBtn = buttonGroup.createEl("button", {
            text: "取消",
            cls: "datetime-btn datetime-btn-cancel"
        });
        cancelBtn.onclick = () => this.close();
        
        const confirmBtn = buttonGroup.createEl("button", {
            text: "确定",
            cls: "datetime-btn datetime-btn-confirm"
        });
        confirmBtn.onclick = () => {
            const start = new Date(this.startInput.value);
            const end = new Date(this.endInput.value);
            this.options.onSelect(start, end);
            this.close();
        };
    }

    onClose(): void {
        this.options.onClose?.();
    }

    private formatDateTimeLocal(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
}
