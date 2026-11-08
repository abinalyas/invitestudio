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

  // The size that fits a picture inside a square of `edge` pixels, never enlarging it.
  function fitWithin(width, height, edge) {
    var longest = Math.max(width, height);
    if (!(width > 0 && height > 0)) return { width: 0, height: 0 };
    if (longest <= edge) return { width: Math.round(width), height: Math.round(height) };
    var scale = edge / longest;
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }

  function fail(code, message) { var e = new Error(message); e.code = code; return e; }

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

  function encode(source, width, height, preferWebp) {
    var canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height); // a transparent PNG becomes white, not black, in a JPEG
    ctx.drawImage(source, 0, 0, width, height);
    function toBlob(type, quality) {
      return new Promise(function (resolve) { canvas.toBlob(function (b) { resolve(b); }, type, quality); });
    }
    return (preferWebp ? toBlob("image/webp", 0.82) : Promise.resolve(null)).then(function (webp) {
      if (webp && webp.type === "image/webp") return { blob: webp, format: "webp" };
      return toBlob("image/jpeg", 0.85).then(function (jpeg) {
        if (!jpeg) throw fail("UNREADABLE", "This photo could not be prepared.");
        return { blob: jpeg, format: "jpeg" };
      });
    });
  }

  // Resolves with { full: Blob, thumb: Blob, format, width, height }.
  function prepare(file) {
    if (!file || !/^image\//i.test(file.type || "")) return Promise.reject(fail("NOT_IMAGE", "Choose a photo file (JPEG, PNG or WebP)."));
    if (file.size > MAX_SOURCE_BYTES) return Promise.reject(fail("TOO_BIG", "This photo is over 30 MB. Choose a smaller one."));
    return decode(file).then(function (source) {
      var sw = source.width || source.naturalWidth, sh = source.height || source.naturalHeight;
      if (!(sw > 0 && sh > 0)) throw fail("UNREADABLE", "This photo could not be read.");
      if (sw * sh > MAX_PIXELS) throw fail("TOO_BIG", "This photo is too large to process. Choose a smaller one.");
      var full = fitWithin(sw, sh, FULL_EDGE), thumb = fitWithin(sw, sh, THUMB_EDGE);
      return encode(source, full.width, full.height, true).then(function (f) {
        // The thumbnail uses the same format, so the server can check both against one rule.
        return encode(source, thumb.width, thumb.height, f.format === "webp").then(function (t) {
          if (source.close) source.close();
          if (t.format !== f.format) throw fail("UNREADABLE", "This photo could not be prepared.");
          return { full: f.blob, thumb: t.blob, format: f.format, width: full.width, height: full.height };
        });
      });
    }, function (e) {
      throw e && e.code ? e : fail("UNREADABLE", "This photo could not be read. Try a JPEG or PNG.");
    });
  }

  root.InviteMedia = { prepare: prepare, fitWithin: fitWithin, FULL_EDGE: FULL_EDGE, THUMB_EDGE: THUMB_EDGE };
  if (typeof module !== "undefined" && module.exports) module.exports = root.InviteMedia;
})(typeof globalThis !== "undefined" ? globalThis : this);
