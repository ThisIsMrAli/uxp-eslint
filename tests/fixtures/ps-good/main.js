const { entrypoints, shell, storage } = require("uxp");
const { app, core, action } = require("photoshop");
const fs = require("fs");

entrypoints.setup({
  panels: { mainPanel: { show() {} } },
  commands: { runIt: () => run() },
});

async function edit() {
  await action.batchPlay([{ _obj: "make", _target: [{ _ref: "layer" }] }], {});
  app.activeDocument.activeLayers[0].opacity = 40;
}

async function run() {
  try {
    await core.executeAsModal(edit, { commandName: "Edit" });
  } catch (e) {
    console.error(e);
  }
  await fetch("https://cdn.example.com/asset.png");
  await shell.openPath("/Users/me/Exports");
  const tree = await core.getLayerTree();
  try { fs.lstatSync("plugin-data:/cache.json"); } catch {}
  await storage.localFileSystem.getFileForOpening();
  await navigator.clipboard.writeText("copied");
  alert("done");
  new ResizeObserver(() => {}).observe(document.body);
  return tree;
}

document.getElementById("go").addEventListener("keydown", () => {});
