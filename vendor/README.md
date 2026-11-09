# Vendored third-party code

`libheif-bundle.js` is **libheif-js 1.19.8** (https://github.com/catdad-experiments/libheif-js), unmodified, taken from
`libheif-wasm/libheif-bundle.js` in the npm package. It decodes iPhone HEIC photos in the browser (WebAssembly) so they
can be resized and uploaded like any other photo. It is only downloaded when a HEIC photo is chosen
(`media-resize.js`). Licence: LGPL-3.0 (see `libheif.LICENSE.txt` and `libheif-wasm.LICENSE.txt`). To update, replace
the file with the same file from a newer release and re-run the photo tests.

Its use needs `'wasm-unsafe-eval'` in the script policy (`_headers`, `functions/_shared/security.js`). That allows
WebAssembly only; `eval()` and `new Function()` stay blocked.
