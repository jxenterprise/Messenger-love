/*! jSquash WebP 1.5.0 — Apache-2.0 (github.com/jamsinclair/jSquash), con libwebp BSD-3-Clause © Google. Ver LICENCIAS_DE_TERCEROS.txt */
// node_modules/@jsquash/webp/meta.js
var defaultOptions = {
  quality: 75,
  target_size: 0,
  target_PSNR: 0,
  method: 4,
  sns_strength: 50,
  filter_strength: 60,
  filter_sharpness: 0,
  filter_type: 1,
  partitions: 0,
  segments: 4,
  pass: 1,
  show_compressed: 0,
  preprocessing: 0,
  autofilter: 0,
  partition_limit: 0,
  alpha_compression: 1,
  alpha_filtering: 1,
  alpha_quality: 100,
  lossless: 0,
  exact: 0,
  image_hint: 0,
  emulate_jpeg_size: 0,
  thread_level: 0,
  low_memory: 0,
  near_lossless: 100,
  use_delta_palette: 0,
  use_sharp_yuv: 0
};

// node_modules/@jsquash/webp/utils.js
function initEmscriptenModule(moduleFactory, wasmModule, moduleOptionOverrides = {}) {
  let instantiateWasm;
  if (wasmModule) {
    instantiateWasm = (imports, callback) => {
      const instance = new WebAssembly.Instance(wasmModule, imports);
      callback(instance);
      return instance.exports;
    };
  }
  return moduleFactory({
    // Just to be safe, don't automatically invoke any wasm functions
    noInitialRun: true,
    instantiateWasm,
    ...moduleOptionOverrides
  });
}

// node_modules/wasm-feature-detect/dist/esm/index.js
var simd = async () => WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));

// node_modules/@jsquash/webp/encode.js
var emscriptenModule;
async function init(module, moduleOptionOverrides) {
  let actualModule = module;
  let actualOptions = moduleOptionOverrides;
  if (arguments.length === 1 && !(module instanceof WebAssembly.Module)) {
    actualModule = void 0;
    actualOptions = module;
  }
  if (await simd()) {
    const webpEncoder2 = await import("./codec/enc/webp_enc_simd.js");
    emscriptenModule = initEmscriptenModule(webpEncoder2.default, actualModule, actualOptions);
    return emscriptenModule;
  }
  const webpEncoder = await import("./codec/enc/webp_enc.js");
  emscriptenModule = initEmscriptenModule(webpEncoder.default, actualModule, actualOptions);
  return emscriptenModule;
}
async function encode(data, options = {}) {
  if (!emscriptenModule)
    emscriptenModule = init();
  const _options = { ...defaultOptions, ...options };
  const module = await emscriptenModule;
  const result = module.encode(data.data, data.width, data.height, _options);
  if (!result)
    throw new Error("Encoding error.");
  return result.buffer;
}
export {
  encode as default,
  init
};
