# uxp-lint/no-unsupported-html

Disallow HTML elements, attributes and patterns that UXP documents as unsupported (HTML via @html-eslint/parser, and JSX).

Type: problem.

## What it checks

Works on HTML parsed by `@html-eslint/parser` and on JSX. Reports elements Adobe lists as unsupported (`ul`, `ol`, `li`, `i`, `em`, `strong`, `q`, `blockquote`, `pre`, `code`, `title`), unsupported global attributes (`hidden`, `contenteditable`, `dir`, `spellcheck`, … ; `aria-*` only with `aria: true`; custom elements such as `sp-*` are skipped), `<input type=file|color>`, `<label for>`/`htmlFor`, forms that are not `method="dialog"`, `<textarea rows/cols>`, `<option>` without `value` or with `disabled`, `<select value>`, inline `on*` handlers in HTML, JSX `defaultValue`, and React `onChange`/`onInput` on `sp-*` (React does not forward these events to web components before React 19). Options: `elements`, `attributes`, `aria`, `inlineHandlers`, `ignore` (message ids or names).

## Messages

- `element`: {{message}}
- `attribute`: Global attribute `{{name}}` is not supported by UXP.
- `inputType`: {{message}}
- `labelFor`: `<label {{attr}}>` is not supported in UXP; wrap the control inside the <label> instead.
- `formMethod`: UXP forms only support `method="dialog"`; they do not submit to a URL.
- `textareaSize`: `<textarea {{attr}}>` is ignored in UXP; size it with CSS width/height.
- `optionValue`: `<option>` needs a `value` attribute in UXP, otherwise `select.value` returns undefined.
- `optionDisabled`: `<option disabled>` is not supported in UXP.
- `selectValue`: `<select value=...>` does not select the option in UXP; set `selected` on the <option> or call setAttribute("value", ...).
- `inlineHandler`: Inline `{{name}}` handlers are not reliable in UXP; attach listeners with addEventListener.
- `defaultValue`: UXP input elements do not accept `defaultValue`; set `value` instead.
- `spEvent`: React does not forward `{{name}}` to the `<{{el}}>` web component; attach the listener with a ref and addEventListener (React 19+ excepted).

## Sources

- https://developer.adobe.com/uxp/uxp-api/known-issues
- https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-html/general/unsupported-attributes
- https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-html/general/unsupported-elements
- https://github.com/AdobeDocs/uxp-photoshop-plugin-samples/tree/main/ui-playground
