#!/usr/bin/env node

import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const origin = new URL(process.argv[2] ?? "http://127.0.0.1:5174");
if (!new Set(["127.0.0.1", "localhost"]).has(origin.hostname)) {
  throw new TypeError("ADVX demo UI verification only accepts a loopback origin");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
const failedResponses = [];

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
});

const results = {};
try {
  await page.goto(new URL("/demo", origin).href, { waitUntil: "networkidle" });
  await page.waitForURL("**/studio");
  let arenaStatus = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await page.request.get(new URL("/api/advx/arena/challenges/todo-web%3Av1", origin).href);
    const detail = await response.json();
    arenaStatus = detail.latestSubmission?.run?.status ?? null;
    if (arenaStatus === "completed" || arenaStatus === "failed") break;
    await page.waitForTimeout(250);
  }
  results.studio = {
    url: page.url(),
    todoMakers: await page.getByText("Todo Makers", { exact: true }).count() > 0,
    coreTeam: await page.getByRole("heading", { name: "核心队员 4 人", exact: true }).count(),
    systemSupport: await page.getByText("系统辅助", { exact: true }).count(),
    arenaStatus,
  };

  await page.goto(new URL("/test-run", origin).href, { waitUntil: "networkidle" });
  await page.locator(".card").filter({ hasText: "做个待办清单" }).getByRole("button", { name: "开始试跑", exact: true }).click();
  results.testRun = {
    participantRows: await page.locator(".stack .row").count(),
    systemNote: await page.getByText("另有 2 位系统辅助角色保持后台待命。", { exact: true }).count(),
  };

  await page.goto(new URL("/forum", origin).href, { waitUntil: "networkidle" });
  results.community = {
    heading: await page.getByRole("heading", { name: "社区", exact: true }).count(),
    currentUser: await page.getByText("小创", { exact: true }).count(),
    categoryCounts: await page.locator(".demo-category-list strong").allTextContents(),
    discourseError: await page.getByText(/Discourse|暂时没有响应/u).count(),
  };

  await page.goto(new URL("/leaderboard", origin).href, { waitUntil: "networkidle" });
  results.leaderboard = {
    heading: await page.getByRole("heading", { name: "排行榜", exact: true }).count(),
    currentTeam: await page.getByText("我的队伍", { exact: true }).count(),
    score: await page.getByText("894", { exact: true }).count(),
  };

  await page.goto(new URL("/arena", origin).href, { waitUntil: "networkidle" });
  results.arena = {
    heading: await page.getByRole("heading", { name: "赛题", exact: true }).count(),
  };

  await page.goto(new URL("/me", origin).href, { waitUntil: "networkidle" });
  results.me = {
    todoMakers: await page.getByText("Todo Makers", { exact: true }).count() > 0,
    forumOffline: await page.getByText(/论坛暂时离线/u).count(),
  };

  await page.goto(new URL("/me/settings", origin).href, { waitUntil: "networkidle" });
  results.settings = {
    formCount: await page.locator(".settings-section").count(),
    privacyEnabled: !(await page.locator(".settings-toggle input").first().isDisabled()),
  };

  await page.goto(new URL("/me/contacts", origin).href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.querySelector(".contacts-card .profile-loading"));
  results.contacts = {
    cardCount: await page.locator(".contacts-card").count(),
    errorCount: await page.locator(".profile-list-notice").count(),
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL("/leaderboard", origin).href, { waitUntil: "networkidle" });
  results.mobile = await page.evaluate(() => ({
    viewport: window.innerWidth,
    pageWidth: document.documentElement.scrollWidth,
    scoreVisible: [...document.querySelectorAll("td")].some((node) => (
      node.textContent?.trim() === "894" && node.getBoundingClientRect().right <= window.innerWidth
    )),
  }));

  process.stdout.write(`${JSON.stringify({ results, consoleErrors, failedResponses }, null, 2)}\n`);
  assert.equal(results.studio.todoMakers, true);
  assert.equal(results.studio.coreTeam, 1);
  assert.equal(results.studio.systemSupport, 1);
  assert.equal(results.studio.arenaStatus, "completed");
  assert.deepEqual(results.testRun, { participantRows: 4, systemNote: 1 });
  assert.deepEqual(results.community, { heading: 1, currentUser: 1, categoryCounts: ["1", "1", "1"], discourseError: 0 });
  assert.deepEqual(results.leaderboard, { heading: 1, currentTeam: 1, score: 2 });
  assert.deepEqual(results.arena, { heading: 1 });
  assert.deepEqual(results.me, { todoMakers: true, forumOffline: 0 });
  assert.deepEqual(results.settings, { formCount: 2, privacyEnabled: true });
  assert.deepEqual(results.contacts, { cardCount: 1, errorCount: 0 });
  assert.deepEqual(results.mobile, { viewport: 390, pageWidth: 390, scoreVisible: true });
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedResponses, []);
} finally {
  await browser.close();
}
