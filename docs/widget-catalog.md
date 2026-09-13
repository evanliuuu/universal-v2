# Widget catalog

Every widget is a `WidgetNode`: `{ id, type, props, children?, behavior? }`.

| Type | Role | Typical props |
| --- | --- | --- |
| box | layout | layout, gap, align |
| text / label | copy | text |
| button | action | label, title |
| input | edit | value, multiline, placeholder |
| list | choose | items, selectedId — virtualized after 16 rows |
| tabs | switch | tabs, activeTab |
| table | grid | columns, rows |
| form | group | children |
| checkbox | toggle | checked, label |
| select | pick | options, value |
| slider | range | value, min, max |
| divider | rule | — |
| scroll-area | clip | maxHeight |
| menu | menu | items, open |
| dialog | modal | open, title |
| icon / image | media | glyph, src, alt |
| window | chrome | title, windowId |

Lists longer than 16 items render a 12-row window and scroll the rest. The viewport keeps the full item list in `data-items` so Arrow keys and clicks still address every row.

Register a renderer with `registerWidget(type, fn)` in `src/widgets/registry.ts`.
