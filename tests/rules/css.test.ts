import { cssTester, jsTester, rule, manifest, settings } from "../helpers.js";

const ps = (minVersion: string) => settings(manifest({ host: { app: "PS", minVersion } }));

cssTester().run("no-unsupported-css", rule("no-unsupported-css"), {
  valid: [
    "a { display: flex; color: red; padding: 4px; }",
    ".x { --gap: 4px; margin: var(--gap); width: calc(100% - 2rem); }",
    "a:hover::before { content: ''; }",
    "@media (prefers-color-scheme: dark) { a { color: white; } }",
    "a { -webkit-font-smoothing: antialiased; }",
    "a { display: inherit; }",
    "svg { fill: currentColor; }",
    "a:after { content: ''; }",
    "@tailwind base; .a { @apply p-4; }",
    { code: "a { gap: 4px; }", options: [{ ignore: ["gap"] }] },
    { code: "a { box-shadow: 0 0 1px black; }", settings: ps("26.0.0") },
  ],
  invalid: [
    { code: "a { gap: 4px; }", errors: [{ messageId: "unsupported", data: { kind: "Property", name: "gap", target: "" } }] },
    { code: "a { display: grid; }", errors: [{ messageId: "unsupported" }] },
    { code: "a { font: 12px Arial; }", errors: [{ messageId: "unsupported" }] },
    { code: "a { text-transform: uppercase; }", errors: [{ messageId: "unsupported" }] },
    { code: "a { transition: opacity 1s; }", errors: [{ messageId: "unsupported" }] },
    { code: "@keyframes spin { from { opacity: 0; } }", errors: [{ messageId: "unsupported", data: { kind: "At-rule", name: "@keyframes", target: "" } }] },
    { code: "a:focus-visible { color: red; }", errors: [{ messageId: "unsupported" }] },
    { code: "a { width: 10ch; }", errors: [{ messageId: "unsupported" }] },
    { code: "a { box-shadow: 0 0 1px black; }", settings: ps("24.0.0"), errors: [{ messageId: "newer", data: { kind: "Property", name: "box-shadow", since: "7.3", uxp: "6.3.3" } }] },
    { code: "a { pointer-events: none; }", settings: ps("23.0.0"), errors: [{ messageId: "newer" }] },
    { code: "a { -webkit-font-smoothing: antialiased; }", options: [{ ignoreVendorPrefixed: false }], errors: [{ messageId: "unsupported" }] },
    { code: "@tailwind base;", options: [{ ignoreBuildTimeAtRules: false }], errors: [{ messageId: "unsupported" }] },
    { code: "a:first-letter { color: red; }", errors: [{ messageId: "unsupported", data: { kind: "Pseudo-element", name: ":first-letter", target: "" } }] },
    { code: "a { color: color-mix(in srgb, red, blue); }", errors: [{ messageId: "unsupported" }] },
  ],
});

jsTester().run("no-unsupported-inline-style", rule("no-unsupported-inline-style"), {
  valid: [
    "const a = <div style={{ display: 'flex', marginTop: 4 }} />",
    "el.style.color = 'red'",
    "el.style.setProperty('--x', '1px')",
    "const a = <div style={{ WebkitUserSelect: 'none' }} />",
  ],
  invalid: [
    { code: "const a = <div style={{ gap: 8 }} />", errors: [{ messageId: "unsupported", data: { name: "gap", target: "" } }] },
    { code: "const a = <div style={{ display: 'grid' }} />", errors: [{ messageId: "unsupportedValue" }] },
    { code: "el.style.textTransform = 'uppercase'", errors: [{ messageId: "unsupported" }] },
    { code: "el.style.setProperty('gap', '4px')", errors: [{ messageId: "unsupported" }] },
    { code: "const a = <div style={{ boxShadow: 'none' }} />", settings: settings(manifest({ host: { app: "PS", minVersion: "24.0.0" } })), errors: [{ messageId: "newer" }] },
  ],
});
