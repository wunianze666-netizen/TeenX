import { expect, test, type Page, type Route } from "@playwright/test";

const PUBLIC_A = `captain_v1_${"a".repeat(43)}`;
const PUBLIC_B = `captain_v1_${"b".repeat(43)}`;
const PUBLIC_C = `captain_v1_${"c".repeat(43)}`;
const PUBLIC_D = `captain_v1_${"d".repeat(43)}`;
const REQUEST_1 = "00000000-0000-4000-8000-000000000001";
const REQUEST_2 = "00000000-0000-4000-8000-000000000002";

const meSummary = {
  profile: { publicId: PUBLIC_A, nickname: "小橙", joinedAt: "2026-01-02T00:00:00.000Z", authMode: "signed_in" },
  team: { name: "光点小队", memberCount: 4, versionCount: 2 },
  stats: { testRunCount: 3 },
};

function viewerActions(contactState: "available" | "closed" | "outgoing_pending") {
  return {
    isSelf: false,
    contactState,
    canRequestDm: contactState === "available",
    canRespond: false,
    canMessage: false,
    canBlock: true,
    canUnblock: false,
    requestId: contactState === "outgoing_pending" ? REQUEST_1 : null,
    forumMessagePath: null,
  } as const;
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockShell(page: Page): Promise<void> {
  await page.route("**/api/advx/me", (route) => fulfillJson(route, meSummary));
}

function requestSummary(requestId: string, state: "pending" | "accepted" | "declined" | "revoked" | "expired", direction: "incoming" | "outgoing") {
  return {
    requestId,
    direction,
    state,
    counterpart: { publicId: PUBLIC_B, nickname: `${state}队长`, avatarPath: null },
    createdAt: "2026-07-20T00:00:00.000Z",
    expiresAt: "2026-07-27T00:00:00.000Z",
  } as const;
}

test("unsafe Profile avatar paths never issue image requests", async ({ page }) => {
  // Given: public profiles return every external or path-confusion avatar form found in review.
  await mockShell(page);
  const unsafePaths = [
    "https://outside.example/avatar.png",
    "//outside.example/avatar.png",
    "\\outside.example\\avatar.png",
    "/user_avatar/../admin/avatar.png",
  ] as const;
  const publicIds = [PUBLIC_A, PUBLIC_B, PUBLIC_C, PUBLIC_D];
  let profileIndex = 0;
  const imageRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "image" && request.url().includes("/discourse")) imageRequests.push(request.url());
  });
  await page.route("**/api/advx/captains/*/profile", (route) => {
    const avatarPath = unsafePaths[profileIndex] ?? unsafePaths[0];
    const publicId = publicIds[profileIndex] ?? PUBLIC_A;
    profileIndex += 1;
    return fulfillJson(route, {
      profile: { publicId, nickname: "安全头像", avatarPath, joinedAt: null },
      viewerActions: viewerActions("closed"),
    });
  });

  // When: each profile is rendered through the real browser image loader.
  for (const publicId of publicIds) {
    await page.goto(`/captains/${publicId}`);
    await expect(page.getByRole("heading", { name: "安全头像" })).toBeVisible();
  }

  // Then: invalid paths render initials and never become image requests.
  expect(imageRequests).toEqual([]);
  await expect(page.getByLabel("安全头像 的头像占位")).toBeVisible();
});

test("terminal contact requests are read-only with explicit state text", async ({ page }) => {
  // Given: the inbox contains every terminal request state.
  await mockShell(page);
  await page.route("**/api/advx/me/contact-requests?box=inbox", (route) => fulfillJson(route, {
    items: [
      requestSummary(REQUEST_1, "accepted", "incoming"),
      requestSummary(REQUEST_2, "declined", "incoming"),
      requestSummary("00000000-0000-4000-8000-000000000003", "revoked", "outgoing"),
      requestSummary("00000000-0000-4000-8000-000000000004", "expired", "outgoing"),
    ],
    nextCursor: null,
  }));

  // When: the Captain opens the request list.
  await page.goto("/me/contacts");
  await expect(page.locator("[data-request-id]")).toHaveCount(4);

  // Then: no terminal row exposes a mutation and every state is explained.
  await expect(page.getByRole("button", { name: /接受|拒绝|撤回申请/ })).toHaveCount(0);
  for (const label of ["已接受", "已拒绝", "已撤回", "已过期"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
});

for (const status of [404, 409] as const) {
  test(`contact mutation ${status} keeps unrelated rows and reloads the list`, async ({ page }) => {
    // Given: two requests are visible and the first mutation is rejected as stale.
    await mockShell(page);
    let listLoads = 0;
    await page.route("**/api/advx/me/contact-requests?box=inbox", (route) => {
      listLoads += 1;
      return fulfillJson(route, {
        items: [requestSummary(REQUEST_1, "pending", "incoming"), requestSummary(REQUEST_2, "pending", "incoming")],
        nextCursor: null,
      });
    });
    await page.route(`**/api/advx/contact-requests/${REQUEST_1}`, (route) => fulfillJson(route, { error: "申请状态已变化" }, status));
    await page.goto("/me/contacts");
    await expect(page.locator("[data-request-id]")).toHaveCount(2);
    const initialListLoads = listLoads;

    // When: the Captain acts on the stale first request.
    await page.locator(`[data-request-id="${REQUEST_1}"]`).getByRole("button", { name: "接受" }).click();

    // Then: both rows remain and an authoritative reload occurs after feedback.
    await expect(page.getByRole("alert")).toContainText("申请状态已变化");
    await expect.poll(() => listLoads).toBe(initialListLoads + 1);
    await expect(page.locator("[data-request-id]")).toHaveCount(2);
  });
}

test("Captain mutations cannot update a different route or surface stale errors", async ({ page }) => {
  // Given: Captain A can receive requests, Captain B cannot, and mutations are held.
  await mockShell(page);
  await page.route(`**/api/advx/captains/${PUBLIC_A}/profile`, (route) => fulfillJson(route, {
    profile: { publicId: PUBLIC_A, nickname: "小橙", avatarPath: null, joinedAt: null },
    viewerActions: viewerActions("available"),
  }));
  await page.route(`**/api/advx/captains/${PUBLIC_B}/profile`, (route) => fulfillJson(route, {
    profile: { publicId: PUBLIC_B, nickname: "小蓝", avatarPath: null, joinedAt: null },
    viewerActions: viewerActions("closed"),
  }));
  const heldMutations: Route[] = [];
  await page.route("**/api/advx/contact-requests", (route) => {
    heldMutations.push(route);
  });
  await page.goto(`/captains/${PUBLIC_A}`);
  await page.getByRole("button", { name: "申请私信" }).click();
  await expect.poll(() => heldMutations.length).toBe(1);

  // When: navigation reaches B before A's successful mutation completes.
  await page.evaluate((publicId) => {
    window.history.pushState({}, "", `/captains/${publicId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, PUBLIC_B);
  await expect(page.getByRole("heading", { name: "小蓝" })).toBeVisible();
  await fulfillJson(heldMutations[0], { ok: true, viewerActions: viewerActions("outgoing_pending") });

  // Then: B retains its own actions rather than A's stale result.
  await expect(page.getByRole("heading", { name: "小蓝" })).toBeVisible();
  await expect(page.getByRole("button", { name: "暂不接收私信申请" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "申请中，查看联络页" })).toHaveCount(0);

  // When: a second A mutation rejects after navigation has returned to B.
  await page.evaluate((publicId) => {
    window.history.pushState({}, "", `/captains/${publicId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, PUBLIC_A);
  await expect(page.getByRole("heading", { name: "小橙" })).toBeVisible();
  await page.getByRole("button", { name: "申请私信" }).click();
  await expect.poll(() => heldMutations.length).toBe(2);
  await page.evaluate((publicId) => {
    window.history.pushState({}, "", `/captains/${publicId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, PUBLIC_B);
  await expect(page.getByRole("heading", { name: "小蓝" })).toBeVisible();
  await fulfillJson(heldMutations[1], { error: "过期操作错误" }, 409);

  // Then: the stale error is not surfaced on B.
  await expect(page.getByRole("heading", { name: "小蓝" })).toBeVisible();
  await expect(page.getByText("过期操作错误")).toHaveCount(0);
});

for (const state of [
  { status: 403, heading: "无权查看这位队长" },
  { status: 404, heading: "没有找到这位队长" },
  { status: 503, heading: "社区暂时不可用" },
] as const) {
  test(`Captain Profile renders the ${state.status} state with retry`, async ({ page }) => {
    // Given: the Profile endpoint returns a specific access or availability failure.
    await mockShell(page);
    await page.route(`**/api/advx/captains/${PUBLIC_B}/profile`, (route) => fulfillJson(route, { error: "服务端说明" }, state.status));

    // When: the public Captain route loads.
    await page.goto(`/captains/${PUBLIC_B}`);

    // Then: the page distinguishes the state and retains retry behavior.
    await expect(page.getByRole("heading", { name: state.heading })).toBeVisible();
    await expect(page.getByRole("button", { name: "重新加载" })).toBeVisible();
  });
}
