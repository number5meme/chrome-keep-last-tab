// Keep Last Tab
// Chrome closes a window the moment its last tab is closed, before any extension
// event can react. So while only one regular window is open, we keep a "guard"
// tab in it (pinned, inactive, already showing the start page). When the user
// closes the last regular tab, only the guard remains: we first add a fresh guard,
// then unpin the old one so it becomes the visible start page. This way a guard
// already exists before the next Cmd+W, even when the keys are pressed quickly.
// If the user unpins a guard or browses in it, it becomes a normal tab.

const GUARDS_KEY = "guardTabIds";
const NEW_TAB = "chrome://newtab/";
// Guards restored by Chrome from a previous session cannot be told apart from
// the user's own pinned tabs, so they are never closed automatically.

let guards = null; // in-memory cache of guard tab ids
async function loadGuards() {
  if (!guards) {
    const data = await chrome.storage.session.get(GUARDS_KEY);
    guards = new Set(data[GUARDS_KEY] || []);
  }
  return guards;
}
function saveGuards() {
  return chrome.storage.session.set({ [GUARDS_KEY]: [...guards] });
}

async function getStartUrl() {
  const { startUrl } = await chrome.storage.sync.get("startUrl");
  return (startUrl || "").trim() || undefined; // undefined = Chrome's New Tab page
}

async function createGuard(windowId) {
  const url = await getStartUrl();
  const tab = await chrome.tabs.create({
    windowId, index: 0, pinned: true, active: false, ...(url ? { url } : {}),
  });
  guards.add(tab.id);
  await saveGuards();
  return tab;
}

// Serialize all work so events never interleave.
let chain = Promise.resolve();
function enqueue(fn) {
  chain = chain.then(fn).catch((err) => {
    // e.g. "Tabs cannot be edited right now (user may be dragging a tab)"
    console.debug("Keep Last Tab:", err && err.message);
    setTimeout(() => enqueue(reconcile), 250);
  });
  return chain;
}

const toRelease = new Set(); // guards the user unpinned or browsed in

async function unpinAsNormal(id, makeActive) {
  guards.delete(id);
  await chrome.tabs.update(id, { pinned: false, ...(makeActive ? { active: true } : {}) });
}

async function reconcile() {
  await loadGuards();
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const onlyOneWindow = windows.length === 1;

  const alive = new Set();
  const perWindow = [];
  for (const w of windows) {
    const tabs = await chrome.tabs.query({ windowId: w.id }); // fresh state
    for (const t of tabs) alive.add(t.id);
    perWindow.push({ w, tabs });
  }
  for (const id of [...guards]) if (!alive.has(id)) guards.delete(id);
  for (const id of [...toRelease]) if (!guards.has(id)) toRelease.delete(id);

  for (const { w, tabs } of perWindow) {
    const guardTabs = tabs.filter((t) => guards.has(t.id));
    const regular = tabs.filter((t) => !guards.has(t.id));
    const released = guardTabs.filter((t) => toRelease.has(t.id));
    const kept = guardTabs.filter((t) => !toRelease.has(t.id));
    released.forEach((t) => toRelease.delete(t.id));

    if (!onlyOneWindow) {
      for (const t of released) await unpinAsNormal(t.id, false).catch(() => {});
      for (const t of kept) {
        guards.delete(t.id);
        await chrome.tabs.remove(t.id).catch(() => {});
      }
      continue;
    }

    // Every path below adds the new guard BEFORE any old guard turns into a
    // normal tab, so the window always has a guard when the next Cmd+W arrives.
    let toShow = [...released];
    if (regular.length === 0 && toShow.length === 0 && kept.length > 0) {
      toShow = [kept.shift()]; // last regular tab closed: reveal a guard
    }

    if (kept.length === 0) await createGuard(w.id);
    for (const e of kept.slice(1)) {
      guards.delete(e.id);
      await chrome.tabs.remove(e.id).catch(() => {});
    }

    for (const t of toShow) {
      await unpinAsNormal(t.id, regular.length === 0).catch(() => {});
    }
  }

  await saveGuards();
}

const run = () => enqueue(reconcile);

chrome.tabs.onRemoved.addListener((tabId, info) => {
  if (!info.isWindowClosing) run();
});
chrome.tabs.onCreated.addListener(run);
chrome.tabs.onAttached.addListener(run);
chrome.tabs.onDetached.addListener(run);
chrome.windows.onCreated.addListener(run);
chrome.windows.onRemoved.addListener(run);
// Just switching to a guard (e.g. Cmd+1) does not change it. It becomes a normal
// tab only when the user unpins it, or navigates in it while it is the active tab
// (inactive guards loading or redirecting their start page are ignored).
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (!(await loadGuards()).has(tabId)) return;
  if (change.pinned === false || (change.url && tab.active)) {
    toRelease.add(tabId);
    run();
  }
});
chrome.runtime.onStartup.addListener(run);
chrome.runtime.onInstalled.addListener(run);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.startUrl) return;
  enqueue(async () => {
    await loadGuards();
    const url = (await getStartUrl()) || NEW_TAB;
    for (const id of guards) await chrome.tabs.update(id, { url }).catch(() => {});
  });
});

run();
