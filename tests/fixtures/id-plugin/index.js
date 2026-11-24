const { entrypoints } = require("uxp");
const { app } = require("indesign");
const { action } = require("photoshop"); // never true in InDesign; Photoshop rules must stay silent for ID hosts
entrypoints.setup({ commands: { go: () => app.activeDocument && action.batchPlay([{ _obj: "set" }], {}) } });
new IntersectionObserver(() => {});
