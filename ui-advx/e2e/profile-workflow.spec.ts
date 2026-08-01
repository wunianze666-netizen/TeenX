import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";
import { nonOfficialArenaScore } from "./profile-fixtures";

const PUBLIC_A = `captain_v1_${"a".repeat(43)}`;
const PUBLIC_B = `captain_v1_${"b".repeat(43)}`;
const PUBLIC_C = `captain_v1_${"c".repeat(43)}`;
const PUBLIC_E = `captain_v1_${"e".repeat(43)}`;
const PUBLIC_F = `captain_v1_${"f".repeat(43)}`;
const REQUEST_1 = "00000000-0000-4000-8000-000000000001";
const REQUEST_2 = "00000000-0000-4000-8000-000000000002";

const meSummary = {
  profile: { publicId: PUBLIC_A, nickname: "小橙", joinedAt: "2026-01-02T00:00:00.000Z", authMode: "signed_in" },
  team: { name: "光点小队", memberCount: 4, versionCount: 2 },
  stats: { testRunCount: 3 },
};

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockShell(page: Page): Promise<void> {
  await page.route("**/api/advx/me", (route) => fulfillJson(route, meSummary));
  await page.route("**/api/advx/forum/session*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "offline" }) }));
  await page.route("**/discourse/session/current.json", (route) => fulfillJson(route, { current_user: null }));
}

async function expectMobileLayout(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.project.name !== "mobile") return;
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const heights = await page.locator(".topnav a, .topnav button, .profile-workflow .btn, .profile-workflow .seg button, .settings-toggle").evaluateAll(
    (elements) => elements.filter((element) => element.getBoundingClientRect().width > 0).map((element) => element.getBoundingClientRect().height),
  );
  expect(heights.length).toBeGreaterThan(0);
  expect(heights.every((height) => height >= 44)).toBe(true);
}

test("settings preserves edits made while saves are pending and guards dirty navigation", async ({ page }, testInfo) => {
  // Given: settings load with private defaults and an identity save is held in flight.
  await mockShell(page);
  await page.route("**/api/advx/me/privacy", async (route) => {
    if (route.request().method() === "GET") {
      await fulfillJson(route, { showTeam: false, showForumActivity: false, acceptDmRequests: false });
      return;
    }
    await fulfillJson(route, { showTeam: true, showForumActivity: false, acceptDmRequests: false });
  });
  let heldIdentityRoute: Route | null = null;
  await page.route("**/api/advx/me/identity", async (route) => {
    heldIdentityRoute = route;
  });
  await page.goto("/me/settings");

  // When: a save starts, the Captain keeps typing, and the older response completes.
  const nickname = page.getByLabel("队长昵称");
  await nickname.fill("第一版昵称");
  await page.getByRole("button", { name: "保存身份" }).click();
  await expect.poll(() => heldIdentityRoute !== null).toBe(true);
  await nickname.fill("继续输入的新昵称");
  if (heldIdentityRoute === null) throw new Error("identity request was not captured");
  await fulfillJson(heldIdentityRoute, { profile: { publicId: PUBLIC_A, nickname: "第一版昵称", joinedAt: null } });

  // Then: the newer edit survives and leaving through the router opens Feedback confirmation.
  await expect(nickname).toHaveValue("继续输入的新昵称");
  await page.getByRole("link", { name: "返回个人中心" }).click();
  await expect(page.getByRole("dialog")).toContainText("未保存");
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(page).toHaveURL(/\/me\/settings$/);
  await expectMobileLayout(page, testInfo);
});

test("privacy controls wait for authoritative hydration", async ({ page }) => {
  // Given: the authoritative privacy response is still pending.
  await mockShell(page);
  const heldPrivacyRoutes: Route[] = [];
  await page.route("**/api/advx/me/privacy", async (route) => {
    expect(route.request().method()).toBe("GET");
    heldPrivacyRoutes.push(route);
  });
  await page.goto("/me/settings");
  await expect.poll(() => heldPrivacyRoutes.length).toBe(2);
  const controls = page.locator(".settings-toggle input");

  // When: the Captain sees the private defaults before GET completion.
  // Then: defaults cannot be edited or saved as if they were authoritative.
  await expect(controls).toHaveCount(3);
  for (const control of await controls.all()) await expect(control).toBeDisabled();
  await expect(page.getByRole("button", { name: "保存隐私设置" })).toBeDisabled();

  // When: the authoritative response arrives.
  const stalePrivacyRoute = heldPrivacyRoutes[0];
  const currentPrivacyRoute = heldPrivacyRoutes[1];
  if (!stalePrivacyRoute || !currentPrivacyRoute) throw new Error("privacy requests were not captured");
  await fulfillJson(currentPrivacyRoute, { showTeam: true, showForumActivity: false, acceptDmRequests: true });

  // Then: controls enable with the server values and subsequent choices remain editable.
  await expect(controls.nth(0)).toBeEnabled();
  await expect(controls.nth(0)).toBeChecked();
  await expect(controls.nth(1)).not.toBeChecked();
  await expect(controls.nth(2)).toBeChecked();
  await page.getByText("聚合论坛活动", { exact: true }).click();
  await expect(controls.nth(1)).toBeChecked();
  await fulfillJson(stalePrivacyRoute, { showTeam: false, showForumActivity: false, acceptDmRequests: false });
  await expect(controls.nth(0)).toBeChecked();
  await expect(controls.nth(1)).toBeChecked();
  await expect(controls.nth(2)).toBeChecked();
});

test("failed privacy hydration remains locked until retry succeeds", async ({ page }) => {
  // Given: the first authoritative GET fails and the retry is held in flight.
  await mockShell(page);
  let holdRetry = false;
  let heldRetryRoute: Route | null = null;
  await page.route("**/api/advx/me/privacy", async (route) => {
    if (!holdRetry) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "offline" }) });
      return;
    }
    heldRetryRoute = route;
  });
  await page.goto("/me/settings");
  const controls = page.locator(".settings-toggle input");
  const retry = page.getByRole("button", { name: "重试读取隐私设置" });
  await expect(retry).toBeVisible();

  // When: hydration has failed and while its retry remains pending.
  // Then: no default-based edit or save path is available.
  for (const control of await controls.all()) await expect(control).toBeDisabled();
  await expect(page.getByRole("button", { name: "保存隐私设置" })).toBeDisabled();
  holdRetry = true;
  await retry.click();
  await expect.poll(() => heldRetryRoute !== null).toBe(true);
  for (const control of await controls.all()) await expect(control).toBeDisabled();

  // When: retry returns an authoritative baseline.
  if (heldRetryRoute === null) throw new Error("privacy retry was not captured");
  await fulfillJson(heldRetryRoute, { showTeam: false, showForumActivity: true, acceptDmRequests: false });

  // Then: retry clears the lock and hydrates only the returned values.
  await expect(retry).toHaveCount(0);
  await expect(controls.nth(0)).toBeEnabled();
  await expect(controls.nth(0)).not.toBeChecked();
  await expect(controls.nth(1)).toBeChecked();
  await expect(controls.nth(2)).not.toBeChecked();
});

test("approved contacts append opaque cursor pages without duplicates and gate unavailable cleanup actions", async ({ page }, testInfo) => {
  // Given: two approved-contact pages overlap and unavailable rows expose distinct server capabilities.
  await mockShell(page);
  await page.route("**/api/advx/me/contact-requests?box=inbox", (route) => fulfillJson(route, {
    items: [],
    nextCursor: null,
  }));
  const approved = Array.from({ length: 50 }, (_, index) => ({
    counterpart: {
      publicId: index === 0 ? PUBLIC_B : `captain_v1_${String(index).padStart(2, "0")}${"d".repeat(41)}`,
      nickname: index === 0 ? "小蓝" : `联系人 ${index}`,
      avatarPath: null,
    },
    state: "approved",
    establishedAt: "2026-07-20T00:00:00.000Z",
    canMessage: index === 0,
    canSever: index === 0,
    canBlock: index === 0,
    canUnblock: false,
  }));
  const unavailableBlock = {
    counterpart: { publicId: PUBLIC_C, nickname: "小青", avatarPath: null },
    state: "unavailable",
    establishedAt: null,
    canMessage: false,
    canSever: false,
    canBlock: true,
    canUnblock: false,
  };
  const unavailableSever = {
    ...unavailableBlock,
    counterpart: { publicId: PUBLIC_E, nickname: "小绿", avatarPath: null },
    canSever: true,
    canBlock: false,
  };
  const unavailableUnblock = {
    ...unavailableBlock,
    counterpart: { publicId: PUBLIC_F, nickname: "小灰", avatarPath: null },
    canBlock: false,
    canUnblock: true,
  };
  await page.route("**/api/advx/me/contacts*", (route) => {
    const search = new URL(route.request().url()).search;
    if (search === "?cursor=cursor%2F%2B%3D%3D&limit=50") {
      return fulfillJson(route, { items: [approved[49], unavailableBlock, unavailableSever, unavailableUnblock], nextCursor: null });
    }
    expect(search).toBe("?limit=50");
    return fulfillJson(route, { items: approved, nextCursor: "cursor/+==" });
  });
  await page.route(`**/api/advx/captains/${PUBLIC_B}/profile`, (route) => fulfillJson(route, {
    profile: { publicId: PUBLIC_B, nickname: "小蓝", avatarPath: null, joinedAt: null },
    viewerActions: { isSelf: false, contactState: "approved", canRequestDm: false, canRespond: false, canMessage: true, canBlock: true, canUnblock: false, requestId: null, forumMessagePath: "/new-message?username=tx_abcdefghijklmnop" },
  }));
  await page.goto("/me/contacts");

  // When: the Captain opens approved contacts and loads the opaque continuation page.
  await page.getByRole("button", { name: "已授权联系人" }).click();
  await page.getByRole("button", { name: "加载更多" }).click();
  await expect(page.locator("[data-contact-id]")).toHaveCount(53);
  await expect(page.locator(`[data-contact-id="${PUBLIC_B}"]`)).toBeVisible();
  const blockRow = page.locator(`[data-contact-id="${PUBLIC_C}"]`);
  const severRow = page.locator(`[data-contact-id="${PUBLIC_E}"]`);
  const unblockRow = page.locator(`[data-contact-id="${PUBLIC_F}"]`);
  await expect(blockRow.getByText("暂不可联络")).toBeVisible();
  await expect(blockRow.getByRole("button", { name: "屏蔽" })).toBeVisible();
  await expect(blockRow.getByRole("button", { name: /^(撤销授权|解除屏蔽)$/ })).toHaveCount(0);
  await expect(severRow.getByRole("button", { name: "撤销授权" })).toBeVisible();
  await expect(severRow.getByRole("button", { name: /^(屏蔽|解除屏蔽)$/ })).toHaveCount(0);
  await expect(unblockRow.getByRole("button", { name: "解除屏蔽" })).toBeVisible();
  await expect(unblockRow.getByRole("button", { name: /^(撤销授权|屏蔽)$/ })).toHaveCount(0);
  for (const row of [blockRow, severRow, unblockRow]) await expect(row).not.toContainText(/谁|对方|方向|原因/);
  await expectMobileLayout(page, testInfo);
  await page.getByRole("button", { name: "发私信" }).click();

  // Then: dedupe holds across more than 50 contacts and PM navigation still uses fresh authorization.
  await expect(page).toHaveURL(/\/forum\?path=%2Fnew-message%3Fusername%3Dtx_abcdefghijklmnop$/);
});

test("rapid Captain switches never restore stale profile data or actions", async ({ page }, testInfo) => {
  // Given: Captain A is slow while Captain B responds immediately without public Team or forum sections.
  await mockShell(page);
  let heldA: Route | null = null;
  await page.route(`**/api/advx/captains/${PUBLIC_A}/profile`, async (route) => {
    heldA = route;
  });
  await page.route(`**/api/advx/captains/${PUBLIC_B}/profile`, (route) => fulfillJson(route, {
    profile: { publicId: PUBLIC_B, nickname: "小蓝", avatarPath: null, joinedAt: null },
    viewerActions: { isSelf: false, contactState: "closed", canRequestDm: false, canRespond: false, canMessage: false, canBlock: true, canUnblock: false, requestId: null, forumMessagePath: null },
  }));
  await page.goto(`/captains/${PUBLIC_A}`);
  await expect.poll(() => heldA !== null).toBe(true);

  // When: the router switches to B before A completes.
  await page.evaluate((publicId) => {
    window.history.pushState({}, "", `/captains/${publicId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, PUBLIC_B);
  await expect(page.getByRole("heading", { name: "小蓝" })).toBeVisible();
  if (heldA === null) throw new Error("Captain A request was not captured");
  await fulfillJson(heldA, {
    profile: { publicId: PUBLIC_A, nickname: "过期的小橙", avatarPath: null, joinedAt: null },
    team: { name: "不应出现", memberCount: 8, versionCount: 8 },
    viewerActions: { isSelf: false, contactState: "available", canRequestDm: true, canRespond: false, canMessage: false, canBlock: true, canUnblock: false, requestId: null, forumMessagePath: null },
  });

  // Then: B remains visible, hidden sections stay omitted, and no other-user Arena surface exists.
  await expect(page.getByRole("heading", { name: "小蓝" })).toBeVisible();
  await expect(page.getByText("过期的小橙")).toHaveCount(0);
  await expect(page.getByText("不应出现")).toHaveCount(0);
  await expect(page.locator("main").getByText(/赛题|得分|排名|提交/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "暂不接收私信申请" })).toBeDisabled();
  heldA = null;
  await page.evaluate((publicId) => {
    window.history.pushState({}, "", `/captains/${publicId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, PUBLIC_A);
  await expect.poll(() => heldA !== null).toBe(true);
  await expect(page.getByText("小蓝")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "暂不接收私信申请" })).toHaveCount(0);
  if (heldA === null) throw new Error("second Captain A request was not captured");
  await fulfillJson(heldA, {
    profile: { publicId: PUBLIC_A, nickname: "返回的小橙", avatarPath: null, joinedAt: null },
    viewerActions: { isSelf: false, contactState: "unavailable", canRequestDm: false, canRespond: false, canMessage: false, canBlock: false, canUnblock: false, requestId: null, forumMessagePath: null },
  });
  await expect(page.getByRole("heading", { name: "返回的小橙" })).toBeVisible();
  await expectMobileLayout(page, testInfo);
});

test("Me shows pending contacts and truthful owner-only non-official Arena status", async ({ page }, testInfo) => {
  // Given: the owner has one pending request and one completed Mock Arena submission.
  await mockShell(page);
  await page.route("**/api/advx/me/contact-requests?box=inbox", (route) => fulfillJson(route, {
    items: [{ requestId: REQUEST_1, direction: "incoming", state: "pending", counterpart: { publicId: PUBLIC_B, nickname: "小蓝", avatarPath: null }, createdAt: "2026-07-20T00:00:00.000Z", expiresAt: "2026-07-27T00:00:00.000Z" }],
    nextCursor: null,
  }));
  await page.route("**/api/advx/arena/challenges", (route) => fulfillJson(route, [{ id: "todo-web", version: 1, challengeVersionId: "todo-web-v1", title: "会记住的待办清单", description: "", goal: "", rules: "", submitType: "zip", opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2027-01-01T00:00:00.000Z", status: "open" }]));
  await page.route("**/api/advx/arena/challenges/todo-web-v1", (route) => fulfillJson(route, {
    id: "todo-web", version: 1, challengeVersionId: "todo-web-v1", title: "会记住的待办清单", description: "", goal: "", rules: "", submitType: "zip", opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2027-01-01T00:00:00.000Z", status: "open", dimensions: [], activeSubmission: null,
    latestSubmission: { id: "submission-1", challengeVersionId: "todo-web-v1", teamVersionId: "team-version-1", boundTeamVersion: { id: "team-version-1", versionNumber: 1, label: "Profile fixture", teamName: "光点小队", createdAt: "2026-07-21T00:00:00.000Z" }, filename: "entry.zip", byteSize: 120, sha256: "abc", createdAt: "2026-07-22T00:00:00.000Z", autoCreatedTeamVersion: false, run: { runId: "run-1", status: "completed", stage: "summary", completedDimensions: [], startedAt: "2026-07-22T00:00:00.000Z", finishedAt: "2026-07-22T00:01:00.000Z", failureCode: null, failureMessage: null, scoreWorkProductId: "score-1" } },
  }));
  await page.route("**/api/advx/arena/runs/run-1/result", (route) => fulfillJson(route, nonOfficialArenaScore));

  // When: the Captain opens their own Me page.
  await page.goto("/me");

  // Then: pending count and non-official owner result are explicit, not fabricated public rank data.
  await expect(page.getByRole("link", { name: /联络申请.*1/ })).toBeVisible();
  await expect(page.getByText("非官方评测 · 不计正式成绩")).toBeVisible();
  await expect(page.getByText(/第 \d+ 名/)).toHaveCount(0);
  await expectMobileLayout(page, testInfo);
});
