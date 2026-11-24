/** Every curated fact below cites one of these sources. confidence: "docs" = Adobe documentation; "community" = public developer report. */
export const SOURCES = {
  knownIssues: "https://developer.adobe.com/uxp/uxp-api/known-issues",
  unsupportedAttributes: "https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-html/general/unsupported-attributes",
  unsupportedElements: "https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-html/general/unsupported-elements",
  manifestV5: "https://developer.adobe.com/photoshop/uxp/2022/guides/uxp_guide/uxp-misc/manifest-v5/",
  alert: "https://github.com/AdobeDocs/uxp/blob/main/src/pages/uxp-api/reference-js/Global%20Members/HTML%20DOM/alert.md",
  fs: "https://github.com/AdobeDocs/uxp/blob/main/src/pages/uxp-api/reference-js/Modules/fs/fs.md",
  modulesIndex: "https://github.com/AdobeDocs/uxp/blob/main/src/pages/uxp-api/reference-js/Modules/index.md",
  executeAsModal: "https://developer.adobe.com/photoshop/uxp/2022/ps_reference/media/executeasmodal/",
  bubblydooPolyfills: "https://github.com/bubblydoo/uxp-toolkit/blob/13a179c36b599e48c33395ffd5935dfbe2062378/packages/uxp-polyfills/README.md",
  forum4605: "https://forums.creativeclouddeveloper.com/t/4605",
  forum10557: "https://forums.creativeclouddeveloper.com/t/uxp-manifest-network-permission-denied-for-fetch-despite-domains-all/10557",
  forum12117: "https://forums.creativeclouddeveloper.com/t/released-a-portrait-retouching-plugin-some-uxp-lessons-from-the-build/12117",
  forum5837: "https://forums.creativeclouddeveloper.com/t/error-host-is-in-a-modal-state/5837",
  forum6687: "https://forums.creativeclouddeveloper.com/t/how-to-know-which-batchplay-actions-require-executeasmodal-is-there-any-downside-to-executing-all-as-modal/6687",
  psManifestApiVersion: "https://github.com/AdobeDocs/uxp-photoshop/blob/9bd99ffedbaf0e79d525ee2ffe200eb29a8e6aaf/src/pages/guides/uxp-guide/uxp-misc/manifest-v4/photoshop-manifest/index.md#apiversion",
  uiPlaygroundReadme: "https://github.com/AdobeDocs/uxp-photoshop-plugin-samples/tree/main/ui-playground",
} as const;
export type Confidence = "docs" | "community";
