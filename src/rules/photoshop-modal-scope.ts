import type { TSESTree, TSESLint } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { getUxp, photoshopApiVersion } from "../util/settings.js";
import { ModuleTracker, propertyName, keyName, staticString, unwrap, mergeVisitors } from "../util/ast.js";
import { SOURCES } from "../data/sources.js";

type Options = [{ extraModifyingMethods?: string[]; readOnlyDescriptors?: string[]; checkDomMethods?: boolean }];
type MessageIds = "batchPlayOutsideModal" | "domOutsideModal" | "setterOutsideModal";

/** batchPlay `_obj` values that only read state. */
const READ_ONLY = new Set(["get", "multiGet"]);
/** Photoshop DOM methods that modify documents (from @types/photoshop Document/Layer/Documents/Layers/Selection classes). Distinctive names only, to avoid matching non-Photoshop objects. */
const MODIFYING = new Set([
  "createLayer", "createLayerGroup", "createPixelLayer", "createTextLayer", "groupLayers", "resizeImage", "resizeCanvas", "rotate", "crop", "trim", "flatten", "mergeVisibleLayers",
  "duplicateLayers", "splitChannels", "convertMode", "changeMode", "revealAll", "applyGaussianBlur", "applyMotionBlur", "applyAddNoise", "applySharpen", "applyUnSharpMask",
  "applyHighPass", "applyMedianNoise", "applyAverage", "applyBlur", "applyBlurMore", "applyClouds", "applyDespeckle", "applyDustAndScratches", "applyLensBlur", "applyMaximum", "applyMinimum",
  "applyOffset", "applyPinch", "applyPolarCoordinates", "applyRipple", "applyShear", "applySpherize", "applyTwirl", "applyWave", "applyZigZag", "applyBrightnessContrast", "applyInvert",
  "sendToBack", "rasterize", "selectAll", "deselect", "inverse", "createDocument", "closeWithoutSaving", "unlink", "link",
  "translate", "scale", "skew", "flip", "merge", "duplicate", "delete",
]);
/** Settable Layer/Document properties in @types/photoshop 27.11 (setters). */
const SETTERS = new Set(["activeChannels", "activeHistoryBrushSource", "activeHistoryState", "activeLayers", "allLocked", "bitsPerChannel", "blendMode", "colorProfileName", "colorProfileType", "fillOpacity", "filterMaskDensity", "filterMaskFeather", "isClippingMask", "layerMaskDensity", "layerMaskFeather", "name", "opacity", "pixelAspectRatio", "pixelsLocked", "positionLocked", "quickMaskMode", "selected", "transparentPixelsLocked", "vectorMaskDensity", "vectorMaskFeather", "visible"]);

export default createRule<Options, MessageIds>({
  name: "photoshop-modal-scope",
  meta: {
    type: "problem",
    docs: {
      description: "Require Photoshop state changes (modifying batchPlay, DOM edits) to run inside core.executeAsModal",
      recommended: true,
      sources: [SOURCES.executeAsModal, SOURCES.psManifestApiVersion, SOURCES.forum6687, SOURCES.forum5837],
    },
    schema: [{ type: "object", properties: { extraModifyingMethods: { type: "array", items: { type: "string" } }, readOnlyDescriptors: { type: "array", items: { type: "string" } }, checkDomMethods: { type: "boolean" } }, additionalProperties: false }],
    messages: {
      batchPlayOutsideModal: "batchPlay `{{obj}}` modifies Photoshop state but is not inside core.executeAsModal(). With apiVersion 2 this throws; wrap it in executeAsModal.",
      domOutsideModal: "`{{name}}()` modifies the Photoshop document but is not inside core.executeAsModal().",
      setterOutsideModal: "Setting `{{name}}` on a Photoshop layer/document modifies state but is not inside core.executeAsModal().",
    },
  },
  defaultOptions: [{ extraModifyingMethods: [], readOnlyDescriptors: [], checkDomMethods: true }],
  create(context, [opts]) {
    const uxp = getUxp(context);
    if (uxp.host && uxp.host !== "PS") return {};
    if (photoshopApiVersion(uxp) === 1) return {}; // apiVersion 1 allows mutations outside a modal scope (deprecated)
    const sourceCode = context.sourceCode;
    const tracker = new ModuleTracker(new Set(["photoshop"]));
    const readOnly = new Set([...READ_ONLY, ...(opts.readOnlyDescriptors ?? [])]);
    const modifying = new Set([...MODIFYING, ...(opts.extraModifyingMethods ?? [])]);
    const calls: TSESTree.CallExpression[] = [];
    const assigns: TSESTree.AssignmentExpression[] = [];
    let usesPhotoshop = false;

    type Fn = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
    const isFn = (n: TSESTree.Node): n is Fn => n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression";
    const fnName = (f: Fn): string | null => {
      if (f.type === "FunctionDeclaration" && f.id) return f.id.name;
      const p = f.parent;
      if (p?.type === "VariableDeclarator" && p.id.type === "Identifier") return p.id.name;
      if (p?.type === "Property" || p?.type === "MethodDefinition" || p?.type === "PropertyDefinition") return keyName(p);
      return null;
    };
    const enclosingFns = (n: TSESTree.Node): Fn[] => { const out: Fn[] = []; for (let p = n.parent; p; p = p.parent) if (isFn(p)) out.push(p); return out; };

    return mergeVisitors(tracker.visitors(), {
      CallExpression(node) { calls.push(node); },
      AssignmentExpression(node) { if (node.left.type === "MemberExpression") assigns.push(node); },
      ImportDeclaration(node) { if (node.source.value === "photoshop") usesPhotoshop = true; },
      "Program:exit"() {
        tracker.finalize();
        if (!usesPhotoshop) usesPhotoshop = calls.some((c) => c.callee.type === "Identifier" && c.callee.name === "require" && staticString(c.arguments[0] as TSESTree.Node) === "photoshop");
        if (!usesPhotoshop) return;

        // 1. modal roots: functions passed to executeAsModal / suspendHistory, inline or by name
        const modalFns = new Set<TSESTree.Node>();
        const modalNames = new Set<string>();
        const fnsByName = new Map<string, Fn[]>();
        const allFns: Fn[] = [];
        const visit = (n: TSESTree.Node) => {
          if (isFn(n)) { allFns.push(n); const nm = fnName(n); if (nm) fnsByName.set(nm, [...(fnsByName.get(nm) ?? []), n]); }
          for (const k of sourceCode.visitorKeys[n.type] ?? []) {
            const v = (n as unknown as Record<string, unknown>)[k];
            if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && "type" in c && visit(c as TSESTree.Node));
            else if (v && typeof v === "object" && "type" in v) visit(v as TSESTree.Node);
          }
        };
        visit(sourceCode.ast as TSESTree.Node);

        for (const c of calls) {
          const r = tracker.resolve(c.callee);
          const prop = c.callee.type === "MemberExpression" ? propertyName(c.callee) : c.callee.type === "Identifier" ? c.callee.name : null;
          if (r === "photoshop.core.executeAsModal" || prop === "executeAsModal" || prop === "suspendHistory") {
            const target = c.arguments[0] ? unwrap(c.arguments[0] as TSESTree.Node) : null;
            if (target && isFn(target)) modalFns.add(target);
            else if (target?.type === "Identifier") modalNames.add(target.name);
            else if (target?.type === "MemberExpression") { const pn = propertyName(target); if (pn) modalNames.add(pn); }
          }
        }
        // 2. propagate through same-file calls by name (fixpoint)
        const called = new Map<Fn, Set<string>>();
        for (const c of calls) {
          const name = c.callee.type === "Identifier" ? c.callee.name : c.callee.type === "MemberExpression" ? propertyName(c.callee) : null;
          if (!name) continue;
          const f = enclosingFns(c)[0];
          if (f) { const s = called.get(f) ?? new Set(); s.add(name); called.set(f, s); }
        }
        for (const n of modalNames) for (const f of fnsByName.get(n) ?? []) modalFns.add(f);
        let changed = true;
        while (changed) {
          changed = false;
          for (const f of [...modalFns]) {
            for (const name of called.get(f as Fn) ?? []) for (const g of fnsByName.get(name) ?? []) if (!modalFns.has(g)) { modalFns.add(g); changed = true; }
          }
        }
        // functions referenced (called or passed) anywhere in the file
        const referenced = new Set<string>();
        for (const c of calls) {
          if (c.callee.type === "Identifier") referenced.add(c.callee.name);
          if (c.callee.type === "MemberExpression") { const pn = propertyName(c.callee); if (pn) referenced.add(pn); }
          for (const a of c.arguments) if (a.type === "Identifier") referenced.add(a.name);
        }
        const inModal = (n: TSESTree.Node) => enclosingFns(n).some((f) => modalFns.has(f));
        // Unknown reachability: the enclosing named function is never referenced here (exported helper, called elsewhere).
        const unknownReach = (n: TSESTree.Node) => {
          const fns = enclosingFns(n);
          if (fns.length === 0) return false;
          return fns.every((f) => { const nm = fnName(f); return nm !== null && !referenced.has(nm) && !isInlineHandler(f); });
        };

        for (const c of calls) {
          if (inModal(c) || unknownReach(c)) continue;
          const r = tracker.resolve(c.callee);
          const prop = c.callee.type === "MemberExpression" ? propertyName(c.callee) : null;
          if (r === "photoshop.action.batchPlay" || r === "photoshop.app.batchPlay") {
            const obj = descriptorObj(c.arguments[0] as TSESTree.Node | undefined);
            if (obj && !obj.every((o) => readOnly.has(o))) context.report({ node: c, messageId: "batchPlayOutsideModal", data: { obj: obj.filter((o) => !readOnly.has(o)).join(", ") } });
            continue;
          }
          if (opts.checkDomMethods !== false && prop && modifying.has(prop) && (r?.startsWith("photoshop.") || looksLikePsReceiver(sourceCode, c.callee as TSESTree.MemberExpression))) {
            context.report({ node: c.callee.type === "MemberExpression" ? c.callee.property : c, messageId: "domOutsideModal", data: { name: prop } });
          }
        }
        if (opts.checkDomMethods === false) return;
        for (const a of assigns) {
          const left = a.left as TSESTree.MemberExpression;
          const prop = propertyName(left);
          if (!prop || !SETTERS.has(prop) || inModal(a) || unknownReach(a)) continue;
          const r = tracker.resolve(left.object);
          if (r?.startsWith("photoshop.") || looksLikePsReceiver(sourceCode, left)) context.report({ node: left.property, messageId: "setterOutsideModal", data: { name: prop } });
        }
      },
    });
  },
});

function isInlineHandler(f: TSESTree.Node): boolean {
  const p = f.parent;
  return p?.type === "CallExpression" || p?.type === "JSXExpressionContainer" || p?.type === "AssignmentExpression";
}

/** `_obj` names of a literal descriptor array, or null when not statically known. */
function descriptorObj(arg: TSESTree.Node | undefined): string[] | null {
  if (!arg || arg.type !== "ArrayExpression") return null;
  const out: string[] = [];
  for (const el of arg.elements) {
    if (!el || el.type !== "ObjectExpression") return null;
    const p = el.properties.find((x) => x.type === "Property" && keyName(x) === "_obj") as TSESTree.Property | undefined;
    const v = p ? staticString(p.value as TSESTree.Node) : null;
    if (!v) return null;
    out.push(v);
  }
  return out.length ? out : null;
}

/** Receiver text mentions a Photoshop DOM root (app, activeDocument, layers, doc, layer, selection). */
function looksLikePsReceiver(sourceCode: Readonly<TSESLint.SourceCode>, callee: TSESTree.MemberExpression): boolean {
  const t = sourceCode.getText(callee.object);
  return /(^|\.)(app|activeDocument|documents|activeLayers|layers|selection)\b|^(doc|document|layer|psDoc|activeDoc)\w*$/i.test(t) && !/^document\.(body|head|getElementById|querySelector)/.test(t) && t !== "document";
}
