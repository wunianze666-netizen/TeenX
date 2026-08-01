import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

const PUBLIC_ID = `captain_v1_${"a".repeat(43)}`;
const STATE_LABELS = ["展示我的队伍", "聚合论坛活动", "接收私信申请"] as const;
const PRIVATE = { showTeam: false, showForumActivity: false, acceptDmRequests: false } as const;

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockCaptain(page: Page): Promise<void> {
  await page.route("**/api/advx/me", (route) => fulfillJson(route, {
    profile: { publicId: PUBLIC_ID, nickname: "小橙", joinedAt: "2026-01-02T00:00:00.000Z", authMode: "signed_in" },
    team: { name: "光点小队", memberCount: 4, versionCount: 2 },
    stats: { testRunCount: 3 },
  }));
}

async function expectVisibleStates(page: Page, expected: readonly string[]): Promise<void> {
  await expect(page.locator(".settings-toggle-state")).toHaveText(expected);
}

async function renderedContrast(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas color parser is unavailable");

    const parseColor = (value: string): number[] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const composite = (top: number[], bottom: number[]): number[] => {
      const alpha = (top[3] ?? 0) / 255;
      return [
        (top[0] ?? 0) * alpha + (bottom[0] ?? 0) * (1 - alpha),
        (top[1] ?? 0) * alpha + (bottom[1] ?? 0) * (1 - alpha),
        (top[2] ?? 0) * alpha + (bottom[2] ?? 0) * (1 - alpha),
        255,
      ];
    };
    const blend = (top: number[], bottom: number[], opacity: number): number[] => [
      (top[0] ?? 0) * opacity + (bottom[0] ?? 0) * (1 - opacity),
      (top[1] ?? 0) * opacity + (bottom[1] ?? 0) * (1 - opacity),
      (top[2] ?? 0) * opacity + (bottom[2] ?? 0) * (1 - opacity),
      255,
    ];
    const luminance = (color: number[]): number => {
      const channel = (value: number): number => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(color[0] ?? 0) + 0.7152 * channel(color[1] ?? 0) + 0.0722 * channel(color[2] ?? 0);
    };

    const ancestors: Element[] = [];
    let ancestor = element.parentElement;
    while (ancestor) {
      ancestors.push(ancestor);
      ancestor = ancestor.parentElement;
    }
    let backdrop = [255, 255, 255, 255];
    for (const item of ancestors.reverse()) {
      backdrop = composite(parseColor(getComputedStyle(item).backgroundColor), backdrop);
    }
    const style = getComputedStyle(element);
    const background = composite(parseColor(style.backgroundColor), backdrop);
    const foreground = composite(parseColor(style.color), background);
    const opacity = Number.parseFloat(style.opacity);
    const renderedBackground = blend(background, backdrop, opacity);
    const renderedForeground = blend(foreground, backdrop, opacity);
    const lighter = Math.max(luminance(renderedForeground), luminance(renderedBackground));
    const darker = Math.min(luminance(renderedForeground), luminance(renderedBackground));
    return (lighter + 0.05) / (darker + 0.05);
  });
}

test("visible privacy states follow hydration, edits, and stale responses", async ({ page }) => {
  // Given: StrictMode privacy hydration has two requests and neither is authoritative yet.
  await mockCaptain(page);
  const heldRoutes: Route[] = [];
  await page.route("**/api/advx/me/privacy", (route) => { heldRoutes.push(route); });
  await page.goto("/me/settings");
  await expect.poll(() => heldRoutes.length).toBe(2);

  // Then: disabled controls expose neutral text rather than default-derived state claims.
  await expectVisibleStates(page, ["状态读取中", "状态读取中", "状态读取中"]);
  await expect(page.getByText(/已开启|已关闭/)).toHaveCount(0);

  // When: the current request hydrates, a checkbox changes, and the stale request resolves.
  const staleRoute = heldRoutes[0];
  const currentRoute = heldRoutes[1];
  if (!staleRoute || !currentRoute) throw new Error("Privacy hydration requests were not captured");
  await fulfillJson(currentRoute, { showTeam: true, showForumActivity: false, acceptDmRequests: true });
  await expectVisibleStates(page, ["已开启", "已关闭", "已开启"]);
  await page.getByText(STATE_LABELS[1], { exact: true }).click();
  await expectVisibleStates(page, ["已开启", "已开启", "已开启"]);
  await fulfillJson(staleRoute, PRIVATE);

  // Then: visible states retain the newest authoritative baseline plus local edit.
  await expectVisibleStates(page, ["已开启", "已开启", "已开启"]);
});

test("visible privacy states remain neutral through failure and retry", async ({ page }) => {
  // Given: initial hydration fails and retry is held.
  await mockCaptain(page);
  let retryRoute: Route | null = null;
  let retrying = false;
  await page.route("**/api/advx/me/privacy", (route) => {
    if (retrying) retryRoute = route;
    else void fulfillJson(route, { error: "offline" }, 503);
  });
  await page.goto("/me/settings");
  const retry = page.getByRole("button", { name: "重试读取隐私设置" });
  await expect(retry).toBeVisible();
  await expectVisibleStates(page, ["状态不可用", "状态不可用", "状态不可用"]);

  // When: retry starts and then supplies an authoritative baseline.
  retrying = true;
  await retry.click();
  await expectVisibleStates(page, ["状态读取中", "状态读取中", "状态读取中"]);
  await expect.poll(() => retryRoute !== null).toBe(true);
  if (retryRoute === null) throw new Error("Privacy retry was not captured");
  await fulfillJson(retryRoute, { showTeam: false, showForumActivity: true, acceptDmRequests: false });

  // Then: only hydrated values become visible state claims.
  await expectVisibleStates(page, ["已关闭", "已开启", "已关闭"]);
});

test("visible privacy states survive save reconciliation, failure, and retry", async ({ page }) => {
  // Given: hydrated privacy with the first save held in flight.
  await mockCaptain(page);
  let saveCount = 0;
  let heldSave: Route | null = null;
  await page.route("**/api/advx/me/privacy", (route) => {
    if (route.request().method() === "GET") return fulfillJson(route, PRIVATE);
    saveCount += 1;
    if (saveCount === 1) heldSave = route;
    else if (saveCount === 2) return fulfillJson(route, { error: "保存失败" }, 503);
    else return fulfillJson(route, { showTeam: true, showForumActivity: true, acceptDmRequests: false });
  });
  await page.goto("/me/settings");
  await expectVisibleStates(page, ["已关闭", "已关闭", "已关闭"]);

  // When: the Captain edits during save, then receives a failure and retries.
  await page.getByText(STATE_LABELS[0], { exact: true }).click();
  await page.getByRole("button", { name: "保存隐私设置" }).click();
  await expect.poll(() => heldSave !== null).toBe(true);
  await page.getByText(STATE_LABELS[1], { exact: true }).click();
  if (heldSave === null) throw new Error("Privacy save was not captured");
  await fulfillJson(heldSave, { showTeam: true, showForumActivity: false, acceptDmRequests: false });
  await expectVisibleStates(page, ["已开启", "已开启", "已关闭"]);
  await page.getByRole("button", { name: "保存隐私设置" }).click();
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: "保存失败" })).toBeVisible();
  await expectVisibleStates(page, ["已开启", "已开启", "已关闭"]);
  await page.getByRole("button", { name: "保存隐私设置" }).click();

  // Then: successful retry keeps the same visible and authoritative values.
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: "隐私设置已保存" })).toBeVisible();
  await expectVisibleStates(page, ["已开启", "已开启", "已关闭"]);
});

test("normal secondary and disabled affordance text meet WCAG contrast", async ({ page }) => {
  // Given: settings are hydrated and saved so helper, status, footer, and disabled text render together.
  await mockCaptain(page);
  await page.route("**/api/advx/me/privacy", (route) => fulfillJson(route, route.request().method() === "GET" ? PRIVATE : { ...PRIVATE, showTeam: true }));
  await page.goto("/me/settings");
  await page.getByText(STATE_LABELS[0], { exact: true }).click();
  await page.getByRole("button", { name: "保存隐私设置" }).click();
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: "隐私设置已保存" })).toBeVisible();
  await page.mouse.move(0, 0);

  // Then: computed rendered foreground/background pairs meet 4.5:1 for normal text.
  const settingsTargets = [
    { name: "secondary lead", locator: page.locator(".profile-page-head .lead") },
    { name: "privacy helper", locator: page.locator(".settings-toggle small").first() },
    { name: "save status", locator: page.getByRole("main").getByRole("status").filter({ hasText: "隐私设置已保存" }) },
    { name: "footer copy", locator: page.locator(".pagefoot .meta") },
    { name: "disabled save", locator: page.getByRole("button", { name: "保存隐私设置" }) },
  ];
  for (const target of settingsTargets) {
    expect(await renderedContrast(target.locator), target.name).toBeGreaterThanOrEqual(4.5);
  }

  // When: an inactive relationship tab renders on the contacts route.
  await page.route("**/api/advx/me/contact-requests?box=inbox", (route) => fulfillJson(route, { items: [], nextCursor: null }));
  await page.goto("/me/contacts");

  // Then: its measured rendered contrast meets the same normal-text threshold.
  expect(await renderedContrast(page.locator(".contacts-page .seg button:not(.is-on)").first())).toBeGreaterThanOrEqual(4.5);
});
