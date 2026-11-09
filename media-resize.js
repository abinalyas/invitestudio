/* Prepares a photo for upload (see docs/MEDIA_PLAN.md). Everything happens in the couple's own browser:
 *   1. the photo is read and turned the right way up,
 *   2. drawn onto a canvas at a smaller size and written out again as a new file, which also removes the hidden
 *      details phones add to pictures (where it was taken, the camera, the time),
 *   3. two sizes are made: a full picture (longest side 1600 px) and a thumbnail (480 px).
 * WebP is used when the browser can write it, JPEG otherwise. The server never decodes images (a free-plan function
 * has too little processor time), it only checks what it is sent.
 */
(function (root) {
  "use strict";
  var FULL_EDGE = 1600, THUMB_EDGE = 480, MAX_SOURCE_BYTES = 30 * 1024 * 1024, MAX_PIXELS = 100 * 1000 * 1000;
  // What the server accepts (functions/_shared/media.js), less a small margin. A picture over these is shrunk again
  // here rather than sent to be refused.
  var FULL_MAX_BYTES = 570 * 1024, THUMB_MAX_BYTES = 95 * 1024;
  var QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.42, 0.34], SHRINK_STEP = 0.85, MAX_SHRINKS = 5;

  // The size that fits a picture inside a square of `edge` pixels, never enlarging it.
  function fitWithin(width, height, edge) {
    var longest = Math.max(width, height);
    if (!(width > 0 && height > 0)) return { width: 0, height: 0 };
    if (longest <= edge) return { width: Math.round(width), height: Math.round(height) };
    var scale = edge / longest;
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }

  function fail(code, message) { var e = new Error(message); e.code = code; return e; }

  // iPhone photos are usually HEIC. Safari can open them, other browsers cannot, so they are decoded here by libheif
  // (vendor/libheif-bundle.js, WebAssembly, LGPL-3.0, unmodified) into a canvas. It is only downloaded when a HEIC
  // photo is chosen. The decoder needs 'wasm-unsafe-eval' in the page's security policy and nothing else.
  var HEIC_TYPE = /^image\/hei[cf]/i, HEIC_NAME = /\.hei[cf]$/i, HEIC_SRC = "/vendor/libheif-bundle.js";
  function isHeic(file) {
    return Boolean(file) && (HEIC_TYPE.test(file.type || "") || (!/^image\//i.test(file.type || "") && HEIC_NAME.test(file.name || "")));
  }
  var heicLoader = null;
  function loadHeicDecoder() {
    if (typeof root.libheif === "function" && root.libheifReady) return Promise.resolve(root.libheifReady);
    if (!heicLoader) {
      heicLoader = new Promise(function (resolve, reject) {
        var tag = document.createElement("script");
        tag.src = HEIC_SRC;
        tag.onload = function () {
          try { var lib = root.libheif(); root.libheifReady = lib; resolve(lib); } catch (e) { reject(e); }
        };
        tag.onerror = function () { reject(new Error("load")); };
        document.head.appendChild(tag);
      }).catch(function (e) { heicLoader = null; throw e; });
    }
    return heicLoader;
  }
  function convertHeic(file) {
    return Promise.all([loadHeicDecoder(), file.arrayBuffer()]).then(function (parts) {
      var lib = parts[0], images = new lib.HeifDecoder().decode(new Uint8Array(parts[1]));
      if (!images || !images.length) throw new Error("empty");
      var image = images[0], w = image.get_width(), h = image.get_height();
      if (!(w > 0 && h > 0)) throw new Error("empty");
      if (w * h > MAX_PIXELS) throw fail("TOO_BIG", "This photo is too large to process. Choose a smaller one.");
      var canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext("2d"), data = ctx.createImageData(w, h);
      return new Promise(function (resolve, reject) {
        image.display(data, function (shown) { shown ? resolve(shown) : reject(new Error("display")); });
      }).then(function (shown) { ctx.putImageData(shown, 0, 0); return canvas; });
    }).catch(function (e) {
      if (e && e.code) throw e;
      throw fail("UNREADABLE", "This HEIC photo could not be converted. Try again, or export it as a JPEG first.");
    });
  }
  // Opens the photo. A HEIC photo is opened by the browser itself when it can (Safari); otherwise it is decoded here.
  function open(file) {
    if (!isHeic(file)) return decode(file);
    var native = typeof createImageBitmap === "function"
      ? createImageBitmap(file, { imageOrientation: "from-image" }) : Promise.reject(new Error("unsupported"));
    return native.catch(function () { return convertHeic(file); });
  }

  function decode(file) {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return viaImage(file); });
    }
    return viaImage(file);
  }
  function viaImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(fail("UNREADABLE", "This photo could not be read.")); };
      img.src = url;
    });
  }

  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve) { canvas.toBlob(function (b) { resolve(b); }, type, quality); });
  }

  // Draws the picture at width x height. Returns a function that writes it out in a format at a quality.
  function drawn(source, width, height) {
    var canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height); // a transparent PNG becomes white, not black, in a JPEG
    ctx.drawImage(source, 0, 0, width, height);
    return function (format, quality) {
      return toBlob(canvas, format === "webp" ? "image/webp" : "image/jpeg", quality).then(function (b) {
        return b && (format !== "webp" || b.type === "image/webp") ? b : null;
      });
    };
  }

  // Finds the best picture that fits in maxBytes: first lowers the quality, then (if that is not enough) makes the
  // picture smaller and tries again. `render(width, height)` resolves with a function (format, quality) -> Blob|null.
  // Returns { blob, format, width, height }. Throws OVER_LIMIT only when even the smallest attempt is too big.
  function fitToBytes(render, width, height, formats, maxBytes) {
    var w = width, h = height, shrinks = 0;
    function attemptSize() {
      return Promise.resolve(render(w, h)).then(function (write) {
        var fi = 0, qi = 0;
        function step() {
          if (fi >= formats.length) return Promise.resolve(null);
          return Promise.resolve(write(formats[fi], QUALITIES[qi])).then(function (blob) {
            if (!blob) { fi += 1; qi = 0; return step(); } // this format cannot be written here: try the next
            if (blob.size <= maxBytes) return { blob: blob, format: formats[fi], width: w, height: h };
            qi += 1;
            if (qi >= QUALITIES.length) return null; // lowest quality is still too big at this size
            return step();
          });
        }
        return step();
      });
    }
    function loop() {
      return attemptSize().then(function (found) {
        if (found) return found;
        if (shrinks >= MAX_SHRINKS) throw fail("OVER_LIMIT", "This photo is still too large after shrinking it. Try a smaller or simpler photo.");
        shrinks += 1;
        w = Math.max(1, Math.round(w * SHRINK_STEP)); h = Math.max(1, Math.round(h * SHRINK_STEP));
        return loop();
      });
    }
    return loop();
  }

  // Resolves with { full: Blob, thumb: Blob, format, width, height }.
  function prepare(file) {
    if (!file || !(/^image\//i.test(file.type || "") || isHeic(file))) return Promise.reject(fail("NOT_IMAGE", "That file is not a photo. Choose a photo file (JPEG, PNG, WebP or HEIC)."));
    if (file.size > MAX_SOURCE_BYTES) return Promise.reject(fail("TOO_BIG", "This photo is over 30 MB. Choose a smaller one."));
    return open(file).then(function (source) {
      var sw = source.width || source.naturalWidth, sh = source.height || source.naturalHeight;
      if (!(sw > 0 && sh > 0)) throw fail("UNREADABLE", "This photo could not be read.");
      if (sw * sh > MAX_PIXELS) throw fail("TOO_BIG", "This photo is too large to process. Choose a smaller one.");
      var full = fitWithin(sw, sh, FULL_EDGE), thumb = fitWithin(sw, sh, THUMB_EDGE);
      // WebP when this browser can write it, JPEG otherwise; the thumbnail then uses the same format.
      return fitToBytes(function (w, h) { return drawn(source, w, h); }, full.width, full.height, ["webp", "jpeg"], FULL_MAX_BYTES).then(function (f) {
        return fitToBytes(function (w, h) { return drawn(source, w, h); }, thumb.width, thumb.height, [f.format], THUMB_MAX_BYTES).then(function (t) {
          if (source.close) source.close();
          return { full: f.blob, thumb: t.blob, format: f.format, width: f.width, height: f.height };
        });
      });
    }, function (e) {
      throw e && e.code ? e : fail("UNREADABLE", "This photo could not be read. Try a JPEG, PNG, WebP or HEIC photo.");
    });
  }

  root.InviteMedia = { prepare: prepare, isHeic: isHeic, fitWithin: fitWithin, fitToBytes: fitToBytes, FULL_MAX_BYTES: FULL_MAX_BYTES, THUMB_MAX_BYTES: THUMB_MAX_BYTES, FULL_EDGE: FULL_EDGE, THUMB_EDGE: THUMB_EDGE };
  if (typeof module !== "undefined" && module.exports) module.exports = root.InviteMedia;
})(typeof globalThis !== "undefined" ? globalThis : this);
