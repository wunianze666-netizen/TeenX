import path from "node:path";
import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";
import { nonOfficialArenaScore } from "./profile-fixtures";

const PUBLIC_A = `captain_v1_${"a".repeat(43)}`;
const PUBLIC_B = `captain_v1_${"b".repeat(43)}`;
const PUBLIC_C = `captain_v1_${"c".repeat(43)}`;
const PUBLIC_D = `captain_v1_${"d".repeat(43)}`;
const REQUEST_1 = "00000000-0000-4000-8000-000000000001";
const EVIDENCE_ROOT = process.env.TEENX_PROFILE_EVIDENCE_ROOT
  ? path.resolve(process.env.TEENX_PROFILE_EVIDENCE_ROOT)
  : path.resolve(import.meta.dirname, "../../output/playwright/teenx-profile-final-review");

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
  await page.route("**/discourse/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/session/current.json")) {
      return fulfillJson(route, { current_user: { username: "tx_abcdefghijklmnop", new_personal_messages_notifications_count: 2 } });
    }
    if (pathname.endsWith("/user_actions.json")) {
      return fulfillJson(route, { user_actions: [{ action_type: 4, created_at: "2026-07-24T08:00:00.000Z", slug: "team-notes", topic_id: 21, post_number: 1, post_id: 42, title: "第一次队伍试跑复盘", excerpt: "四位队员完成了任务拆解与复盘。" }] });
    }
    if (pathname.endsWith("/bookmarks.json")) {
      return fulfillJson(route, { bookmarks: [{ id: 7, created_at: "2026-07-23T08:00:00.000Z", slug: "prompt-notes", topic_id: 18, linked_post_number: 1, title: "怎样写清楚任务目标", excerpt: "一份适合新队长的清单。" }] });
    }
    if (pathname.endsWith("/summary.json")) return fulfillJson(route, { user_summary: { topic_count: 3, post_count: 8, bookmark_count: 1 } });
    if (pathname.includes("/topics/private-messages/")) return fulfillJson(route, { topic_list: { topics: [{ last_posted_at: "2026-07-24T09:00:00.000Z" }] } });
    return fulfillJson(route, {});
  });
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Visual QA requires a fixed viewport");
  await page.screenshot({
    path: path.join(EVIDENCE_ROOT, testInfo.project.name, `${name}.png`),
    animations: "disabled",
    fullPage: false,
  });
}

test("captures enhanced Me with owner-only Arena and Profile entries", async ({ page }, testInfo) => {
  await mockShell(page);
  await page.route("**/api/advx/me/contact-requests?box=inbox", (route) => fulfillJson(route, { items: [{ requestId: REQUEST_1, direction: "incoming", state: "pending", counterpart: { publicId: PUBLIC_B, nickname: "小蓝", avatarPath: null }, createdAt: "2026-07-20T00:00:00.000Z", expiresAt: "2026-07-27T00:00:00.000Z" }], nextCursor: null }));
  await page.route("**/api/advx/arena/challenges", (route) => fulfillJson(route, [{ id: "todo-web", version: 1, challengeVersionId: "todo-web-v1", title: "会记住的待办清单", description: "", goal: "", rules: "", submitType: "zip", opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2027-01-01T00:00:00.000Z", status: "open" }]));
  await page.route("**/api/advx/arena/challenges/todo-web-v1", (route) => fulfillJson(route, { id: "todo-web", version: 1, challengeVersionId: "todo-web-v1", title: "会记住的待办清单", description: "", goal: "", rules: "", submitType: "zip", opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2027-01-01T00:00:00.000Z", status: "open", dimensions: [], activeSubmission: null, latestSubmission: { id: "submission-1", challengeVersionId: "todo-web-v1", teamVersionId: "team-version-1", boundTeamVersion: { id: "team-version-1", versionNumber: 1, label: "Profile fixture", teamName: "光点小队", createdAt: "2026-07-21T00:00:00.000Z" }, filename: "entry.zip", byteSize: 120, sha256: "abc", createdAt: "2026-07-22T00:00:00.000Z", autoCreatedTeamVersion: false, run: { runId: "run-1", status: "completed", stage: "summary", completedDimensions: [], startedAt: "2026-07-22T00:00:00.000Z", finishedAt: "2026-07-22T00:01:00.000Z", failureCode: null, failureMessage: null, scoreWorkProductId: "score-1" } } }));
  await page.route("**/api/advx/arena/runs/run-1/result", (route) => fulfillJson(route, nonOfficialArenaScore));
  await page.goto("/me");
  await expect(page.getByRole("link", { name: /联络申请.*1/ })).toBeVisible();
  await expect(page.getByText("非官方评测 · 不计正式成绩")).toBeVisible();
  const privacyPhrases = page.locator(".me-privacy-note .profile-keep-together");
  await expect(privacyPhrases).toHaveText([
    "Studio 与论坛使用同一个队长身份。",
    "个人中心不会公开邮箱或模型配置。",
  ]);
  await expect(privacyPhrases.nth(0)).toHaveCSS("white-space", "nowrap");
  await expect(privacyPhrases.nth(1)).toHaveCSS("white-space", "nowrap");
  await page.getByRole("link", { name: "设置", exact: true }).focus();
  await capture(page, testInfo, "me");
});

test("captures settings and verifies both independent save sections", async ({ page }, testInfo) => {
  await mockShell(page);
  await page.route("**/api/advx/me/privacy", (route) => fulfillJson(route, route.request().method() === "GET" ? { showTeam: false, showForumActivity: false, acceptDmRequests: false } : { showTeam: true, showForumActivity: false, acceptDmRequests: true }));
  await page.route("**/api/advx/me/identity", (route) => fulfillJson(route, { profile: { publicId: PUBLIC_A, nickname: "小橙光", joinedAt: meSummary.profile.joinedAt } }));
  await page.goto("/me/settings");
  await page.getByLabel("队长昵称").fill("小橙光");
  await page.getByRole("button", { name: "保存身份" }).click();
  await page.getByText("接收私信申请").click();
  await page.getByText("展示我的队伍").click();
  await page.getByRole("button", { name: "保存隐私设置" }).click();
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: "隐私设置已保存" })).toBeVisible();
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 3_000 });
  await page.getByRole("heading", { name: "设置", exact: true }).scrollIntoViewIfNeeded();
  await page.getByLabel("队长昵称").focus();
  await capture(page, testInfo, "settings");
  await page.screenshot({
    path: path.join(EVIDENCE_ROOT, testInfo.project.name, "settings-full.png"),
    animations: "disabled",
    fullPage: true,
  });
});

test("captures contacts and exercises every relationship mutation", async ({ page }, testInfo) => {
  await mockShell(page);
  const request = { requestId: REQUEST_1, direction: "incoming", state: "pending", counterpart: { publicId: PUBLIC_B, nickname: "小蓝", avatarPath: null }, createdAt: "2026-07-20T00:00:00.000Z", expiresAt: "2026-07-27T00:00:00.000Z" };
  await page.route("**/api/advx/me/contact-requests?box=inbox", (route) => fulfillJson(route, { items: [request], nextCursor: null }));
  await page.route("**/api/advx/me/contact-requests?box=sent", (route) => fulfillJson(route, { items: [{ ...request, direction: "outgoing" }], nextCursor: null }));
  await page.route("**/api/advx/me/contacts?*", (route) => fulfillJson(route, { items: [
    { counterpart: { publicId: PUBLIC_B, nickname: "小蓝", avatarPath: null }, state: "approved", establishedAt: "2026-07-20T00:00:00.000Z", canMessage: true, canSever: true, canBlock: true, canUnblock: false },
    { counterpart: { publicId: PUBLIC_C, nickname: "小青", avatarPath: null }, state: "blocked", establishedAt: null, canMessage: false, canSever: false, canBlock: false, canUnblock: true },
    { counterpart: { publicId: PUBLIC_D, nickname: "小紫", avatarPath: null }, state: "approved", establishedAt: "2026-07-21T00:00:00.000Z", canMessage: false, canSever: false, canBlock: true, canUnblock: false },
  ], nextCursor: null }));
  await page.route("**/api/advx/contact-requests/**", (route) => fulfillJson(route, { ok: true }));
  await page.route("**/api/advx/contacts/**", (route) => fulfillJson(route, { ok: true }));
  await page.route(`**/api/advx/captains/${PUBLIC_B}/profile`, (route) => fulfillJson(route, { profile: { publicId: PUBLIC_B, nickname: "小蓝", avatarPath: null, joinedAt: null }, viewerActions: { isSelf: false, contactState: "approved", canRequestDm: false, canRespond: false, canMessage: true, canBlock: true, canUnblock: false, requestId: null, forumMessagePath: "/new-message?username=tx_abcdefghijklmnop" } }));
  await page.goto("/me/contacts");
  await page.getByRole("button", { name: "接受" }).focus();
  await capture(page, testInfo, "contacts-inbox");
  await page.getByRole("button", { name: "接受" }).click();
  await page.getByRole("button", { name: "发出的申请" }).click();
  await expect(page.locator("[data-request-id]")).toBeVisible();
  await page.getByRole("button", { name: "撤回申请" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认撤回" }).click();
  await page.getByRole("button", { name: "已授权联系人" }).click();
  await expect(page.locator("[data-contact-id]")).toHaveCount(3);
  await page.getByRole("button", { name: "撤销授权" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "撤销授权" }).click();
  await page.locator(`[data-contact-id="${PUBLIC_D}"]`).getByRole("button", { name: "屏蔽", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认屏蔽" }).click();
  await page.locator(`[data-contact-id="${PUBLIC_C}"]`).getByRole("button", { name: "解除屏蔽" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认解除" }).click();
  await expect(page.getByText("已解除屏蔽")).toBeVisible();
});

test("captures a safe public Captain profile and request transition", async ({ page }, testInfo) => {
  await mockShell(page);
  let requested = false;
  await page.route(`**/api/advx/captains/${PUBLIC_B}/profile`, (route) => fulfillJson(route, { profile: { publicId: PUBLIC_B, nickname: "小蓝", avatarPath: null, joinedAt: "2026-03-12T00:00:00.000Z" }, team: { name: "蓝图小队", memberCount: 4, versionCount: 3 }, forum: { username: "tx_bbbbbbbbbbbbbbbb", topicCount: 2, recentTopics: [{ id: "topic-1", title: "我们怎样分工完成第一次试跑", createdAt: "2026-07-22T00:00:00.000Z", path: "/t/team-work/24/1" }] }, viewerActions: { isSelf: false, contactState: requested ? "outgoing_pending" : "available", canRequestDm: !requested, canRespond: false, canMessage: false, canBlock: true, canUnblock: false, requestId: requested ? REQUEST_1 : null, forumMessagePath: null } }));
  await page.route("**/api/advx/contact-requests", async (route) => {
    requested = true;
    await fulfillJson(route, { ok: true });
  });
  await page.goto(`/captains/${PUBLIC_B}`);
  await expect(page.getByRole("heading", { name: "小蓝" })).toBeVisible();
  await page.getByRole("button", { name: "申请私信" }).focus();
  await capture(page, testInfo, "captain-public");
  await page.getByRole("button", { name: "申请私信" }).click();
  await expect(page.getByRole("link", { name: "申请中，查看联络页" })).toBeVisible();
  await expect(page.getByRole("main").getByText(/赛题|得分|排名|提交/)).toHaveCount(0);
});
