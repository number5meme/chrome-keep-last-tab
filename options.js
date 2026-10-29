const input = document.getElementById("url");
const status = document.getElementById("status");

chrome.storage.sync.get("startUrl").then(({ startUrl }) => {
  input.value = startUrl || "";
});

document.getElementById("save").addEventListener("click", async () => {
  let v = input.value.trim();
  if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v)) v = "https://" + v;
  input.value = v;
  await chrome.storage.sync.set({ startUrl: v });
  status.textContent = "Saved";
  setTimeout(() => (status.textContent = ""), 1500);
});
