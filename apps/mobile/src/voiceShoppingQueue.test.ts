import { describe, expect, it, vi } from "vitest";
import { isVoiceShoppingModule, VoiceShoppingQueue, type VoiceShoppingModule } from "./voiceShoppingQueue";

function setup() {
  const module: VoiceShoppingModule = {
    nextItem: vi.fn(),
    claim: vi.fn().mockResolvedValue(undefined),
    acknowledge: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(),
    removeListeners: vi.fn()
  };
  const save = vi.fn().mockResolvedValue(undefined);
  const success = vi.fn();
  const error = vi.fn();
  return { module, save, success, error, queue: new VoiceShoppingQueue(module, "user", "household", save, success, error) };
}

describe("Siri shopping queue", () => {
  it("detects missing or outdated native Siri modules", () => {
    expect(isVoiceShoppingModule(undefined)).toBe(false);
    expect(isVoiceShoppingModule({ nextItem: () => undefined })).toBe(false);
    expect(isVoiceShoppingModule(setup().module)).toBe(true);
  });

  it("automatically saves and acknowledges requests in order, preserving quantities", async () => {
    const { module, queue, save, success } = setup();
    vi.mocked(module.nextItem).mockResolvedValueOnce({ id: "1", name: " Milk ", quantity: 2.5 })
      .mockResolvedValueOnce({ id: "2", name: "Eggs", quantity: 3 }).mockResolvedValue(null);
    await queue.load();
    expect(module.claim).toHaveBeenNthCalledWith(1, "1", "user", "household");
    expect(save).toHaveBeenNthCalledWith(1, { id: "1", name: "Milk", quantity: 2.5 });
    expect(save).toHaveBeenNthCalledWith(2, { id: "2", name: "Eggs", quantity: 3 });
    expect(module.acknowledge).toHaveBeenNthCalledWith(1, "1");
    expect(module.acknowledge).toHaveBeenNthCalledWith(2, "2");
    expect(success).toHaveBeenCalledTimes(2);
  });

  it("handles old requests without a quantity as one item", async () => {
    const { module, queue, save } = setup();
    vi.mocked(module.nextItem).mockResolvedValueOnce({ id: "1", name: "Milk" }).mockResolvedValue(null);
    await queue.load();
    expect(save).toHaveBeenCalledWith({ id: "1", name: "Milk", quantity: 1 });
  });

  it("retries acknowledgement without losing the request", async () => {
    const { module, queue, save, success, error } = setup();
    vi.mocked(module.nextItem).mockResolvedValueOnce({ id: "1", name: "Milk", quantity: 2 })
      .mockResolvedValueOnce({ id: "1", name: "Milk", quantity: 2 }).mockResolvedValue(null);
    vi.mocked(module.acknowledge).mockRejectedValueOnce(new Error("bridge unavailable")).mockResolvedValue();
    await queue.load();
    expect(success).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("Could not add the Siri item: bridge unavailable. The app will retry.");
    await queue.load();
    expect(save).toHaveBeenCalledTimes(2);
    expect(success).toHaveBeenCalledTimes(1);
  });

  it("does not acknowledge or report success if saving fails", async () => {
    const { module, queue, save, success, error } = setup();
    vi.mocked(module.nextItem).mockResolvedValue({ id: "1", name: "Milk", quantity: 2 });
    save.mockRejectedValue(new Error("offline"));
    await queue.load();
    await queue.load();
    expect(module.acknowledge).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("does not save a request claimed by another account or household", async () => {
    const { module, queue, save, error } = setup();
    vi.mocked(module.nextItem).mockResolvedValue({ id: "1", name: "Milk", quantity: 2 });
    vi.mocked(module.claim).mockRejectedValue(new Error("different household"));
    await queue.load();
    expect(save).not.toHaveBeenCalled();
    expect(module.acknowledge).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("different household"));
  });

  it("reloads when a request arrives during an empty read", async () => {
    const { module, queue, save } = setup();
    let resolve!: (value: unknown) => void;
    vi.mocked(module.nextItem).mockReturnValueOnce(new Promise((done) => { resolve = done; }))
      .mockResolvedValueOnce({ id: "1", name: "Milk", quantity: 1 }).mockResolvedValue(null);
    const first = queue.load();
    await queue.load();
    resolve(null);
    await first;
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
  });

  it("does not save after disposal during a claim", async () => {
    const { module, queue, save } = setup();
    vi.mocked(module.nextItem).mockResolvedValue({ id: "1", name: "Milk", quantity: 1 });
    let resolve!: () => void;
    vi.mocked(module.claim).mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = queue.load();
    await vi.waitFor(() => expect(module.claim).toHaveBeenCalledOnce());
    queue.dispose();
    resolve();
    await pending;
    expect(save).not.toHaveBeenCalled();
    expect(module.acknowledge).not.toHaveBeenCalled();
  });

  it.each([
    { id: "", name: "Milk", quantity: 1 },
    { id: "../1", name: "Milk", quantity: 1 },
    { id: "1", name: " ", quantity: 1 },
    { id: "1", name: "😀".repeat(51), quantity: 1 },
    { id: "1", name: "Milk", quantity: 0 },
    { id: "1", name: "Milk", quantity: 10000 },
    { id: "1", name: "Milk", quantity: 0.0000000001 }
  ])("rejects invalid queued request %#", async (item) => {
    const { module, queue, save, error } = setup();
    vi.mocked(module.nextItem).mockResolvedValue(item);
    await queue.load();
    expect(save).not.toHaveBeenCalled();
    expect(module.acknowledge).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });
});
