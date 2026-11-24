import { jsTester, rule, manifest, settings } from "../helpers.js";

const R = rule("api-min-version");
const ps = (minVersion: string) => settings(manifest({ host: { app: "PS", minVersion } }));

jsTester().run("api-min-version", R, {
  valid: [
    { code: "const { core } = require('photoshop'); core.getLayerTree()", settings: ps("23.1.0") },
    { code: "const { core } = require('photoshop'); core.executeAsModal(f)", settings: ps("22.5.0") },
    { code: "const { imaging } = require('photoshop'); imaging.getPixels({})", settings: ps("24.4.0") },
    { code: "new ResizeObserver(cb)", settings: ps("26.0.0") },
    { code: "if (typeof ResizeObserver !== 'undefined') new ResizeObserver(cb)", settings: ps("23.0.0") },
    { code: "if (core.getLayerTree) core.getLayerTree()", settings: ps("23.0.0") },
    { code: "new ResizeObserver(cb)" },
    { code: "class ResizeObserver {}; new ResizeObserver()", settings: ps("23.0.0") },
    { code: "const { core } = require('photoshop'); core.getLayerTree()", settings: settings(manifest({ host: { app: "ID", minVersion: "18.5.0" } })) },
    { code: "el.replaceChildren()", settings: ps("26.0.0") },
  ],
  invalid: [
    { code: "const { core } = require('photoshop'); core.getLayerTree()", settings: ps("23.0.0"), errors: [{ messageId: "hostTooOld", data: { api: "core.getLayerTree", required: "23.1", host: "PS", min: "23.0.0", source: "@types/photoshop @minVersion" } }] },
    { code: "import { action } from 'photoshop'; action.recordAction({}, cb)", settings: ps("24.0.0"), errors: [{ messageId: "hostTooOld" }] },
    { code: "const ps = require('photoshop'); ps.imaging.getPixels({})", settings: ps("24.0.0"), errors: [{ messageId: "hostTooOld" }] },
    { code: "const { app } = require('photoshop'); app.getColorProfiles()", settings: ps("23.5.0"), errors: [{ messageId: "hostTooOld" }] },
    { code: "new ResizeObserver(cb)", settings: ps("26.0.0".replace("26", "25")), errors: [{ messageId: "uxpTooOld" }] },
    { code: "const r = new Request('x')", settings: ps("24.0.0"), errors: [{ messageId: "uxpTooOld" }] },
    { code: "new window.IntersectionObserver(cb)", settings: ps("25.0.0"), errors: [{ messageId: "uxpTooOld" }] },
    { code: "require('uxp').userInfo.userId()", settings: ps("24.0.0"), errors: [{ messageId: "uxpTooOld" }] },
    { code: "const { userInfo } = require('uxp'); userInfo.userId()", settings: ps("24.0.0"), errors: [{ messageId: "uxpTooOld" }] },
    { code: "navigator.clipboard.writeText('x')", settings: ps("23.0.0"), errors: [{ messageId: "uxpTooOld" }] },
    { code: "el.replaceChildren()", settings: ps("24.0.0"), errors: [{ messageId: "uxpTooOld" }] },
    { code: "alert('x')", settings: settings(undefined, { uxpVersion: "6.5.0" }), errors: [{ messageId: "uxpTooOld" }] },
  ],
});
