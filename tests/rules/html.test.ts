import { htmlTester, jsTester, rule } from "../helpers.js";

const R = rule("no-unsupported-html");
htmlTester().run("no-unsupported-html (html)", R, {
  valid: [
    '<div class="a"><sp-button variant="cta">Go</sp-button></div>',
    '<form method="dialog"><input type="text" /></form>',
    '<select><option value="a">A</option></select>',
    '<label><input type="checkbox" /> Check</label>',
    '<div aria-label="x"></div>',
    { code: "<ul><li>x</li></ul>", options: [{ elements: false }] },
  ],
  invalid: [
    { code: "<ul><li>x</li></ul>", errors: [{ messageId: "element" }, { messageId: "element" }] },
    { code: '<input type="file" />', errors: [{ messageId: "inputType" }] },
    { code: '<input type="color" />', errors: [{ messageId: "inputType" }] },
    { code: '<label for="x">X</label>', errors: [{ messageId: "labelFor" }] },
    { code: '<form action="/submit" method="post"></form>', errors: [{ messageId: "formMethod" }] },
    { code: '<textarea rows="4"></textarea>', errors: [{ messageId: "textareaSize" }] },
    { code: "<select><option>A</option></select>", errors: [{ messageId: "optionValue" }] },
    { code: '<select><option value="a" disabled>A</option></select>', errors: [{ messageId: "optionDisabled" }] },
    { code: '<select value="a"><option value="a">A</option></select>', errors: [{ messageId: "selectValue" }] },
    { code: '<div hidden contenteditable="true"></div>', errors: [{ messageId: "attribute" }, { messageId: "attribute" }] },
    { code: '<div aria-label="x"></div>', options: [{ aria: true }], errors: [{ messageId: "attribute" }] },
    { code: '<button onclick="go()">Go</button>', errors: [{ messageId: "inlineHandler" }] },
    { code: "<head><title>X</title></head>", errors: [{ messageId: "element" }] },
  ],
});

jsTester().run("no-unsupported-html (jsx)", R, {
  valid: [
    "const a = <sp-button onClick={go}>Go</sp-button>",
    "const a = <MyList><li>x</li></MyList>".replace("<li>x</li>", "x"),
    "const a = <label><input type='checkbox' /></label>",
    "const a = <form method='dialog' />",
  ],
  invalid: [
    { code: "const a = <ul><li>x</li></ul>", errors: [{ messageId: "element" }, { messageId: "element" }] },
    { code: "const a = <label htmlFor='x'>X</label>", errors: [{ messageId: "labelFor" }] },
    { code: "const a = <input type='file' />", errors: [{ messageId: "inputType" }] },
    { code: "const a = <input defaultValue='x' />", errors: [{ messageId: "defaultValue" }] },
    { code: "const a = <sp-textfield onChange={f} />", errors: [{ messageId: "spEvent", data: { name: "onChange", el: "sp-textfield" } }] },
    { code: "const a = <sp-slider onInput={f} />", errors: [{ messageId: "spEvent" }] },
  ],
});
