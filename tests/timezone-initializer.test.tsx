import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  effects: [] as Array<() => void>,
  attempted: { current: false },
}));
const routerRefreshMock = vi.hoisted(() => vi.fn());
const initializeUserTimeZoneActionMock = vi.hoisted(() => vi.fn());

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useEffect: vi.fn((effect: () => void) => {
      hooks.effects.push(effect);
    }),
    useRef: vi.fn(() => hooks.attempted),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}));

vi.mock("../features/profile/timezone-actions", () => ({
  initializeUserTimeZoneAction: initializeUserTimeZoneActionMock,
}));

import {
  detectBrowserTimeZone,
  TimeZoneInitializer,
} from "../features/profile/components/timezone-initializer";

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function mockDetectedTimeZone(value: string) {
  const OriginalDateTimeFormat = Intl.DateTimeFormat;

  return vi.spyOn(Intl, "DateTimeFormat").mockImplementation(((locales, options) => {
    if (options?.timeZone) {
      return new OriginalDateTimeFormat(locales, options);
    }

    return {
      resolvedOptions: () => ({ timeZone: value }),
    } as Intl.DateTimeFormat;
  }) as typeof Intl.DateTimeFormat);
}

describe("timezone initializer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    hooks.effects = [];
    hooks.attempted.current = false;
    routerRefreshMock.mockReset();
    initializeUserTimeZoneActionMock.mockReset();
    initializeUserTimeZoneActionMock.mockResolvedValue({
      message: "Timezone saved.",
      status: "success",
      timeZone: "America/Sao_Paulo",
    });
  });

  it("detects and persists America/Sao_Paulo for a missing profile timezone", async () => {
    mockDetectedTimeZone("America/Sao_Paulo");
    TimeZoneInitializer({ persistedTimeZone: null });

    hooks.effects[0]?.();
    await flushPromises();

    expect(initializeUserTimeZoneActionMock).toHaveBeenCalledWith("America/Sao_Paulo");
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when a valid profile timezone already exists", () => {
    mockDetectedTimeZone("America/Sao_Paulo");
    TimeZoneInitializer({ persistedTimeZone: "Europe/London" });
    hooks.effects[0]?.();

    expect(initializeUserTimeZoneActionMock).not.toHaveBeenCalled();
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });

  it("does not write an unavailable or invalid detected timezone", () => {
    mockDetectedTimeZone("Invalid/Timezone");

    expect(detectBrowserTimeZone()).toBeNull();
    TimeZoneInitializer({ persistedTimeZone: null });
    hooks.effects[0]?.();

    expect(initializeUserTimeZoneActionMock).not.toHaveBeenCalled();
  });

  it("attempts initialization only once and refreshes only after success", async () => {
    mockDetectedTimeZone("America/Sao_Paulo");
    initializeUserTimeZoneActionMock.mockResolvedValue({
      message: "Unable to initialize your timezone right now.",
      status: "error",
    });
    TimeZoneInitializer({ persistedTimeZone: null });

    hooks.effects[0]?.();
    hooks.effects[0]?.();
    await flushPromises();

    expect(initializeUserTimeZoneActionMock).toHaveBeenCalledTimes(1);
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });
});
