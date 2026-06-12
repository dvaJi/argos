import { describe, it, expect, vi } from "vitest";
import { SubscriberEventBus } from "@argos/backend-core/eventbus/subscriberEventBus";

describe("SubscriberEventBus", () => {
  it("publishes events to subscribers", () => {
    const bus = new SubscriberEventBus();
    const handler = vi.fn();

    bus.subscribe("test.event", handler);
    bus.publish("test.event", { data: "hello" });

    expect(handler).toHaveBeenCalledWith({ data: "hello" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("supports multiple subscribers for the same event", () => {
    const bus = new SubscriberEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.subscribe("test.event", handler1);
    bus.subscribe("test.event", handler2);
    bus.publish("test.event", { data: "hello" });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("returns unsubscribe function", () => {
    const bus = new SubscriberEventBus();
    const handler = vi.fn();

    const unsub = bus.subscribe("test.event", handler);
    bus.publish("test.event", { data: "first" });
    unsub();
    bus.publish("test.event", { data: "second" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ data: "first" });
  });

  it("supports wildcard subscribers", () => {
    const bus = new SubscriberEventBus();
    const handler = vi.fn();

    bus.subscribe("*", handler);
    bus.publish("any.event", { data: "test" });
    bus.publish("other.event", { data: "test2" });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("tracks subscriber count", () => {
    const bus = new SubscriberEventBus();
    expect(bus.subscriberCount("test.event")).toBe(0);

    const unsub = bus.subscribe("test.event", vi.fn());
    expect(bus.subscriberCount("test.event")).toBe(1);

    bus.subscribe("test.event", vi.fn());
    expect(bus.subscriberCount("test.event")).toBe(2);

    unsub();
    expect(bus.subscriberCount("test.event")).toBe(1);
  });

  it("handles errors in subscribers gracefully", () => {
    const bus = new SubscriberEventBus();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const errorHandler = vi.fn(() => {
      throw new Error("handler error");
    });
    const successHandler = vi.fn();

    bus.subscribe("test.event", errorHandler);
    bus.subscribe("test.event", successHandler);

    expect(() => bus.publish("test.event", {})).toThrow("handler error");

    consoleSpy.mockRestore();
  });
});
