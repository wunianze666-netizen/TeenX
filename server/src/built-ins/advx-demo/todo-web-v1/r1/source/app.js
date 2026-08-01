"use strict";

const STORAGE_KEY = "remember-todo:v1";
const VALID_FILTERS = new Set(["all", "active", "completed"]);
const elements = {
  form: document.querySelector("#todo-form"),
  input: document.querySelector("#todo-input"),
  inputError: document.querySelector("#input-error"),
  list: document.querySelector("#todo-list"),
  template: document.querySelector("#todo-template"),
  filters: document.querySelector("#filters"),
  emptyState: document.querySelector("#empty-state"),
  emptyCopy: document.querySelector("#empty-copy"),
  clearCompleted: document.querySelector("#clear-completed"),
  remaining: document.querySelector("#remaining-label"),
  progressValue: document.querySelector("#progress-value"),
  progressBar: document.querySelector("#progress-bar"),
  countAll: document.querySelector("#count-all"),
  countActive: document.querySelector("#count-active"),
  countCompleted: document.querySelector("#count-completed"),
  notice: document.querySelector("#notice"),
  noticeText: document.querySelector("#notice-text"),
  undo: document.querySelector("#undo-button"),
};

let noticeTimer = 0;
let lastRemoval = null;
const state = loadState();

function isTodo(value) {
  return value && typeof value === "object"
    && typeof value.id === "string"
    && typeof value.text === "string"
    && value.text.trim().length > 0
    && value.text.length <= 160
    && typeof value.completed === "boolean"
    && Number.isFinite(value.createdAt);
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return { tasks: [], filter: "all", storageHealthy: true };
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.filter(isTodo).map((task) => ({ ...task, text: task.text.trim() })) : [];
    const filter = VALID_FILTERS.has(parsed.filter) ? parsed.filter : "all";
    return { tasks, filter, storageHealthy: true };
  } catch {
    return { tasks: [], filter: "all", storageHealthy: false };
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: state.tasks, filter: state.filter }));
    state.storageHealthy = true;
  } catch {
    state.storageHealthy = false;
    showNotice("Tasks are kept for this visit, but browser storage is unavailable.", false, 0);
  }
}

function showNotice(message, canUndo = false, duration = 3200) {
  window.clearTimeout(noticeTimer);
  elements.noticeText.textContent = message;
  elements.undo.hidden = !canUndo;
  elements.notice.hidden = false;
  if (duration > 0) noticeTimer = window.setTimeout(() => { elements.notice.hidden = true; }, duration);
}

function visibleTasks() {
  if (state.filter === "active") return state.tasks.filter((task) => !task.completed);
  if (state.filter === "completed") return state.tasks.filter((task) => task.completed);
  return state.tasks;
}

function render() {
  elements.list.replaceChildren();
  const tasks = visibleTasks();
  for (const task of tasks) {
    const row = elements.template.content.firstElementChild.cloneNode(true);
    row.dataset.id = task.id;
    row.classList.toggle("completed", task.completed);
    const checkbox = row.querySelector("input[type=checkbox]");
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `${task.completed ? "Mark active" : "Mark complete"}: ${task.text}`);
    row.querySelector(".todo-text").textContent = task.text;
    row.querySelector(".edit").setAttribute("aria-label", `Edit: ${task.text}`);
    row.querySelector(".delete").setAttribute("aria-label", `Delete: ${task.text}`);
    elements.list.append(row);
  }

  const activeCount = state.tasks.filter((task) => !task.completed).length;
  const completedCount = state.tasks.length - activeCount;
  const progress = state.tasks.length === 0 ? 0 : Math.round((completedCount / state.tasks.length) * 100);
  elements.countAll.textContent = String(state.tasks.length);
  elements.countActive.textContent = String(activeCount);
  elements.countCompleted.textContent = String(completedCount);
  elements.remaining.textContent = activeCount === 0 ? "Nothing waiting" : `${activeCount} ${activeCount === 1 ? "task" : "tasks"} waiting`;
  elements.progressValue.textContent = `${progress}%`;
  elements.progressBar.style.setProperty("--progress", String(progress / 100));
  elements.clearCompleted.disabled = completedCount === 0;
  elements.emptyState.hidden = tasks.length > 0;
  elements.emptyCopy.textContent = state.tasks.length === 0 ? "Add one clear next step above." : "No tasks match this filter.";
  for (const button of elements.filters.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.filter === state.filter));
}

function addTask(text) {
  state.tasks.unshift({ id: crypto.randomUUID(), text, completed: false, createdAt: Date.now() });
  state.filter = "all";
  persist();
  render();
  showNotice("Task added.");
}

function removeTasks(predicate, message) {
  const removed = state.tasks.filter(predicate);
  if (removed.length === 0) return;
  lastRemoval = state.tasks.map((task) => ({ ...task }));
  state.tasks = state.tasks.filter((task) => !predicate(task));
  persist();
  render();
  showNotice(message, true, 6000);
}

function beginEdit(row, task) {
  const text = row.querySelector(".todo-text");
  const input = document.createElement("input");
  input.className = "edit-input";
  input.value = task.text;
  input.maxLength = 160;
  input.setAttribute("aria-label", `Edit task: ${task.text}`);
  text.replaceWith(input);
  input.focus();
  input.select();
  let settled = false;
  const finish = (save) => {
    if (settled) return;
    settled = true;
    const nextText = input.value.trim();
    if (save && nextText) {
      task.text = nextText;
      persist();
      showNotice("Task updated.");
    }
    render();
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") finish(true);
    if (event.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = elements.input.value.trim();
  const valid = text.length > 0;
  elements.input.setAttribute("aria-invalid", String(!valid));
  elements.inputError.textContent = valid ? "" : "Write a task before adding it.";
  if (!valid) { elements.input.focus(); return; }
  addTask(text);
  elements.form.reset();
  elements.input.setAttribute("aria-invalid", "false");
  elements.input.focus();
});

elements.filters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  persist();
  render();
});

elements.list.addEventListener("click", (event) => {
  const row = event.target.closest(".todo-item");
  if (!row) return;
  const task = state.tasks.find((item) => item.id === row.dataset.id);
  if (!task) return;
  if (event.target.matches("input[type=checkbox]")) {
    task.completed = event.target.checked;
    persist();
    render();
    showNotice(task.completed ? "Task completed." : "Task reopened.");
  } else if (event.target.matches(".edit")) beginEdit(row, task);
  else if (event.target.matches(".delete")) removeTasks((item) => item.id === task.id, "Task deleted.");
});

elements.clearCompleted.addEventListener("click", () => removeTasks((task) => task.completed, "Completed tasks cleared."));
elements.undo.addEventListener("click", () => {
  if (!lastRemoval) return;
  state.tasks = lastRemoval;
  lastRemoval = null;
  persist();
  render();
  showNotice("Deletion undone.");
});

render();
if (!state.storageHealthy) showNotice("Stored data could not be read. Starting with a safe empty list.", false, 0);
