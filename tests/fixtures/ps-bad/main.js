const { entrypoints, shell, storage } = require("uxp");
const { app, core, action } = require("photoshop");
const fs = require("fs");
const http = require("http");

entrypoints.setup({
  panels: { mainPanl: { show() {} } },
  commands: { runIt: () => run() },
});

async function run() {
  await action.batchPlay([{ _obj: "make", _target: [{ _ref: "layer" }] }], {});
  app.activeDocument.activeLayers[0].opacity = 40;
  await fetch("https://cdn.other.com/asset.png");
  shell.openPath("/Users/me/Exports");
  const tree = core.getLayerTree();
  fs.existsSync("plugin-data:/cache.json");
  await storage.localFileSystem.getFileForOpening();
  navigator.clipboard.writeText("copied");
  alert("done");
  new ResizeObserver(() => {}).observe(document.body);
  return tree;
}

document.getElementById("go").addEventListener("keypress", () => {});
core.executeAsModal(async () => {}, { commandName: "x" });
