import type { TSESTree, TSESLint } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { getUxp } from "../util/settings.js";
import { ModuleTracker, staticPrefix, staticString, memberPath, stripGlobal, isGlobalReference, getHtmlAttr, type HtmlTag, mergeVisitors } from "../util/ast.js";
import { urlParts, domainsAllow } from "../util/domains.js";
import { SOURCES } from "../data/sources.js";

type MessageIds =
  | "missingNetwork" | "domainNotAllowed" | "missingLaunchProcess" | "schemeNotAllowed" | "extensionNotAllowed" | "folderNeedsEmptyExtension"
  | "needsRequestFs" | "needsFullAccess" | "missingClipboard" | "clipboardReadOnly" | "missingIpc" | "missingWebview" | "webviewDomainNotAllowed"
  | "missingUserInfo" | "missingEnableAlerts";

const PLUGIN_SCHEMES = /^(plugin|plugin-data|plugin-temp):/i;
const PICKERS = new Set(["getFileForOpening", "getFileForSaving", "getFolder"]);
const URL_ENTRY = new Set(["getEntryWithUrl", "createEntryWithUrl"]);
const FS_PATH_FIRST = new Set(["readFile", "readFileSync", "writeFile", "writeFileSync", "open", "lstat", "lstatSync", "rename", "copyFile", "unlink", "mkdir", "rmdir", "readdir", "readdirSync"]);
const LFS = "uxp.storage.localFileSystem";

export default createRule<[], MessageIds>({
  name: "manifest-permissions",
  meta: {
    type: "problem",
    docs: {
      description: "Require manifest v5+ `requiredPermissions` for the network, file system, launchProcess, clipboard, IPC, WebView, user info and alert APIs the code uses",
      recommended: true,
      sources: [SOURCES.manifestV5, SOURCES.alert, SOURCES.fs, SOURCES.forum12117],
    },
    schema: [],
    messages: {
      missingNetwork: "`{{api}}` needs `requiredPermissions.network.domains` in manifest.json (manifest v5 grants no network access by default).",
      domainNotAllowed: "`{{host}}` is not in `requiredPermissions.network.domains`; the request will be denied (\"Manifest entry not found\").",
      missingLaunchProcess: "`{{api}}` needs `requiredPermissions.launchProcess` in manifest.json.",
      schemeNotAllowed: "Scheme `{{scheme}}` is not in `requiredPermissions.launchProcess.schemes`.",
      extensionNotAllowed: "Extension `{{ext}}` is not in `requiredPermissions.launchProcess.extensions`.",
      folderNeedsEmptyExtension: "Opening a folder with `openPath` needs an empty string `\"\"` in `requiredPermissions.launchProcess.extensions`.",
      needsRequestFs: "`{{api}}` needs `requiredPermissions.localFileSystem` set to \"request\" or \"fullAccess\" (default is \"plugin\").",
      needsFullAccess: "Accessing `{{path}}` outside plugin storage needs `requiredPermissions.localFileSystem: \"fullAccess\"`.",
      missingClipboard: "`{{api}}` needs `requiredPermissions.clipboard` (\"read\" or \"readAndWrite\").",
      clipboardReadOnly: "`{{api}}` writes to the clipboard but `requiredPermissions.clipboard` is \"read\"; use \"readAndWrite\".",
      missingIpc: "`{{api}}` needs `requiredPermissions.ipc.enablePluginCommunication: true`.",
      missingWebview: "WebView needs `requiredPermissions.webview.allow: \"yes\"` (manifest v5).",
      webviewDomainNotAllowed: "WebView source host `{{host}}` is not in `requiredPermissions.webview.domains`.",
      missingUserInfo: "`{{api}}` needs `requiredPermissions.enableUserInfo: true`.",
      missingEnableAlerts: "`{{api}}()` only works with `\"featureFlags\": { \"enableAlerts\": true }` in manifest.json (UXP 7.4+).",
    },
  },
  defaultOptions: [],
  create(context) {
    const uxp = getUxp(context);
    const m = uxp.manifest;
    if (!m || (uxp.manifestVersion !== null && uxp.manifestVersion < 5)) return {};
    const perms = m.requiredPermissions ?? {};
    const sourceCode = context.sourceCode;
    const tracker = new ModuleTracker(new Set(["uxp", "fs", "photoshop"]));
    const calls: TSESTree.CallExpression[] = [];
    const news: TSESTree.NewExpression[] = [];
    const members: TSESTree.MemberExpression[] = [];
    const reported = new Set<string>();
    const report = (node: TSESTree.Node | { loc: TSESTree.SourceLocation }, messageId: MessageIds, data: Record<string, string> = {}) => {
      const key = `${messageId}:${JSON.stringify(data)}:${node.loc.start.line}:${node.loc.start.column}`;
      if (reported.has(key)) return;
      reported.add(key);
      context.report({ loc: node.loc, messageId, data });
    };

    const checkNetwork = (node: TSESTree.Node, api: string, urlNode: TSESTree.Node | undefined) => {
      const net = perms.network;
      if (!net || net.domains === undefined || (Array.isArray(net.domains) && net.domains.length === 0)) {
        const pre = urlNode ? staticPrefix(urlNode) : null;
        if (pre && pre.complete && !urlParts(pre.text)) return; // relative URL (plugin-local)
        report(node, "missingNetwork", { api });
        return;
      }
      const pre = urlNode ? staticPrefix(urlNode) : null;
      if (!pre) return;
      const parts = urlParts(pre.text);
      if (!parts || !parts.host) return;
      if (!pre.complete && !/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+[/?#:]/i.test(pre.text)) return; // host not fully static
      if (!["http", "https", "ws", "wss"].includes(parts.scheme)) return;
      if (domainsAllow(net.domains, parts.host) === false) report(urlNode ?? node, "domainNotAllowed", { host: parts.host });
    };

    const checkWebviewSrc = (node: { loc: TSESTree.SourceLocation }, src: string | null) => {
      const wv = perms.webview;
      if (!wv || wv.allow !== "yes") { report(node, "missingWebview"); return; }
      if (!src) return;
      const parts = urlParts(src);
      if (!parts?.host || !["http", "https"].includes(parts.scheme)) return;
      if (wv.domains !== undefined && domainsAllow(wv.domains, parts.host) === false) report(node, "webviewDomainNotAllowed", { host: parts.host });
    };

    const evaluateCall = (node: TSESTree.CallExpression) => {
      const callee = node.callee;
      const resolved = tracker.resolve(callee);
      const raw = memberPath(callee);
      const globalPath = raw ? stripGlobal(raw) : null;
      const arg0 = node.arguments[0] as TSESTree.Node | undefined;

      // network
      if (callee.type === "Identifier" && callee.name === "fetch" && isGlobalReference(sourceCode, callee)) checkNetwork(node, "fetch", arg0);
      else if (callee.type === "MemberExpression" && globalPath === "fetch") checkNetwork(node, "fetch", arg0);
      if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier" && callee.property.name === "open" && node.arguments.length >= 2) {
        const method = staticString(arg0);
        if (method && /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/i.test(method)) checkNetwork(node, "XMLHttpRequest.open", node.arguments[1] as TSESTree.Node);
      }

      if (resolved) {
        // launchProcess
        if (resolved === "uxp.shell.openExternal" || resolved === "uxp.shell.openPath") {
          const api = resolved.slice(4);
          const lp = perms.launchProcess;
          if (!lp) { report(node, "missingLaunchProcess", { api }); return; }
          const s = staticString(arg0);
          if (s === null) return;
          if (resolved.endsWith("openExternal")) {
            const parts = urlParts(s);
            if (parts && !(lp.schemes ?? []).map((x) => x.toLowerCase()).includes(parts.scheme)) report(arg0!, "schemeNotAllowed", { scheme: parts.scheme });
          } else {
            const base = s.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
            const dot = base.lastIndexOf(".");
            const exts = (lp.extensions ?? []).map((x) => x.toLowerCase());
            if (dot <= 0 || /[\\/]$/.test(s)) {
              if (!exts.includes("")) report(arg0!, "folderNeedsEmptyExtension");
            } else {
              const ext = base.slice(dot).toLowerCase();
              if (!exts.includes(ext) && !exts.includes(ext.slice(1))) report(arg0!, "extensionNotAllowed", { ext });
            }
          }
          return;
        }
        // localFileSystem
        if (resolved.startsWith(`${LFS}.`)) {
          const method = resolved.slice(LFS.length + 1);
          const level = perms.localFileSystem ?? "plugin";
          if (PICKERS.has(method) && level !== "request" && level !== "fullAccess") report(node, "needsRequestFs", { api: `localFileSystem.${method}` });
          if (URL_ENTRY.has(method)) {
            const s = staticString(arg0);
            if (s !== null && !PLUGIN_SCHEMES.test(s) && level !== "fullAccess") report(arg0!, "needsFullAccess", { path: s });
          }
          return;
        }
        if (resolved.startsWith("fs.") || resolved.startsWith("uxp.storage.fs.")) {
          const method = resolved.split(".").pop()!;
          if (!FS_PATH_FIRST.has(method)) return;
          const level = perms.localFileSystem ?? "plugin";
          for (const a of method === "rename" || method === "copyFile" ? node.arguments.slice(0, 2) : node.arguments.slice(0, 1)) {
            const s = staticString(a as TSESTree.Node);
            if (s !== null && !PLUGIN_SCHEMES.test(s) && level !== "fullAccess") report(a, "needsFullAccess", { path: s });
          }
          return;
        }
      }

      // clipboard (navigator.clipboard.* or uxp clipboard via navigator)
      if (globalPath && /^navigator\.clipboard\.(read|readText|write|writeText|clearContent|setContent|getContent)$/.test(globalPath)) {
        const method = globalPath.split(".").pop()!;
        const api = `navigator.clipboard.${method}`;
        const writes = !/^(read|readText|getContent)$/.test(method);
        if (!perms.clipboard) report(node, "missingClipboard", { api });
        else if (writes && perms.clipboard === "read") report(node, "clipboardReadOnly", { api });
      }

      // webview created from JS
      if (globalPath === "document.createElement" && staticString(arg0)?.toLowerCase() === "webview") checkWebviewSrc(node, null);

      // alert / confirm / prompt
      const alertName = callee.type === "Identifier" && isGlobalReference(sourceCode, callee) ? callee.name : globalPath && /^(window|globalThis)\./.test(raw ?? "") ? globalPath : null;
      if (alertName && ["alert", "confirm", "prompt"].includes(alertName) && m.featureFlags?.enableAlerts !== true) report(node, "missingEnableAlerts", { api: alertName });
    };

    const evaluateMember = (node: TSESTree.MemberExpression) => {
      if (node.parent?.type === "MemberExpression" && node.parent.object === node) return; // report outermost only
      const resolved = tracker.resolve(node);
      if (!resolved) return;
      if ((resolved === "uxp.pluginManager" || resolved.startsWith("uxp.pluginManager.")) && perms.ipc?.enablePluginCommunication !== true) report(node, "missingIpc", { api: resolved.replace(/^uxp\./, "") });
      if ((resolved === "uxp.userInfo" || resolved.startsWith("uxp.userInfo.")) && perms.enableUserInfo !== true) report(node, "missingUserInfo", { api: resolved.replace(/^uxp\./, "") });
    };

    return mergeVisitors(tracker.visitors(), {
      CallExpression(node) { calls.push(node); },
      NewExpression(node) { news.push(node); },
      MemberExpression(node) { members.push(node); },
      ImportSpecifier(node) {
        const src = (node.parent as TSESTree.ImportDeclaration).source.value;
        const imported = node.imported.type === "Identifier" ? node.imported.name : "";
        if (src === "uxp" && imported === "pluginManager" && perms.ipc?.enablePluginCommunication !== true) report(node, "missingIpc", { api: "pluginManager" });
        if (src === "uxp" && imported === "userInfo" && perms.enableUserInfo !== true) report(node, "missingUserInfo", { api: "userInfo" });
      },
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "webview") return;
        const src = node.attributes.find((a): a is TSESTree.JSXAttribute => a.type === "JSXAttribute" && a.name.type === "JSXIdentifier" && a.name.name === "src");
        checkWebviewSrc(node, src?.value?.type === "Literal" ? String(src.value.value) : null);
      },
      // @html-eslint/parser
      ...({
        Tag(node: HtmlTag) {
          if (node.name.toLowerCase() !== "webview") return;
          checkWebviewSrc(node, getHtmlAttr(node, "src")?.value?.value ?? null);
        },
      } as unknown as TSESLint.RuleListener),
      "Program:exit"() {
        tracker.finalize();
        for (const c of calls) evaluateCall(c);
        for (const n of news) {
          if (n.callee.type === "Identifier" && (n.callee.name === "WebSocket" || n.callee.name === "Request") && isGlobalReference(sourceCode, n.callee)) checkNetwork(n, n.callee.name, n.arguments[0] as TSESTree.Node);
        }
        for (const mm of members) evaluateMember(mm);
      },
    });
  },
});
