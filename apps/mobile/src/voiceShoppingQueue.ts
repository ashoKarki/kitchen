import { isValidQuantity } from "@my-kitchen/shared";

export interface VoiceItem {
  id: string;
  name: string;
  quantity: number;
}

export interface VoiceShoppingModule {
  nextItem(): Promise<unknown>;
  claim(id: string, userId: string, kitchenId: string): Promise<void>;
  acknowledge(id: string): Promise<void>;
  addListener(event: string): void;
  removeListeners(count: number): void;
}

export function isVoiceShoppingModule(value: unknown): value is VoiceShoppingModule {
  return typeof value === "object" && value !== null
    && "nextItem" in value && typeof value.nextItem === "function"
    && "claim" in value && typeof value.claim === "function"
    && "acknowledge" in value && typeof value.acknowledge === "function"
    && "addListener" in value && typeof value.addListener === "function"
    && "removeListeners" in value && typeof value.removeListeners === "function";
}

function parseVoiceItem(value: unknown): VoiceItem {
  if (typeof value !== "object" || value === null ||
      !("id" in value) || typeof value.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id) ||
      !("name" in value) || typeof value.name !== "string" || !value.name.trim() || value.name.length > 100) {
    throw new Error("The Siri shopping request is invalid.");
  }
  const quantity = "quantity" in value ? value.quantity : 1;
  if (!isValidQuantity(quantity) || quantity === 0) {
    throw new Error("The Siri shopping request has an invalid quantity.");
  }
  return { id: value.id, name: value.name.trim(), quantity };
}

export class VoiceShoppingQueue {
  private active = true;
  private loading = false;
  private reload = false;
  private lastError: string | null = null;

  constructor(
    private readonly module: VoiceShoppingModule,
    private readonly userId: string,
    private readonly kitchenId: string,
    private readonly save: (item: VoiceItem) => Promise<void>,
    private readonly reportSuccess: (item: VoiceItem) => void,
    private readonly reportError: (message: string) => void
  ) {}

  dispose() {
    this.active = false;
  }

  async load() {
    if (!this.active) return;
    if (this.loading) {
      this.reload = true;
      return;
    }
    this.loading = true;
    try {
      while (this.active) {
        const pending = await this.module.nextItem();
        if (!this.active || pending == null) break;
        const item = parseVoiceItem(pending);
        await this.module.claim(item.id, this.userId, this.kitchenId);
        if (!this.active) break;
        await this.save(item);
        if (!this.active) break;
        await this.module.acknowledge(item.id);
        if (!this.active) break;
        this.lastError = null;
        this.reportSuccess(item);
      }
    } catch (error) {
      const message = `Could not add the Siri item: ${error instanceof Error ? error.message : String(error)}. The app will retry.`;
      if (this.active && this.lastError !== message) {
        this.lastError = message;
        this.reportError(message);
      }
    } finally {
      this.loading = false;
      if (this.active && this.reload) {
        this.reload = false;
        void this.load();
      }
    }
  }
}
