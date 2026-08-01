const storageKey = "teenx-interactive-demo-v2";
const defaultState = {
  teamName: "Todo Makers",
  captainName: "小创",
  bio: "正在把点子变成作品",
  version: 1,
  extraMembers: [],
  customPosts: [],
  savedTopics: 0,
  taskTitle: "会记住的待办清单",
  taskDescription: "制作一个支持新增、完成、删除和本地保存的网页待办工具，手机上也要容易使用。",
  todos: [
    { id: 1, text: "整理今天最重要的任务", done: true },
    { id: 2, text: "完成作品首页", done: false },
    { id: 3, text: "邀请挑刺员检查", done: false },
  ],
};

let state;
try {
  state = { ...defaultState, ...JSON.parse(localStorage.getItem(storageKey) || "{}") };
} catch {
  state = { ...defaultState };
}

const panels = [...document.querySelectorAll("[data-panel]")];
const navButtons = [...document.querySelectorAll("[data-nav]")];
const toast = document.querySelector("#toast");
const runReady = document.querySelector("#run-ready");
const runProgress = document.querySelector("#run-progress");
const runResult = document.querySelector("#run-result");
const memberModal = document.querySelector("#member-modal");
let toastTimer;
let runTimers = [];
let todoFilter = "all";

const presets = {
  todo: { title: "会记住的待办清单", description: "制作一个支持新增、完成、删除和本地保存的网页待办工具，手机上也要容易使用。" },
  study: { title: "一周学习计划器", description: "制作一个能按科目安排本周任务、标记进度并提醒复习重点的学习计划工具。" },
  event: { title: "校园创意节活动页", description: "制作一个介绍校园创意节、展示时间表并支持活动报名的响应式网页。" },
  custom: { title: "", description: "" },
};

const rankings = {
  todo: [
    ["Pixel Pioneers", "09:10", 926], ["Todo Makers", "10:42", 894], ["Logic Lab", "12:30", 861], ["Spark Studio", "15:40", 824], ["Code Crafters", "11:05", 788],
  ],
  study: [
    ["Logic Lab", "08:54", 918], ["Spark Studio", "10:18", 881], ["Todo Makers", "11:09", 856], ["Pixel Pioneers", "13:02", 840], ["Code Crafters", "14:44", 799],
  ],
  event: [
    ["Spark Studio", "16:11", 934], ["Pixel Pioneers", "14:40", 912], ["Code Crafters", "17:05", 875], ["Todo Makers", "18:20", 842], ["Logic Lab", "20:03", 818],
  ],
};

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
}

function showView(name, updateHash = true) {
  const safeName = panels.some((panel) => panel.dataset.panel === name) ? name : "landing";
  panels.forEach((panel) => { panel.hidden = panel.dataset.panel !== safeName; });
  document.body.classList.toggle("landing-mode", safeName === "landing");
  navButtons.forEach((button) => {
    const selected = button.dataset.nav === safeName;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  if (updateHash) history.replaceState(null, "", `#${safeName}`);
  if (safeName === "landing") requestAnimationFrame(resizeLandingCanvas);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const landingCanvas = document.querySelector("#landing-canvas");
const landingHero = document.querySelector(".landing-hero");
const landingContext = landingCanvas.getContext("2d");
const landingPointer = { x: 0.72, y: 0.34, targetX: 0.72, targetY: 0.34 };
const reduceLandingMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function resizeLandingCanvas() {
  const rect = landingCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  landingCanvas.width = Math.round(rect.width * ratio);
  landingCanvas.height = Math.round(rect.height * ratio);
  landingContext.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawLandingCanvas(time = 0) {
  const width = landingCanvas.clientWidth;
  const height = landingCanvas.clientHeight;
  if (width && height) {
    landingPointer.x += (landingPointer.targetX - landingPointer.x) * 0.04;
    landingPointer.y += (landingPointer.targetY - landingPointer.y) * 0.04;
    landingContext.clearRect(0, 0, width, height);

    landingContext.fillStyle = "rgb(255, 247, 239)";
    landingContext.fillRect(0, 0, width, height);
    landingContext.save();
    const bandWidth = Math.max(92, width / 9.5);
    const drift = reduceLandingMotion ? 0 : Math.sin(time * 0.00018) * bandWidth * 0.18;
    const pointerShift = (landingPointer.x - 0.5) * bandWidth * 0.8;
    const slant = -0.34 + (landingPointer.y - 0.5) * 0.05;
    landingContext.transform(1, 0, slant, 1, 0, 0);
    landingContext.translate(drift + pointerShift - bandWidth * 2, -height * 0.2);

    for (let index = -2; index < 16; index += 1) {
      const x = index * bandWidth;
      const strength = 0.42 + ((index + 16) % 4) * 0.1;
      landingContext.fillStyle = `rgba(244, 133, 41, ${strength})`;
      landingContext.fillRect(x, 0, bandWidth * 0.78, height * 1.5);

      landingContext.shadowBlur = 24;
      landingContext.shadowColor = "rgba(255, 255, 255, 0.92)";
      landingContext.fillStyle = "rgba(255, 255, 255, 0.72)";
      landingContext.fillRect(x + bandWidth * 0.58, 0, bandWidth * 0.19, height * 1.5);
      landingContext.shadowBlur = 0;

      landingContext.fillStyle = "rgba(255, 255, 255, 0.28)";
      landingContext.fillRect(x + bandWidth * 0.04, 0, bandWidth * 0.11, height * 1.5);
    }
    landingContext.restore();

    landingContext.fillStyle = "rgba(255, 255, 255, 0.14)";
    landingContext.fillRect(0, height * 0.72, width, height * 0.28);
  }
  if (!reduceLandingMotion) requestAnimationFrame(drawLandingCanvas);
}

landingHero.addEventListener("pointermove", (event) => {
  const rect = landingCanvas.getBoundingClientRect();
  landingPointer.targetX = (event.clientX - rect.left) / rect.width;
  landingPointer.targetY = (event.clientY - rect.top) / rect.height;
});
landingHero.addEventListener("pointerleave", () => {
  landingPointer.targetX = 0.72;
  landingPointer.targetY = 0.34;
});
window.addEventListener("resize", resizeLandingCanvas);
resizeLandingCanvas();
drawLandingCanvas();

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => { element.textContent = value; });
}

function createMemberCard(member) {
  const article = document.createElement("article");
  article.className = "member-card added";
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = member.role.slice(0, 2).toUpperCase();
  const heading = document.createElement("div");
  const name = document.createElement("h3");
  name.textContent = member.name;
  const role = document.createElement("span");
  role.className = "pill blue";
  role.textContent = member.role;
  heading.append(name, role);
  const description = document.createElement("p");
  description.textContent = member.skill;
  const footer = document.createElement("footer");
  footer.textContent = "自定义队员 · 状态 idle";
  article.append(avatar, heading, description, footer);
  return article;
}

function renderMembers() {
  document.querySelectorAll("#member-grid .added").forEach((card) => card.remove());
  state.extraMembers.forEach((member) => document.querySelector("#member-grid").append(createMemberCard(member)));
  setText("[data-member-count]", String(4 + state.extraMembers.length));
}

function createTopic(post) {
  const article = document.createElement("article");
  article.className = "topic new-topic";
  const head = document.createElement("button");
  head.type = "button";
  head.className = "topic-head";
  head.setAttribute("aria-expanded", "true");
  const kind = document.createElement("span");
  kind.className = "topic-kind blue";
  kind.textContent = post.kind;
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = post.title;
  const meta = document.createElement("small");
  meta.textContent = `${state.captainName} · ${state.teamName} · 刚刚`;
  copy.append(title, meta);
  const replies = document.createElement("b");
  replies.textContent = "0 回复";
  head.append(kind, copy, replies);
  const body = document.createElement("div");
  body.className = "topic-body";
  const paragraph = document.createElement("p");
  paragraph.textContent = post.body;
  const actions = document.createElement("div");
  actions.className = "topic-actions";
  const like = document.createElement("button");
  like.type = "button";
  like.className = "like";
  like.textContent = "赞 0";
  const bookmark = document.createElement("button");
  bookmark.type = "button";
  bookmark.className = "bookmark";
  bookmark.textContent = "收藏";
  actions.append(like, bookmark);
  body.append(paragraph, actions);
  article.append(head, body);
  return article;
}

function renderPosts() {
  document.querySelectorAll("#topic-list .new-topic").forEach((topic) => topic.remove());
  [...state.customPosts].reverse().forEach((post) => document.querySelector("#topic-list").prepend(createTopic(post)));
  document.querySelector("#topic-stat").textContent = String(3 + state.customPosts.length);
  document.querySelector("#save-stat").textContent = String(state.savedTopics);
}

function renderTodos() {
  const list = document.querySelector("#todo-list");
  list.replaceChildren();
  const visible = state.todos.filter((todo) => todoFilter === "all" || (todoFilter === "done" ? todo.done : !todo.done));
  visible.forEach((todo) => {
    const item = document.createElement("li");
    item.dataset.todoId = String(todo.id);
    if (todo.done) item.classList.add("done");
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.className = "todo-check";
    const text = document.createElement("span");
    text.textContent = todo.text;
    label.append(checkbox, text);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "todo-delete";
    remove.setAttribute("aria-label", `删除 ${todo.text}`);
    remove.textContent = "×";
    item.append(label, remove);
    list.append(item);
  });
  document.querySelector(".product-preview header > span").textContent = `${state.todos.length} 项`;
}

function renderRanking(scope = "all") {
  const challenge = document.querySelector("#challenge-filter").value;
  const rows = rankings[challenge];
  const shown = scope === "following" ? rows.filter((row) => ["Todo Makers", "Pixel Pioneers", "Logic Lab"].includes(row[0])) : rows;
  const body = document.querySelector("#rank-body");
  body.replaceChildren();
  shown.forEach((row) => {
    const index = rows.findIndex((candidate) => candidate[0] === row[0]);
    const tr = document.createElement("tr");
    if (row[0] === "Todo Makers") tr.className = "current";
    [String(index + 1), row[0], row[1], String(row[2])].forEach((value, cellIndex) => {
      const cell = document.createElement("td");
      if (cellIndex === 1) {
        const strong = document.createElement("strong");
        strong.textContent = value;
        cell.append(strong);
        if (value === "Todo Makers") {
          const badge = document.createElement("span");
          badge.className = "pill";
          badge.textContent = "当前队伍";
          cell.append(badge);
        }
      } else cell.textContent = value;
      tr.append(cell);
    });
    body.append(tr);
  });
  const myIndex = rows.findIndex((row) => row[0] === "Todo Makers");
  document.querySelector("#my-rank").textContent = `#${myIndex + 1}`;
  document.querySelector("#my-score").textContent = String(rows[myIndex][2]);
}

function hydrate() {
  setText("[data-team-name]", state.teamName);
  setText("[data-captain-name]", state.captainName);
  setText("[data-profile-name]", state.captainName);
  setText("[data-avatar]", state.captainName.slice(0, 2));
  setText("[data-version]", `v${state.version}`);
  setText("[data-version-count]", String(state.version));
  document.querySelector("#profile-bio").textContent = state.bio;
  document.querySelector("#task-title").value = state.taskTitle;
  document.querySelector("#task-description").value = state.taskDescription;
  document.querySelector("#task-char-count").textContent = String(state.taskDescription.length);
  renderMembers();
  renderPosts();
  renderTodos();
  renderRanking();
}

document.addEventListener("click", (event) => {
  const navigation = event.target.closest("[data-nav], [data-go]");
  if (navigation) showView(navigation.dataset.nav || navigation.dataset.go);

  const topicHead = event.target.closest(".topic-head");
  if (topicHead) {
    const body = topicHead.nextElementSibling;
    const expanded = topicHead.getAttribute("aria-expanded") === "true";
    topicHead.setAttribute("aria-expanded", String(!expanded));
    body.hidden = expanded;
  }

  const like = event.target.closest(".like");
  if (like) {
    const liked = like.classList.toggle("liked");
    const current = Number(like.textContent.match(/\d+/)?.[0] || 0);
    like.textContent = `赞 ${liked ? current + 1 : Math.max(0, current - 1)}`;
    showToast(liked ? "已点赞" : "已取消点赞");
  }

  const bookmark = event.target.closest(".bookmark");
  if (bookmark) {
    const saved = bookmark.classList.toggle("saved");
    bookmark.textContent = saved ? "已收藏" : "收藏";
    state.savedTopics = Math.max(0, state.savedTopics + (saved ? 1 : -1));
    document.querySelector("#save-stat").textContent = String(state.savedTopics);
    saveState();
    showToast(saved ? "已加入收藏" : "已取消收藏");
  }
});

document.querySelector("#rename-team").addEventListener("click", () => {
  const nextName = prompt("输入新的队伍名称", state.teamName)?.trim();
  if (!nextName) return;
  state.teamName = nextName.slice(0, 24);
  saveState();
  hydrate();
  showToast("队伍名称已更新");
});

document.querySelector("#save-version").addEventListener("click", () => {
  state.version += 1;
  saveState();
  hydrate();
  showToast(`已封存队伍版本 v${state.version}`);
});

document.querySelector("#open-member-modal").addEventListener("click", () => memberModal.showModal());
document.querySelector("#close-member-modal").addEventListener("click", () => memberModal.close());
document.querySelector("#cancel-member").addEventListener("click", () => memberModal.close());
document.querySelector("#member-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const member = {
    role: document.querySelector("#member-role").value,
    name: document.querySelector("#member-name").value.trim(),
    skill: document.querySelector("#member-skill").value.trim(),
  };
  if (!member.name || !member.skill) return;
  state.extraMembers.push(member);
  saveState();
  renderMembers();
  event.currentTarget.reset();
  memberModal.close();
  showToast(`${member.name} 已加入队伍`);
});

document.querySelector("#task-preset").addEventListener("change", (event) => {
  const preset = presets[event.target.value];
  document.querySelector("#task-title").value = preset.title;
  document.querySelector("#task-description").value = preset.description;
  document.querySelector("#task-char-count").textContent = String(preset.description.length);
  if (event.target.value === "custom") document.querySelector("#task-title").focus();
});

document.querySelector("#task-description").addEventListener("input", (event) => {
  document.querySelector("#task-char-count").textContent = String(event.target.value.length);
});

function stopRun() {
  runTimers.forEach(clearTimeout);
  runTimers = [];
}

document.querySelector("#task-form").addEventListener("submit", (event) => {
  event.preventDefault();
  stopRun();
  state.taskTitle = document.querySelector("#task-title").value.trim();
  state.taskDescription = document.querySelector("#task-description").value.trim();
  saveState();
  runReady.hidden = true;
  runResult.hidden = true;
  runProgress.hidden = false;
  const steps = [...document.querySelectorAll("#live-steps li")];
  const statusCopy = ["提取目标、用户与约束", "生成三种交互方向", "制作可操作网页产物", "执行功能与体验检查"];
  steps.forEach((step) => {
    step.className = "";
    step.querySelector("small").textContent = "等待任务";
    step.querySelector("b").textContent = "等待";
  });
  document.querySelector("#run-percent").textContent = "0%";
  document.querySelector("#progress-bar").style.width = "0%";
  steps.forEach((step, index) => {
    runTimers.push(setTimeout(() => {
      steps.forEach((item, itemIndex) => {
        if (itemIndex < index) { item.className = "done"; item.querySelector("b").textContent = "完成"; }
      });
      step.className = "active";
      step.querySelector("small").textContent = statusCopy[index];
      step.querySelector("b").textContent = "进行中";
      const percent = (index + 1) * 25;
      document.querySelector("#run-percent").textContent = `${percent}%`;
      document.querySelector("#progress-bar").style.width = `${percent}%`;
    }, index * 720));
  });
  runTimers.push(setTimeout(() => {
    steps.forEach((step) => { step.className = "done"; step.querySelector("b").textContent = "完成"; });
    runProgress.hidden = true;
    runResult.hidden = false;
    document.querySelector("#product-title").textContent = state.taskTitle;
    document.querySelector("[data-arena-title]").textContent = state.taskTitle;
    document.querySelector("#activity-scout").textContent = `已整理“${state.taskTitle}”的核心功能和边界`;
    showToast("试跑完成 · 已生成可操作产物");
  }, 3300));
});

document.querySelector("#cancel-run").addEventListener("click", () => {
  stopRun();
  runProgress.hidden = true;
  runReady.hidden = false;
  showToast("试跑已停止，可以修改任务");
});

document.querySelector("#replay-run").addEventListener("click", () => {
  runResult.hidden = true;
  runReady.hidden = false;
});

document.querySelectorAll("[data-result-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-result-tab]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll("[data-result-panel]").forEach((panel) => { panel.hidden = panel.dataset.resultPanel !== button.dataset.resultTab; });
  });
});

document.querySelector("#todo-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#todo-input");
  const text = input.value.trim();
  if (!text) return;
  state.todos.push({ id: Date.now(), text, done: false });
  input.value = "";
  saveState();
  renderTodos();
});

document.querySelector("#todo-list").addEventListener("change", (event) => {
  if (!event.target.matches(".todo-check")) return;
  const id = Number(event.target.closest("li").dataset.todoId);
  const todo = state.todos.find((item) => item.id === id);
  if (todo) todo.done = event.target.checked;
  saveState();
  renderTodos();
});

document.querySelector("#todo-list").addEventListener("click", (event) => {
  const button = event.target.closest(".todo-delete");
  if (!button) return;
  const id = Number(button.closest("li").dataset.todoId);
  state.todos = state.todos.filter((todo) => todo.id !== id);
  saveState();
  renderTodos();
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    todoFilter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderTodos();
  });
});

document.querySelectorAll("[data-arena-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-arena-view]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll("[data-arena-panel]").forEach((panel) => { panel.hidden = panel.dataset.arenaPanel !== button.dataset.arenaView; });
  });
});

document.querySelector("#rerun-judge").addEventListener("click", () => {
  const score = document.querySelector("#arena-score");
  const label = document.querySelector("#score-label");
  score.textContent = "---";
  label.textContent = "正在评审";
  setTimeout(() => { score.textContent = "894"; label.textContent = "评审完成"; showToast("评审完成 · 结果保持稳定"); }, 1200);
});

document.querySelector("#toggle-composer").addEventListener("click", () => {
  const form = document.querySelector("#post-form");
  form.hidden = !form.hidden;
  if (!form.hidden) document.querySelector("#post-title").focus();
});
document.querySelector("#cancel-post").addEventListener("click", () => { document.querySelector("#post-form").hidden = true; });
document.querySelector("#post-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const post = { kind: document.querySelector("#post-kind").value, title: document.querySelector("#post-title").value.trim(), body: document.querySelector("#post-body").value.trim() };
  if (!post.title || !post.body) return;
  state.customPosts.push(post);
  saveState();
  renderPosts();
  event.currentTarget.reset();
  event.currentTarget.hidden = true;
  showToast("主题已发布到队长社区");
});

document.querySelector("#challenge-filter").addEventListener("change", () => renderRanking(document.querySelector("[data-rank-scope].active")?.dataset.rankScope || "all"));
document.querySelectorAll("[data-rank-scope]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-rank-scope]").forEach((item) => item.classList.toggle("active", item === button));
    renderRanking(button.dataset.rankScope);
  });
});

document.querySelector("#edit-profile").addEventListener("click", () => {
  document.querySelector("#profile-name-input").value = state.captainName;
  document.querySelector("#profile-bio-input").value = state.bio;
  document.querySelector("#profile-form").hidden = false;
  document.querySelector("#profile-name-input").focus();
});
document.querySelector("#cancel-profile").addEventListener("click", () => { document.querySelector("#profile-form").hidden = true; });
document.querySelector("#profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.captainName = document.querySelector("#profile-name-input").value.trim();
  state.bio = document.querySelector("#profile-bio-input").value.trim();
  saveState();
  hydrate();
  event.currentTarget.hidden = true;
  showToast("队长资料已保存");
});

document.querySelectorAll(".toggle-list input").forEach((input) => input.addEventListener("change", () => showToast("公开设置已更新")));
document.querySelector("#reset-demo").addEventListener("click", () => {
  if (!confirm("确定重置所有演示数据吗？")) return;
  localStorage.removeItem(storageKey);
  location.hash = "studio";
  location.reload();
});

window.addEventListener("hashchange", () => showView(location.hash.slice(1), false));
hydrate();
showView(location.hash.slice(1) || "landing", false);
