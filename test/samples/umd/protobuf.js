// From https://github.com/rollup/rollup-plugin-commonjs/issues/38
(function(global, factory) {
    /* AMD */ if (typeof define === 'function' && define["amd"])
        define(["bytebuffer"], factory);
    /* CommonJS */ else if (typeof require === "function" && typeof module === "object" && module && module["exports"])
        module["exports"] = factory(require("bytebuffer"), true);
    /* Global */ else
        (global["dcodeIO"] = global["dcodeIO"] || {})["ProtoBuf"] = factory(global["dcodeIO"]["ByteBuffer"]);
})(this, function(ByteBuffer, isCommonJS) {
  return isCommonJS;
})
