# Local XLSX reader dependencies

Runtime loads only packaged files. No CDN request, eval, remote code, backend or OAuth is used.

| Component | Version | License | Source / integrity |
| --- | --- | --- | --- |
| SheetJS CE | 0.20.3 | Apache-2.0 | [official distribution](https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz); archive SHA-256 `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` |
| fflate | 0.8.3 | MIT | npm integrity pinned in package-lock; [license](licenses/fflate.txt) |
| fast-xml-parser | 5.12.1 | MIT | npm integrity pinned in package-lock; [license](licenses/fast-xml-parser.txt) |
| @nodable/entities | 3.1.0 | MIT | [license](licenses/nodable-entities.txt), upstream nodable/val-parsers root MIT |
| is-unsafe | 2.0.3 | MIT | [license](licenses/is-unsafe.txt) |
| path-expression-matcher | 1.6.2 | MIT | [license](licenses/path-expression-matcher.txt) |
| strnum | 2.5.1 | MIT | [license](licenses/strnum.txt) |
| anynum | 1.0.1 | MIT | [license](licenses/anynum.txt) |
| xml-naming | 0.3.0 | MIT | [license](licenses/xml-naming.txt) |
| fast-xml-builder | 1.3.2 | MIT | [license](licenses/fast-xml-builder.txt); dependency included in source lock, unused exports tree-shaken |

[SheetJS source](sheetjs/xlsx.mjs) SHA-256 `1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db`; [full license](sheetjs/LICENSE).

The [ZIP/XML browser bundle](xlsx-tools.js) is reproducibly built by `node scripts/vendor-xlsx.js` from pinned npm dependencies using existing esbuild. Initial SHA-256 `6b02699198174e24baf3bfeed90c7e7149d0f03a05844f72db63f363eb85b573`. SheetJS source is preserved verbatim; package installation is not part of the end-user flow.

Security review 2026-11-19: consulted [official SheetJS advisories](https://cdn.sheetjs.com/advisories/) and [installation guidance](https://docs.sheetjs.com/docs/getting-started/installation/standalone/). npm registry's historical xlsx version is not used. npm install audit reported zero known vulnerabilities for the npm dependency tree; it does not audit the vendored SheetJS archive or prove absence of vulnerabilities. A future release must recheck advisories and pin any update explicitly.

Input safeguards live outside SheetJS: bounded streaming ZIP expansion before workbook parsing, CRC/local-directory consistency, XML validation without DTD/entities, source-cell formula rejection, worker termination after 10 seconds and existing Schema/semantic validation. Output rendering uses textContent, not SheetJS HTML export.
