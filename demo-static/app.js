const panels = [...document.querySelectorAll("[data-panel]")];
const navButtons = [...document.querySelectorAll("[data-nav]")];
const toast = document.querySelector("#toast");
let toastTimer;

function showView(name, updateHash = true) {
  const safeName = panels.some((panel) => panel.dataset.panel === name) ? name : "studio";
  panels.forEach((panel) => { panel.hidden = panel.dataset.panel !== safeName; });
  navButtons.forEach((button) => {
    const selected = button.dataset.nav === safeName;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  if (updateHash) history.replaceState(null, "", `#${safeName}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}

document.addEventListener("click", (event) => {
  const navigation = event.target.closest("[data-nav], [data-go]");
  if (navigation) showView(navigation.dataset.nav || navigation.dataset.go);

  const toastButton = event.target.closest("[data-toast]");
  if (toastButton) showToast(toastButton.dataset.toast);
});

const runReady = document.querySelector("#run-ready");
const runProgress = document.querySelector("#run-progress");
const runResult = document.querySelector("#run-result");

document.querySelector("#start-run").addEventListener("click", () => {
  runReady.hidden = true;
  runResult.hidden = true;
  runProgress.hidden = false;
  setTimeout(() => {
    runProgress.hidden = true;
    runResult.hidden = false;
    showToast("试跑完成 · 已生成 1 个产物");
  }, 900);
});

document.querySelector("#replay-run").addEventListener("click", () => {
  runResult.hidden = true;
  runReady.hidden = false;
});

document.querySelectorAll(".topic-head").forEach((button) => {
  button.addEventListener("click", () => {
    const body = button.nextElementSibling;
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    body.hidden = expanded;
  });
});

document.querySelectorAll(".bookmark").forEach((button) => {
  button.addEventListener("click", () => {
    const saved = button.classList.toggle("saved");
    button.textContent = saved ? "已收藏" : "收藏";
    showToast(saved ? "已加入收藏" : "已取消收藏");
  });
});

window.addEventListener("hashchange", () => showView(location.hash.slice(1), false));
showView(location.hash.slice(1) || "studio", false);
