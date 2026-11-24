import manifestPermissions from "./manifest-permissions.js";
import apiMinVersion from "./api-min-version.js";
import noUnsupportedCss from "./no-unsupported-css.js";
import noUnsupportedInlineStyle from "./no-unsupported-inline-style.js";
import noUnsupportedHtml from "./no-unsupported-html.js";
import noUnsupportedWebApi from "./no-unsupported-web-api.js";
import noUnsupportedFsMethod from "./no-unsupported-fs-method.js";
import noNodeBuiltinModules from "./no-node-builtin-modules.js";
import entrypointsMatchManifest from "./entrypoints-match-manifest.js";
import validManifest from "./valid-manifest.js";
import photoshopModalScope from "./photoshop-modal-scope.js";
import photoshopHandleModalErrors from "./photoshop-handle-modal-errors.js";

export const rules = {
  "manifest-permissions": manifestPermissions,
  "api-min-version": apiMinVersion,
  "no-unsupported-css": noUnsupportedCss,
  "no-unsupported-inline-style": noUnsupportedInlineStyle,
  "no-unsupported-html": noUnsupportedHtml,
  "no-unsupported-web-api": noUnsupportedWebApi,
  "no-unsupported-fs-method": noUnsupportedFsMethod,
  "no-node-builtin-modules": noNodeBuiltinModules,
  "entrypoints-match-manifest": entrypointsMatchManifest,
  "valid-manifest": validManifest,
  "photoshop-modal-scope": photoshopModalScope,
  "photoshop-handle-modal-errors": photoshopHandleModalErrors,
};
export type RuleName = keyof typeof rules;
