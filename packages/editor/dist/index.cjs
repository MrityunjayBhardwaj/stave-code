'use strict';

var React = require('react');
var p5 = require('p5');
var jsxRuntime = require('react/jsx-runtime');
var MonacoEditorRaw = require('@monaco-editor/react');
var Y4 = require('yjs');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var React__default = /*#__PURE__*/_interopDefault(React);
var p5__default = /*#__PURE__*/_interopDefault(p5);
var MonacoEditorRaw__default = /*#__PURE__*/_interopDefault(MonacoEditorRaw);
var Y4__namespace = /*#__PURE__*/_interopNamespace(Y4);

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  __defProp(target, "default", { value: mod, enumerable: true }) ,
  mod
));

// ../../../sonicPiWeb/node_modules/web-tree-sitter/tree-sitter.js
var require_tree_sitter = __commonJS({
  "../../../sonicPiWeb/node_modules/web-tree-sitter/tree-sitter.js"(exports$1, module) {
    var Module = typeof Module != "undefined" ? Module : {};
    var ENVIRONMENT_IS_WEB = typeof window == "object";
    var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";
    var ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string";
    var TreeSitter = (function() {
      var initPromise;
      var document = typeof window == "object" ? {
        currentScript: window.document.currentScript
      } : null;
      class Parser {
        constructor() {
          this.initialize();
        }
        initialize() {
          throw new Error("cannot construct a Parser before calling `init()`");
        }
        static init(moduleOptions) {
          if (initPromise) return initPromise;
          Module = Object.assign({}, Module, moduleOptions);
          return initPromise = new Promise((resolveInitPromise) => {
            var moduleOverrides = Object.assign({}, Module);
            var arguments_ = [];
            var thisProgram = "./this.program";
            var quit_ = (status, toThrow) => {
              throw toThrow;
            };
            var scriptDirectory = "";
            function locateFile(path) {
              if (Module["locateFile"]) {
                return Module["locateFile"](path, scriptDirectory);
              }
              return scriptDirectory + path;
            }
            var readAsync, readBinary;
            if (ENVIRONMENT_IS_NODE) {
              var fs = __require("fs");
              var nodePath = __require("path");
              scriptDirectory = __dirname + "/";
              readBinary = (filename) => {
                filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
                var ret = fs.readFileSync(filename);
                return ret;
              };
              readAsync = (filename, binary2 = true) => {
                filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
                return new Promise((resolve, reject) => {
                  fs.readFile(filename, binary2 ? void 0 : "utf8", (err2, data) => {
                    if (err2) reject(err2);
                    else resolve(binary2 ? data.buffer : data);
                  });
                });
              };
              if (!Module["thisProgram"] && process.argv.length > 1) {
                thisProgram = process.argv[1].replace(/\\/g, "/");
              }
              arguments_ = process.argv.slice(2);
              if (typeof module != "undefined") {
                module["exports"] = Module;
              }
              quit_ = (status, toThrow) => {
                process.exitCode = status;
                throw toThrow;
              };
            } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
              if (ENVIRONMENT_IS_WORKER) {
                scriptDirectory = self.location.href;
              } else if (typeof document != "undefined" && document.currentScript) {
                scriptDirectory = document.currentScript.src;
              }
              if (scriptDirectory.startsWith("blob:")) {
                scriptDirectory = "";
              } else {
                scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1);
              }
              {
                if (ENVIRONMENT_IS_WORKER) {
                  readBinary = (url) => {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", url, false);
                    xhr.responseType = "arraybuffer";
                    xhr.send(null);
                    return new Uint8Array(
                      /** @type{!ArrayBuffer} */
                      xhr.response
                    );
                  };
                }
                readAsync = (url) => {
                  if (isFileURI(url)) {
                    return new Promise((reject, resolve) => {
                      var xhr = new XMLHttpRequest();
                      xhr.open("GET", url, true);
                      xhr.responseType = "arraybuffer";
                      xhr.onload = () => {
                        if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                          resolve(xhr.response);
                        }
                        reject(xhr.status);
                      };
                      xhr.onerror = reject;
                      xhr.send(null);
                    });
                  }
                  return fetch(url, {
                    credentials: "same-origin"
                  }).then((response) => {
                    if (response.ok) {
                      return response.arrayBuffer();
                    }
                    return Promise.reject(new Error(response.status + " : " + response.url));
                  });
                };
              }
            } else ;
            var out = Module["print"] || console.log.bind(console);
            var err = Module["printErr"] || console.error.bind(console);
            Object.assign(Module, moduleOverrides);
            moduleOverrides = null;
            if (Module["arguments"]) arguments_ = Module["arguments"];
            if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
            if (Module["quit"]) quit_ = Module["quit"];
            var dynamicLibraries = Module["dynamicLibraries"] || [];
            var wasmBinary;
            if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
            var wasmMemory;
            var ABORT = false;
            var EXITSTATUS;
            var HEAP8, HEAPU8;
            var HEAP_DATA_VIEW;
            function updateMemoryViews() {
              var b = wasmMemory.buffer;
              Module["HEAP_DATA_VIEW"] = HEAP_DATA_VIEW = new DataView(b);
              Module["HEAP8"] = HEAP8 = new Int8Array(b);
              Module["HEAP16"] = new Int16Array(b);
              Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
              Module["HEAPU16"] = new Uint16Array(b);
              Module["HEAP32"] = new Int32Array(b);
              Module["HEAPU32"] = new Uint32Array(b);
              Module["HEAPF32"] = new Float32Array(b);
              Module["HEAPF64"] = new Float64Array(b);
            }
            if (Module["wasmMemory"]) {
              wasmMemory = Module["wasmMemory"];
            } else {
              var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 33554432;
              wasmMemory = new WebAssembly.Memory({
                "initial": INITIAL_MEMORY / 65536,
                // In theory we should not need to emit the maximum if we want "unlimited"
                // or 4GB of memory, but VMs error on that atm, see
                // https://github.com/emscripten-core/emscripten/issues/14130
                // And in the pthreads case we definitely need to emit a maximum. So
                // always emit one.
                "maximum": 2147483648 / 65536
              });
            }
            updateMemoryViews();
            var __ATPRERUN__ = [];
            var __ATINIT__ = [];
            var __ATMAIN__ = [];
            var __ATPOSTRUN__ = [];
            var __RELOC_FUNCS__ = [];
            var runtimeInitialized = false;
            function preRun() {
              if (Module["preRun"]) {
                if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
                while (Module["preRun"].length) {
                  addOnPreRun(Module["preRun"].shift());
                }
              }
              callRuntimeCallbacks(__ATPRERUN__);
            }
            function initRuntime() {
              runtimeInitialized = true;
              callRuntimeCallbacks(__RELOC_FUNCS__);
              callRuntimeCallbacks(__ATINIT__);
            }
            function preMain() {
              callRuntimeCallbacks(__ATMAIN__);
            }
            function postRun() {
              if (Module["postRun"]) {
                if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
                while (Module["postRun"].length) {
                  addOnPostRun(Module["postRun"].shift());
                }
              }
              callRuntimeCallbacks(__ATPOSTRUN__);
            }
            function addOnPreRun(cb) {
              __ATPRERUN__.unshift(cb);
            }
            function addOnInit(cb) {
              __ATINIT__.unshift(cb);
            }
            function addOnPostRun(cb) {
              __ATPOSTRUN__.unshift(cb);
            }
            var runDependencies = 0;
            var dependenciesFulfilled = null;
            function getUniqueRunDependency(id) {
              return id;
            }
            function addRunDependency(id) {
              runDependencies++;
              Module["monitorRunDependencies"]?.(runDependencies);
            }
            function removeRunDependency(id) {
              runDependencies--;
              Module["monitorRunDependencies"]?.(runDependencies);
              if (runDependencies == 0) {
                if (dependenciesFulfilled) {
                  var callback = dependenciesFulfilled;
                  dependenciesFulfilled = null;
                  callback();
                }
              }
            }
            function abort(what) {
              Module["onAbort"]?.(what);
              what = "Aborted(" + what + ")";
              err(what);
              ABORT = true;
              EXITSTATUS = 1;
              what += ". Build with -sASSERTIONS for more info.";
              var e = new WebAssembly.RuntimeError(what);
              throw e;
            }
            var dataURIPrefix = "data:application/octet-stream;base64,";
            var isDataURI = (filename) => filename.startsWith(dataURIPrefix);
            var isFileURI = (filename) => filename.startsWith("file://");
            function findWasmBinary() {
              var f = "tree-sitter.wasm";
              if (!isDataURI(f)) {
                return locateFile(f);
              }
              return f;
            }
            var wasmBinaryFile;
            function getBinarySync(file) {
              if (file == wasmBinaryFile && wasmBinary) {
                return new Uint8Array(wasmBinary);
              }
              if (readBinary) {
                return readBinary(file);
              }
              throw "both async and sync fetching of the wasm failed";
            }
            function getBinaryPromise(binaryFile) {
              if (!wasmBinary) {
                return readAsync(binaryFile).then(
                  (response) => new Uint8Array(
                    /** @type{!ArrayBuffer} */
                    response
                  ),
                  // Fall back to getBinarySync if readAsync fails
                  () => getBinarySync(binaryFile)
                );
              }
              return Promise.resolve().then(() => getBinarySync(binaryFile));
            }
            function instantiateArrayBuffer(binaryFile, imports, receiver) {
              return getBinaryPromise(binaryFile).then((binary2) => WebAssembly.instantiate(binary2, imports)).then(receiver, (reason) => {
                err(`failed to asynchronously prepare wasm: ${reason}`);
                abort(reason);
              });
            }
            function instantiateAsync(binary2, binaryFile, imports, callback) {
              if (!binary2 && typeof WebAssembly.instantiateStreaming == "function" && !isDataURI(binaryFile) && // Don't use streaming for file:// delivered objects in a webview, fetch them synchronously.
              !isFileURI(binaryFile) && // Avoid instantiateStreaming() on Node.js environment for now, as while
              // Node.js v18.1.0 implements it, it does not have a full fetch()
              // implementation yet.
              // Reference:
              //   https://github.com/emscripten-core/emscripten/pull/16917
              !ENVIRONMENT_IS_NODE && typeof fetch == "function") {
                return fetch(binaryFile, {
                  credentials: "same-origin"
                }).then((response) => {
                  var result = WebAssembly.instantiateStreaming(response, imports);
                  return result.then(callback, function(reason) {
                    err(`wasm streaming compile failed: ${reason}`);
                    err("falling back to ArrayBuffer instantiation");
                    return instantiateArrayBuffer(binaryFile, imports, callback);
                  });
                });
              }
              return instantiateArrayBuffer(binaryFile, imports, callback);
            }
            function getWasmImports() {
              return {
                "env": wasmImports,
                "wasi_snapshot_preview1": wasmImports,
                "GOT.mem": new Proxy(wasmImports, GOTHandler),
                "GOT.func": new Proxy(wasmImports, GOTHandler)
              };
            }
            function createWasm() {
              var info2 = getWasmImports();
              function receiveInstance(instance2, module2) {
                wasmExports = instance2.exports;
                wasmExports = relocateExports(wasmExports, 1024);
                var metadata2 = getDylinkMetadata(module2);
                if (metadata2.neededDynlibs) {
                  dynamicLibraries = metadata2.neededDynlibs.concat(dynamicLibraries);
                }
                mergeLibSymbols(wasmExports);
                LDSO.init();
                loadDylibs();
                addOnInit(wasmExports["__wasm_call_ctors"]);
                __RELOC_FUNCS__.push(wasmExports["__wasm_apply_data_relocs"]);
                removeRunDependency();
                return wasmExports;
              }
              addRunDependency();
              function receiveInstantiationResult(result) {
                receiveInstance(result["instance"], result["module"]);
              }
              if (Module["instantiateWasm"]) {
                try {
                  return Module["instantiateWasm"](info2, receiveInstance);
                } catch (e) {
                  err(`Module.instantiateWasm callback failed with error: ${e}`);
                  return false;
                }
              }
              if (!wasmBinaryFile) wasmBinaryFile = findWasmBinary();
              instantiateAsync(wasmBinary, wasmBinaryFile, info2, receiveInstantiationResult);
              return {};
            }
            function ExitStatus(status) {
              this.name = "ExitStatus";
              this.message = `Program terminated with exit(${status})`;
              this.status = status;
            }
            var GOT = {};
            var currentModuleWeakSymbols = /* @__PURE__ */ new Set([]);
            var GOTHandler = {
              get(obj, symName) {
                var rtn = GOT[symName];
                if (!rtn) {
                  rtn = GOT[symName] = new WebAssembly.Global({
                    "value": "i32",
                    "mutable": true
                  });
                }
                if (!currentModuleWeakSymbols.has(symName)) {
                  rtn.required = true;
                }
                return rtn;
              }
            };
            var LE_HEAP_LOAD_F32 = (byteOffset) => HEAP_DATA_VIEW.getFloat32(byteOffset, true);
            var LE_HEAP_LOAD_F64 = (byteOffset) => HEAP_DATA_VIEW.getFloat64(byteOffset, true);
            var LE_HEAP_LOAD_I16 = (byteOffset) => HEAP_DATA_VIEW.getInt16(byteOffset, true);
            var LE_HEAP_LOAD_I32 = (byteOffset) => HEAP_DATA_VIEW.getInt32(byteOffset, true);
            var LE_HEAP_LOAD_U32 = (byteOffset) => HEAP_DATA_VIEW.getUint32(byteOffset, true);
            var LE_HEAP_STORE_F32 = (byteOffset, value) => HEAP_DATA_VIEW.setFloat32(byteOffset, value, true);
            var LE_HEAP_STORE_F64 = (byteOffset, value) => HEAP_DATA_VIEW.setFloat64(byteOffset, value, true);
            var LE_HEAP_STORE_I16 = (byteOffset, value) => HEAP_DATA_VIEW.setInt16(byteOffset, value, true);
            var LE_HEAP_STORE_I32 = (byteOffset, value) => HEAP_DATA_VIEW.setInt32(byteOffset, value, true);
            var LE_HEAP_STORE_U32 = (byteOffset, value) => HEAP_DATA_VIEW.setUint32(byteOffset, value, true);
            var callRuntimeCallbacks = (callbacks) => {
              while (callbacks.length > 0) {
                callbacks.shift()(Module);
              }
            };
            var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder() : void 0;
            var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
              var endIdx = idx + maxBytesToRead;
              var endPtr = idx;
              while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
              if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
                return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
              }
              var str = "";
              while (idx < endPtr) {
                var u0 = heapOrArray[idx++];
                if (!(u0 & 128)) {
                  str += String.fromCharCode(u0);
                  continue;
                }
                var u1 = heapOrArray[idx++] & 63;
                if ((u0 & 224) == 192) {
                  str += String.fromCharCode((u0 & 31) << 6 | u1);
                  continue;
                }
                var u2 = heapOrArray[idx++] & 63;
                if ((u0 & 240) == 224) {
                  u0 = (u0 & 15) << 12 | u1 << 6 | u2;
                } else {
                  u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
                }
                if (u0 < 65536) {
                  str += String.fromCharCode(u0);
                } else {
                  var ch = u0 - 65536;
                  str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
                }
              }
              return str;
            };
            var getDylinkMetadata = (binary2) => {
              var offset = 0;
              var end = 0;
              function getU8() {
                return binary2[offset++];
              }
              function getLEB() {
                var ret = 0;
                var mul = 1;
                while (1) {
                  var byte = binary2[offset++];
                  ret += (byte & 127) * mul;
                  mul *= 128;
                  if (!(byte & 128)) break;
                }
                return ret;
              }
              function getString() {
                var len = getLEB();
                offset += len;
                return UTF8ArrayToString(binary2, offset - len, len);
              }
              function failIf(condition, message) {
                if (condition) throw new Error(message);
              }
              var name2 = "dylink.0";
              if (binary2 instanceof WebAssembly.Module) {
                var dylinkSection = WebAssembly.Module.customSections(binary2, name2);
                if (dylinkSection.length === 0) {
                  name2 = "dylink";
                  dylinkSection = WebAssembly.Module.customSections(binary2, name2);
                }
                failIf(dylinkSection.length === 0, "need dylink section");
                binary2 = new Uint8Array(dylinkSection[0]);
                end = binary2.length;
              } else {
                var int32View = new Uint32Array(new Uint8Array(binary2.subarray(0, 24)).buffer);
                var magicNumberFound = int32View[0] == 1836278016 || int32View[0] == 6386541;
                failIf(!magicNumberFound, "need to see wasm magic number");
                failIf(binary2[8] !== 0, "need the dylink section to be first");
                offset = 9;
                var section_size = getLEB();
                end = offset + section_size;
                name2 = getString();
              }
              var customSection = {
                neededDynlibs: [],
                tlsExports: /* @__PURE__ */ new Set(),
                weakImports: /* @__PURE__ */ new Set()
              };
              if (name2 == "dylink") {
                customSection.memorySize = getLEB();
                customSection.memoryAlign = getLEB();
                customSection.tableSize = getLEB();
                customSection.tableAlign = getLEB();
                var neededDynlibsCount = getLEB();
                for (var i2 = 0; i2 < neededDynlibsCount; ++i2) {
                  var libname = getString();
                  customSection.neededDynlibs.push(libname);
                }
              } else {
                failIf(name2 !== "dylink.0");
                var WASM_DYLINK_MEM_INFO = 1;
                var WASM_DYLINK_NEEDED = 2;
                var WASM_DYLINK_EXPORT_INFO = 3;
                var WASM_DYLINK_IMPORT_INFO = 4;
                var WASM_SYMBOL_TLS = 256;
                var WASM_SYMBOL_BINDING_MASK = 3;
                var WASM_SYMBOL_BINDING_WEAK = 1;
                while (offset < end) {
                  var subsectionType = getU8();
                  var subsectionSize = getLEB();
                  if (subsectionType === WASM_DYLINK_MEM_INFO) {
                    customSection.memorySize = getLEB();
                    customSection.memoryAlign = getLEB();
                    customSection.tableSize = getLEB();
                    customSection.tableAlign = getLEB();
                  } else if (subsectionType === WASM_DYLINK_NEEDED) {
                    var neededDynlibsCount = getLEB();
                    for (var i2 = 0; i2 < neededDynlibsCount; ++i2) {
                      libname = getString();
                      customSection.neededDynlibs.push(libname);
                    }
                  } else if (subsectionType === WASM_DYLINK_EXPORT_INFO) {
                    var count = getLEB();
                    while (count--) {
                      var symname = getString();
                      var flags2 = getLEB();
                      if (flags2 & WASM_SYMBOL_TLS) {
                        customSection.tlsExports.add(symname);
                      }
                    }
                  } else if (subsectionType === WASM_DYLINK_IMPORT_INFO) {
                    var count = getLEB();
                    while (count--) {
                      getString();
                      var symname = getString();
                      var flags2 = getLEB();
                      if ((flags2 & WASM_SYMBOL_BINDING_MASK) == WASM_SYMBOL_BINDING_WEAK) {
                        customSection.weakImports.add(symname);
                      }
                    }
                  } else {
                    offset += subsectionSize;
                  }
                }
              }
              return customSection;
            };
            function getValue(ptr, type = "i8") {
              if (type.endsWith("*")) type = "*";
              switch (type) {
                case "i1":
                  return HEAP8[ptr];
                case "i8":
                  return HEAP8[ptr];
                case "i16":
                  return LE_HEAP_LOAD_I16((ptr >> 1) * 2);
                case "i32":
                  return LE_HEAP_LOAD_I32((ptr >> 2) * 4);
                case "i64":
                  abort("to do getValue(i64) use WASM_BIGINT");
                case "float":
                  return LE_HEAP_LOAD_F32((ptr >> 2) * 4);
                case "double":
                  return LE_HEAP_LOAD_F64((ptr >> 3) * 8);
                case "*":
                  return LE_HEAP_LOAD_U32((ptr >> 2) * 4);
                default:
                  abort(`invalid type for getValue: ${type}`);
              }
            }
            var newDSO = (name2, handle2, syms) => {
              var dso = {
                refcount: Infinity,
                name: name2,
                exports: syms,
                global: true
              };
              LDSO.loadedLibsByName[name2] = dso;
              if (handle2 != void 0) {
                LDSO.loadedLibsByHandle[handle2] = dso;
              }
              return dso;
            };
            var LDSO = {
              loadedLibsByName: {},
              loadedLibsByHandle: {},
              init() {
                newDSO("__main__", 0, wasmImports);
              }
            };
            var ___heap_base = 78112;
            var zeroMemory = (address, size) => {
              HEAPU8.fill(0, address, address + size);
              return address;
            };
            var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
            var getMemory = (size) => {
              if (runtimeInitialized) {
                return zeroMemory(_malloc(size), size);
              }
              var ret = ___heap_base;
              var end = ret + alignMemory(size, 16);
              ___heap_base = end;
              GOT["__heap_base"].value = end;
              return ret;
            };
            var isInternalSym = (symName) => ["__cpp_exception", "__c_longjmp", "__wasm_apply_data_relocs", "__dso_handle", "__tls_size", "__tls_align", "__set_stack_limits", "_emscripten_tls_init", "__wasm_init_tls", "__wasm_call_ctors", "__start_em_asm", "__stop_em_asm", "__start_em_js", "__stop_em_js"].includes(symName) || symName.startsWith("__em_js__");
            var uleb128Encode = (n, target) => {
              if (n < 128) {
                target.push(n);
              } else {
                target.push(n % 128 | 128, n >> 7);
              }
            };
            var sigToWasmTypes = (sig) => {
              var typeNames = {
                "i": "i32",
                "j": "i64",
                "f": "f32",
                "d": "f64",
                "e": "externref",
                "p": "i32"
              };
              var type = {
                parameters: [],
                results: sig[0] == "v" ? [] : [typeNames[sig[0]]]
              };
              for (var i2 = 1; i2 < sig.length; ++i2) {
                type.parameters.push(typeNames[sig[i2]]);
              }
              return type;
            };
            var generateFuncType = (sig, target) => {
              var sigRet = sig.slice(0, 1);
              var sigParam = sig.slice(1);
              var typeCodes = {
                "i": 127,
                // i32
                "p": 127,
                // i32
                "j": 126,
                // i64
                "f": 125,
                // f32
                "d": 124,
                // f64
                "e": 111
              };
              target.push(96);
              uleb128Encode(sigParam.length, target);
              for (var i2 = 0; i2 < sigParam.length; ++i2) {
                target.push(typeCodes[sigParam[i2]]);
              }
              if (sigRet == "v") {
                target.push(0);
              } else {
                target.push(1, typeCodes[sigRet]);
              }
            };
            var convertJsFunctionToWasm = (func2, sig) => {
              if (typeof WebAssembly.Function == "function") {
                return new WebAssembly.Function(sigToWasmTypes(sig), func2);
              }
              var typeSectionBody = [1];
              generateFuncType(sig, typeSectionBody);
              var bytes = [
                0,
                97,
                115,
                109,
                // magic ("\0asm")
                1,
                0,
                0,
                0,
                // version: 1
                1
              ];
              uleb128Encode(typeSectionBody.length, bytes);
              bytes.push(...typeSectionBody);
              bytes.push(
                2,
                7,
                // import section
                // (import "e" "f" (func 0 (type 0)))
                1,
                1,
                101,
                1,
                102,
                0,
                0,
                7,
                5,
                // export section
                // (export "f" (func 0 (type 0)))
                1,
                1,
                102,
                0,
                0
              );
              var module2 = new WebAssembly.Module(new Uint8Array(bytes));
              var instance2 = new WebAssembly.Instance(module2, {
                "e": {
                  "f": func2
                }
              });
              var wrappedFunc = instance2.exports["f"];
              return wrappedFunc;
            };
            var wasmTableMirror = [];
            var wasmTable = new WebAssembly.Table({
              "initial": 28,
              "element": "anyfunc"
            });
            var getWasmTableEntry = (funcPtr) => {
              var func2 = wasmTableMirror[funcPtr];
              if (!func2) {
                if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
                wasmTableMirror[funcPtr] = func2 = wasmTable.get(funcPtr);
              }
              return func2;
            };
            var updateTableMap = (offset, count) => {
              if (functionsInTableMap) {
                for (var i2 = offset; i2 < offset + count; i2++) {
                  var item = getWasmTableEntry(i2);
                  if (item) {
                    functionsInTableMap.set(item, i2);
                  }
                }
              }
            };
            var functionsInTableMap;
            var getFunctionAddress = (func2) => {
              if (!functionsInTableMap) {
                functionsInTableMap = /* @__PURE__ */ new WeakMap();
                updateTableMap(0, wasmTable.length);
              }
              return functionsInTableMap.get(func2) || 0;
            };
            var freeTableIndexes = [];
            var getEmptyTableSlot = () => {
              if (freeTableIndexes.length) {
                return freeTableIndexes.pop();
              }
              try {
                wasmTable.grow(1);
              } catch (err2) {
                if (!(err2 instanceof RangeError)) {
                  throw err2;
                }
                throw "Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.";
              }
              return wasmTable.length - 1;
            };
            var setWasmTableEntry = (idx, func2) => {
              wasmTable.set(idx, func2);
              wasmTableMirror[idx] = wasmTable.get(idx);
            };
            var addFunction = (func2, sig) => {
              var rtn = getFunctionAddress(func2);
              if (rtn) {
                return rtn;
              }
              var ret = getEmptyTableSlot();
              try {
                setWasmTableEntry(ret, func2);
              } catch (err2) {
                if (!(err2 instanceof TypeError)) {
                  throw err2;
                }
                var wrapped = convertJsFunctionToWasm(func2, sig);
                setWasmTableEntry(ret, wrapped);
              }
              functionsInTableMap.set(func2, ret);
              return ret;
            };
            var updateGOT = (exports2, replace) => {
              for (var symName in exports2) {
                if (isInternalSym(symName)) {
                  continue;
                }
                var value = exports2[symName];
                if (symName.startsWith("orig$")) {
                  symName = symName.split("$")[1];
                  replace = true;
                }
                GOT[symName] || (GOT[symName] = new WebAssembly.Global({
                  "value": "i32",
                  "mutable": true
                }));
                if (replace || GOT[symName].value == 0) {
                  if (typeof value == "function") {
                    GOT[symName].value = addFunction(value);
                  } else if (typeof value == "number") {
                    GOT[symName].value = value;
                  } else {
                    err(`unhandled export type for '${symName}': ${typeof value}`);
                  }
                }
              }
            };
            var relocateExports = (exports2, memoryBase2, replace) => {
              var relocated = {};
              for (var e in exports2) {
                var value = exports2[e];
                if (typeof value == "object") {
                  value = value.value;
                }
                if (typeof value == "number") {
                  value += memoryBase2;
                }
                relocated[e] = value;
              }
              updateGOT(relocated, replace);
              return relocated;
            };
            var isSymbolDefined = (symName) => {
              var existing = wasmImports[symName];
              if (!existing || existing.stub) {
                return false;
              }
              return true;
            };
            var dynCallLegacy = (sig, ptr, args2) => {
              sig = sig.replace(/p/g, "i");
              var f = Module["dynCall_" + sig];
              return f(ptr, ...args2);
            };
            var dynCall = (sig, ptr, args2 = []) => {
              if (sig.includes("j")) {
                return dynCallLegacy(sig, ptr, args2);
              }
              var rtn = getWasmTableEntry(ptr)(...args2);
              return rtn;
            };
            var stackSave = () => _emscripten_stack_get_current();
            var stackRestore = (val) => __emscripten_stack_restore(val);
            var createInvokeFunction = (sig) => (ptr, ...args2) => {
              var sp = stackSave();
              try {
                return dynCall(sig, ptr, args2);
              } catch (e) {
                stackRestore(sp);
                if (e !== e + 0) throw e;
                _setThrew(1, 0);
              }
            };
            var resolveGlobalSymbol = (symName, direct = false) => {
              var sym;
              if (direct && "orig$" + symName in wasmImports) {
                symName = "orig$" + symName;
              }
              if (isSymbolDefined(symName)) {
                sym = wasmImports[symName];
              } else if (symName.startsWith("invoke_")) {
                sym = wasmImports[symName] = createInvokeFunction(symName.split("_")[1]);
              }
              return {
                sym,
                name: symName
              };
            };
            var UTF8ToString = (ptr, maxBytesToRead) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
            var loadWebAssemblyModule = (binary, flags, libName, localScope, handle) => {
              var metadata = getDylinkMetadata(binary);
              currentModuleWeakSymbols = metadata.weakImports;
              function loadModule() {
                {
                  var memAlign = Math.pow(2, metadata.memoryAlign);
                  var memoryBase = metadata.memorySize ? alignMemory(getMemory(metadata.memorySize + memAlign), memAlign) : 0;
                  var tableBase = metadata.tableSize ? wasmTable.length : 0;
                }
                var tableGrowthNeeded = tableBase + metadata.tableSize - wasmTable.length;
                if (tableGrowthNeeded > 0) {
                  wasmTable.grow(tableGrowthNeeded);
                }
                var moduleExports;
                function resolveSymbol(sym) {
                  var resolved = resolveGlobalSymbol(sym).sym;
                  if (!resolved && localScope) {
                    resolved = localScope[sym];
                  }
                  if (!resolved) {
                    resolved = moduleExports[sym];
                  }
                  return resolved;
                }
                var proxyHandler = {
                  get(stubs, prop) {
                    switch (prop) {
                      case "__memory_base":
                        return memoryBase;
                      case "__table_base":
                        return tableBase;
                    }
                    if (prop in wasmImports && !wasmImports[prop].stub) {
                      return wasmImports[prop];
                    }
                    if (!(prop in stubs)) {
                      var resolved;
                      stubs[prop] = (...args2) => {
                        resolved || (resolved = resolveSymbol(prop));
                        return resolved(...args2);
                      };
                    }
                    return stubs[prop];
                  }
                };
                var proxy = new Proxy({}, proxyHandler);
                var info = {
                  "GOT.mem": new Proxy({}, GOTHandler),
                  "GOT.func": new Proxy({}, GOTHandler),
                  "env": proxy,
                  "wasi_snapshot_preview1": proxy
                };
                function postInstantiation(module, instance) {
                  updateTableMap(tableBase, metadata.tableSize);
                  moduleExports = relocateExports(instance.exports, memoryBase);
                  if (!flags.allowUndefined) {
                    reportUndefinedSymbols();
                  }
                  function addEmAsm(addr, body) {
                    var args = [];
                    var arity = 0;
                    for (; arity < 16; arity++) {
                      if (body.indexOf("$" + arity) != -1) {
                        args.push("$" + arity);
                      } else {
                        break;
                      }
                    }
                    args = args.join(",");
                    var func = `(${args}) => { ${body} };`;
                    eval(func);
                  }
                  if ("__start_em_asm" in moduleExports) {
                    var start = moduleExports["__start_em_asm"];
                    var stop = moduleExports["__stop_em_asm"];
                    while (start < stop) {
                      var jsString = UTF8ToString(start);
                      addEmAsm(start, jsString);
                      start = HEAPU8.indexOf(0, start) + 1;
                    }
                  }
                  function addEmJs(name, cSig, body) {
                    var jsArgs = [];
                    cSig = cSig.slice(1, -1);
                    if (cSig != "void") {
                      cSig = cSig.split(",");
                      for (var i in cSig) {
                        var jsArg = cSig[i].split(" ").pop();
                        jsArgs.push(jsArg.replace("*", ""));
                      }
                    }
                    var func = `(${jsArgs}) => ${body};`;
                    moduleExports[name] = eval(func);
                  }
                  for (var name in moduleExports) {
                    if (name.startsWith("__em_js__")) {
                      var start = moduleExports[name];
                      var jsString = UTF8ToString(start);
                      var parts = jsString.split("<::>");
                      addEmJs(name.replace("__em_js__", ""), parts[0], parts[1]);
                      delete moduleExports[name];
                    }
                  }
                  var applyRelocs = moduleExports["__wasm_apply_data_relocs"];
                  if (applyRelocs) {
                    if (runtimeInitialized) {
                      applyRelocs();
                    } else {
                      __RELOC_FUNCS__.push(applyRelocs);
                    }
                  }
                  var init = moduleExports["__wasm_call_ctors"];
                  if (init) {
                    if (runtimeInitialized) {
                      init();
                    } else {
                      __ATINIT__.push(init);
                    }
                  }
                  return moduleExports;
                }
                if (flags.loadAsync) {
                  if (binary instanceof WebAssembly.Module) {
                    var instance = new WebAssembly.Instance(binary, info);
                    return Promise.resolve(postInstantiation(binary, instance));
                  }
                  return WebAssembly.instantiate(binary, info).then((result) => postInstantiation(result.module, result.instance));
                }
                var module = binary instanceof WebAssembly.Module ? binary : new WebAssembly.Module(binary);
                var instance = new WebAssembly.Instance(module, info);
                return postInstantiation(module, instance);
              }
              if (flags.loadAsync) {
                return metadata.neededDynlibs.reduce((chain, dynNeeded) => chain.then(() => loadDynamicLibrary(dynNeeded, flags, localScope)), Promise.resolve()).then(loadModule);
              }
              metadata.neededDynlibs.forEach((needed) => loadDynamicLibrary(needed, flags, localScope));
              return loadModule();
            };
            var mergeLibSymbols = (exports2, libName2) => {
              for (var [sym, exp] of Object.entries(exports2)) {
                const setImport = (target) => {
                  if (!isSymbolDefined(target)) {
                    wasmImports[target] = exp;
                  }
                };
                setImport(sym);
                const main_alias = "__main_argc_argv";
                if (sym == "main") {
                  setImport(main_alias);
                }
                if (sym == main_alias) {
                  setImport("main");
                }
                if (sym.startsWith("dynCall_") && !Module.hasOwnProperty(sym)) {
                  Module[sym] = exp;
                }
              }
            };
            var asyncLoad = (url, onload, onerror, noRunDep) => {
              var dep = getUniqueRunDependency(`al ${url}`) ;
              readAsync(url).then((arrayBuffer) => {
                onload(new Uint8Array(arrayBuffer));
                if (dep) removeRunDependency();
              }, (err2) => {
                if (onerror) {
                  onerror();
                } else {
                  throw `Loading data file "${url}" failed.`;
                }
              });
              if (dep) addRunDependency();
            };
            function loadDynamicLibrary(libName2, flags2 = {
              global: true,
              nodelete: true
            }, localScope2, handle2) {
              var dso = LDSO.loadedLibsByName[libName2];
              if (dso) {
                if (!flags2.global) ; else if (!dso.global) {
                  dso.global = true;
                  mergeLibSymbols(dso.exports);
                }
                if (flags2.nodelete && dso.refcount !== Infinity) {
                  dso.refcount = Infinity;
                }
                dso.refcount++;
                return flags2.loadAsync ? Promise.resolve(true) : true;
              }
              dso = newDSO(libName2, handle2, "loading");
              dso.refcount = flags2.nodelete ? Infinity : 1;
              dso.global = flags2.global;
              function loadLibData() {
                var libFile = locateFile(libName2);
                if (flags2.loadAsync) {
                  return new Promise(function(resolve, reject) {
                    asyncLoad(libFile, resolve, reject);
                  });
                }
                if (!readBinary) {
                  throw new Error(`${libFile}: file not found, and synchronous loading of external files is not available`);
                }
                return readBinary(libFile);
              }
              function getExports() {
                if (flags2.loadAsync) {
                  return loadLibData().then((libData) => loadWebAssemblyModule(libData, flags2, libName2, localScope2));
                }
                return loadWebAssemblyModule(loadLibData(), flags2, libName2, localScope2);
              }
              function moduleLoaded(exports2) {
                if (dso.global) {
                  mergeLibSymbols(exports2);
                }
                dso.exports = exports2;
              }
              if (flags2.loadAsync) {
                return getExports().then((exports2) => {
                  moduleLoaded(exports2);
                  return true;
                });
              }
              moduleLoaded(getExports());
              return true;
            }
            var reportUndefinedSymbols = () => {
              for (var [symName, entry] of Object.entries(GOT)) {
                if (entry.value == 0) {
                  var value = resolveGlobalSymbol(symName, true).sym;
                  if (!value && !entry.required) {
                    continue;
                  }
                  if (typeof value == "function") {
                    entry.value = addFunction(value, value.sig);
                  } else if (typeof value == "number") {
                    entry.value = value;
                  } else {
                    throw new Error(`bad export type for '${symName}': ${typeof value}`);
                  }
                }
              }
            };
            var loadDylibs = () => {
              if (!dynamicLibraries.length) {
                reportUndefinedSymbols();
                return;
              }
              addRunDependency();
              dynamicLibraries.reduce((chain, lib) => chain.then(() => loadDynamicLibrary(lib, {
                loadAsync: true,
                global: true,
                nodelete: true,
                allowUndefined: true
              })), Promise.resolve()).then(() => {
                reportUndefinedSymbols();
                removeRunDependency();
              });
            };
            Module["noExitRuntime"] || true;
            function setValue(ptr, value, type = "i8") {
              if (type.endsWith("*")) type = "*";
              switch (type) {
                case "i1":
                  HEAP8[ptr] = value;
                  break;
                case "i8":
                  HEAP8[ptr] = value;
                  break;
                case "i16":
                  LE_HEAP_STORE_I16((ptr >> 1) * 2, value);
                  break;
                case "i32":
                  LE_HEAP_STORE_I32((ptr >> 2) * 4, value);
                  break;
                case "i64":
                  abort("to do setValue(i64) use WASM_BIGINT");
                case "float":
                  LE_HEAP_STORE_F32((ptr >> 2) * 4, value);
                  break;
                case "double":
                  LE_HEAP_STORE_F64((ptr >> 3) * 8, value);
                  break;
                case "*":
                  LE_HEAP_STORE_U32((ptr >> 2) * 4, value);
                  break;
                default:
                  abort(`invalid type for setValue: ${type}`);
              }
            }
            var ___memory_base = new WebAssembly.Global({
              "value": "i32",
              "mutable": false
            }, 1024);
            var ___stack_pointer = new WebAssembly.Global({
              "value": "i32",
              "mutable": true
            }, 78112);
            var ___table_base = new WebAssembly.Global({
              "value": "i32",
              "mutable": false
            }, 1);
            var __abort_js = () => {
              abort("");
            };
            __abort_js.sig = "v";
            var nowIsMonotonic = 1;
            var __emscripten_get_now_is_monotonic = () => nowIsMonotonic;
            __emscripten_get_now_is_monotonic.sig = "i";
            var __emscripten_memcpy_js = (dest, src, num) => HEAPU8.copyWithin(dest, src, src + num);
            __emscripten_memcpy_js.sig = "vppp";
            var _emscripten_get_now;
            _emscripten_get_now = () => performance.now();
            _emscripten_get_now.sig = "d";
            var getHeapMax = () => (
              // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
              // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
              // for any code that deals with heap sizes, which would require special
              // casing all heap size related code to treat 0 specially.
              2147483648
            );
            var growMemory = (size) => {
              var b = wasmMemory.buffer;
              var pages = (size - b.byteLength + 65535) / 65536;
              try {
                wasmMemory.grow(pages);
                updateMemoryViews();
                return 1;
              } catch (e) {
              }
            };
            var _emscripten_resize_heap = (requestedSize) => {
              var oldSize = HEAPU8.length;
              requestedSize >>>= 0;
              var maxHeapSize = getHeapMax();
              if (requestedSize > maxHeapSize) {
                return false;
              }
              var alignUp = (x, multiple) => x + (multiple - x % multiple) % multiple;
              for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
                var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
                overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
                var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));
                var replacement = growMemory(newSize);
                if (replacement) {
                  return true;
                }
              }
              return false;
            };
            _emscripten_resize_heap.sig = "ip";
            var _fd_close = (fd) => 52;
            _fd_close.sig = "ii";
            function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
              return 70;
            }
            _fd_seek.sig = "iiiiip";
            var printCharBuffers = [null, [], []];
            var printChar = (stream, curr) => {
              var buffer = printCharBuffers[stream];
              if (curr === 0 || curr === 10) {
                (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
                buffer.length = 0;
              } else {
                buffer.push(curr);
              }
            };
            var _fd_write = (fd, iov, iovcnt, pnum) => {
              var num = 0;
              for (var i2 = 0; i2 < iovcnt; i2++) {
                var ptr = LE_HEAP_LOAD_U32((iov >> 2) * 4);
                var len = LE_HEAP_LOAD_U32((iov + 4 >> 2) * 4);
                iov += 8;
                for (var j = 0; j < len; j++) {
                  printChar(fd, HEAPU8[ptr + j]);
                }
                num += len;
              }
              LE_HEAP_STORE_U32((pnum >> 2) * 4, num);
              return 0;
            };
            _fd_write.sig = "iippp";
            function _tree_sitter_log_callback(isLexMessage, messageAddress) {
              if (currentLogCallback) {
                const message = UTF8ToString(messageAddress);
                currentLogCallback(message, isLexMessage !== 0);
              }
            }
            function _tree_sitter_parse_callback(inputBufferAddress, index, row, column, lengthAddress) {
              const INPUT_BUFFER_SIZE = 10 * 1024;
              const string = currentParseCallback(index, {
                row,
                column
              });
              if (typeof string === "string") {
                setValue(lengthAddress, string.length, "i32");
                stringToUTF16(string, inputBufferAddress, INPUT_BUFFER_SIZE);
              } else {
                setValue(lengthAddress, 0, "i32");
              }
            }
            var _proc_exit = (code) => {
              EXITSTATUS = code;
              quit_(code, new ExitStatus(code));
            };
            _proc_exit.sig = "vi";
            var exitJS = (status, implicit) => {
              EXITSTATUS = status;
              _proc_exit(status);
            };
            var handleException = (e) => {
              if (e instanceof ExitStatus || e == "unwind") {
                return EXITSTATUS;
              }
              quit_(1, e);
            };
            var lengthBytesUTF8 = (str) => {
              var len = 0;
              for (var i2 = 0; i2 < str.length; ++i2) {
                var c = str.charCodeAt(i2);
                if (c <= 127) {
                  len++;
                } else if (c <= 2047) {
                  len += 2;
                } else if (c >= 55296 && c <= 57343) {
                  len += 4;
                  ++i2;
                } else {
                  len += 3;
                }
              }
              return len;
            };
            var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
              if (!(maxBytesToWrite > 0)) return 0;
              var startIdx = outIdx;
              var endIdx = outIdx + maxBytesToWrite - 1;
              for (var i2 = 0; i2 < str.length; ++i2) {
                var u = str.charCodeAt(i2);
                if (u >= 55296 && u <= 57343) {
                  var u1 = str.charCodeAt(++i2);
                  u = 65536 + ((u & 1023) << 10) | u1 & 1023;
                }
                if (u <= 127) {
                  if (outIdx >= endIdx) break;
                  heap[outIdx++] = u;
                } else if (u <= 2047) {
                  if (outIdx + 1 >= endIdx) break;
                  heap[outIdx++] = 192 | u >> 6;
                  heap[outIdx++] = 128 | u & 63;
                } else if (u <= 65535) {
                  if (outIdx + 2 >= endIdx) break;
                  heap[outIdx++] = 224 | u >> 12;
                  heap[outIdx++] = 128 | u >> 6 & 63;
                  heap[outIdx++] = 128 | u & 63;
                } else {
                  if (outIdx + 3 >= endIdx) break;
                  heap[outIdx++] = 240 | u >> 18;
                  heap[outIdx++] = 128 | u >> 12 & 63;
                  heap[outIdx++] = 128 | u >> 6 & 63;
                  heap[outIdx++] = 128 | u & 63;
                }
              }
              heap[outIdx] = 0;
              return outIdx - startIdx;
            };
            var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
            var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
            var stringToUTF8OnStack = (str) => {
              var size = lengthBytesUTF8(str) + 1;
              var ret = stackAlloc(size);
              stringToUTF8(str, ret, size);
              return ret;
            };
            var stringToUTF16 = (str, outPtr, maxBytesToWrite) => {
              maxBytesToWrite ?? (maxBytesToWrite = 2147483647);
              if (maxBytesToWrite < 2) return 0;
              maxBytesToWrite -= 2;
              var startPtr = outPtr;
              var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
              for (var i2 = 0; i2 < numCharsToWrite; ++i2) {
                var codeUnit = str.charCodeAt(i2);
                LE_HEAP_STORE_I16((outPtr >> 1) * 2, codeUnit);
                outPtr += 2;
              }
              LE_HEAP_STORE_I16((outPtr >> 1) * 2, 0);
              return outPtr - startPtr;
            };
            var AsciiToString = (ptr) => {
              var str = "";
              while (1) {
                var ch = HEAPU8[ptr++];
                if (!ch) return str;
                str += String.fromCharCode(ch);
              }
            };
            var wasmImports = {
              /** @export */
              __heap_base: ___heap_base,
              /** @export */
              __indirect_function_table: wasmTable,
              /** @export */
              __memory_base: ___memory_base,
              /** @export */
              __stack_pointer: ___stack_pointer,
              /** @export */
              __table_base: ___table_base,
              /** @export */
              _abort_js: __abort_js,
              /** @export */
              _emscripten_get_now_is_monotonic: __emscripten_get_now_is_monotonic,
              /** @export */
              _emscripten_memcpy_js: __emscripten_memcpy_js,
              /** @export */
              emscripten_get_now: _emscripten_get_now,
              /** @export */
              emscripten_resize_heap: _emscripten_resize_heap,
              /** @export */
              fd_close: _fd_close,
              /** @export */
              fd_seek: _fd_seek,
              /** @export */
              fd_write: _fd_write,
              /** @export */
              memory: wasmMemory,
              /** @export */
              tree_sitter_log_callback: _tree_sitter_log_callback,
              /** @export */
              tree_sitter_parse_callback: _tree_sitter_parse_callback
            };
            var wasmExports = createWasm();
            var _malloc = Module["_malloc"] = (a0) => (_malloc = Module["_malloc"] = wasmExports["malloc"])(a0);
            Module["_calloc"] = (a0, a1) => (Module["_calloc"] = wasmExports["calloc"])(a0, a1);
            Module["_realloc"] = (a0, a1) => (Module["_realloc"] = wasmExports["realloc"])(a0, a1);
            Module["_free"] = (a0) => (Module["_free"] = wasmExports["free"])(a0);
            Module["_ts_language_symbol_count"] = (a0) => (Module["_ts_language_symbol_count"] = wasmExports["ts_language_symbol_count"])(a0);
            Module["_ts_language_state_count"] = (a0) => (Module["_ts_language_state_count"] = wasmExports["ts_language_state_count"])(a0);
            Module["_ts_language_version"] = (a0) => (Module["_ts_language_version"] = wasmExports["ts_language_version"])(a0);
            Module["_ts_language_field_count"] = (a0) => (Module["_ts_language_field_count"] = wasmExports["ts_language_field_count"])(a0);
            Module["_ts_language_next_state"] = (a0, a1, a2) => (Module["_ts_language_next_state"] = wasmExports["ts_language_next_state"])(a0, a1, a2);
            Module["_ts_language_symbol_name"] = (a0, a1) => (Module["_ts_language_symbol_name"] = wasmExports["ts_language_symbol_name"])(a0, a1);
            Module["_ts_language_symbol_for_name"] = (a0, a1, a2, a3) => (Module["_ts_language_symbol_for_name"] = wasmExports["ts_language_symbol_for_name"])(a0, a1, a2, a3);
            Module["_strncmp"] = (a0, a1, a2) => (Module["_strncmp"] = wasmExports["strncmp"])(a0, a1, a2);
            Module["_ts_language_symbol_type"] = (a0, a1) => (Module["_ts_language_symbol_type"] = wasmExports["ts_language_symbol_type"])(a0, a1);
            Module["_ts_language_field_name_for_id"] = (a0, a1) => (Module["_ts_language_field_name_for_id"] = wasmExports["ts_language_field_name_for_id"])(a0, a1);
            Module["_ts_lookahead_iterator_new"] = (a0, a1) => (Module["_ts_lookahead_iterator_new"] = wasmExports["ts_lookahead_iterator_new"])(a0, a1);
            Module["_ts_lookahead_iterator_delete"] = (a0) => (Module["_ts_lookahead_iterator_delete"] = wasmExports["ts_lookahead_iterator_delete"])(a0);
            Module["_ts_lookahead_iterator_reset_state"] = (a0, a1) => (Module["_ts_lookahead_iterator_reset_state"] = wasmExports["ts_lookahead_iterator_reset_state"])(a0, a1);
            Module["_ts_lookahead_iterator_reset"] = (a0, a1, a2) => (Module["_ts_lookahead_iterator_reset"] = wasmExports["ts_lookahead_iterator_reset"])(a0, a1, a2);
            Module["_ts_lookahead_iterator_next"] = (a0) => (Module["_ts_lookahead_iterator_next"] = wasmExports["ts_lookahead_iterator_next"])(a0);
            Module["_ts_lookahead_iterator_current_symbol"] = (a0) => (Module["_ts_lookahead_iterator_current_symbol"] = wasmExports["ts_lookahead_iterator_current_symbol"])(a0);
            Module["_memset"] = (a0, a1, a2) => (Module["_memset"] = wasmExports["memset"])(a0, a1, a2);
            Module["_memcpy"] = (a0, a1, a2) => (Module["_memcpy"] = wasmExports["memcpy"])(a0, a1, a2);
            Module["_ts_parser_delete"] = (a0) => (Module["_ts_parser_delete"] = wasmExports["ts_parser_delete"])(a0);
            Module["_ts_parser_reset"] = (a0) => (Module["_ts_parser_reset"] = wasmExports["ts_parser_reset"])(a0);
            Module["_ts_parser_set_language"] = (a0, a1) => (Module["_ts_parser_set_language"] = wasmExports["ts_parser_set_language"])(a0, a1);
            Module["_ts_parser_timeout_micros"] = (a0) => (Module["_ts_parser_timeout_micros"] = wasmExports["ts_parser_timeout_micros"])(a0);
            Module["_ts_parser_set_timeout_micros"] = (a0, a1, a2) => (Module["_ts_parser_set_timeout_micros"] = wasmExports["ts_parser_set_timeout_micros"])(a0, a1, a2);
            Module["_ts_parser_set_included_ranges"] = (a0, a1, a2) => (Module["_ts_parser_set_included_ranges"] = wasmExports["ts_parser_set_included_ranges"])(a0, a1, a2);
            Module["_memmove"] = (a0, a1, a2) => (Module["_memmove"] = wasmExports["memmove"])(a0, a1, a2);
            Module["_memcmp"] = (a0, a1, a2) => (Module["_memcmp"] = wasmExports["memcmp"])(a0, a1, a2);
            Module["_ts_query_new"] = (a0, a1, a2, a3, a4) => (Module["_ts_query_new"] = wasmExports["ts_query_new"])(a0, a1, a2, a3, a4);
            Module["_ts_query_delete"] = (a0) => (Module["_ts_query_delete"] = wasmExports["ts_query_delete"])(a0);
            Module["_iswspace"] = (a0) => (Module["_iswspace"] = wasmExports["iswspace"])(a0);
            Module["_iswalnum"] = (a0) => (Module["_iswalnum"] = wasmExports["iswalnum"])(a0);
            Module["_ts_query_pattern_count"] = (a0) => (Module["_ts_query_pattern_count"] = wasmExports["ts_query_pattern_count"])(a0);
            Module["_ts_query_capture_count"] = (a0) => (Module["_ts_query_capture_count"] = wasmExports["ts_query_capture_count"])(a0);
            Module["_ts_query_string_count"] = (a0) => (Module["_ts_query_string_count"] = wasmExports["ts_query_string_count"])(a0);
            Module["_ts_query_capture_name_for_id"] = (a0, a1, a2) => (Module["_ts_query_capture_name_for_id"] = wasmExports["ts_query_capture_name_for_id"])(a0, a1, a2);
            Module["_ts_query_string_value_for_id"] = (a0, a1, a2) => (Module["_ts_query_string_value_for_id"] = wasmExports["ts_query_string_value_for_id"])(a0, a1, a2);
            Module["_ts_query_predicates_for_pattern"] = (a0, a1, a2) => (Module["_ts_query_predicates_for_pattern"] = wasmExports["ts_query_predicates_for_pattern"])(a0, a1, a2);
            Module["_ts_query_disable_capture"] = (a0, a1, a2) => (Module["_ts_query_disable_capture"] = wasmExports["ts_query_disable_capture"])(a0, a1, a2);
            Module["_ts_tree_copy"] = (a0) => (Module["_ts_tree_copy"] = wasmExports["ts_tree_copy"])(a0);
            Module["_ts_tree_delete"] = (a0) => (Module["_ts_tree_delete"] = wasmExports["ts_tree_delete"])(a0);
            Module["_ts_init"] = () => (Module["_ts_init"] = wasmExports["ts_init"])();
            Module["_ts_parser_new_wasm"] = () => (Module["_ts_parser_new_wasm"] = wasmExports["ts_parser_new_wasm"])();
            Module["_ts_parser_enable_logger_wasm"] = (a0, a1) => (Module["_ts_parser_enable_logger_wasm"] = wasmExports["ts_parser_enable_logger_wasm"])(a0, a1);
            Module["_ts_parser_parse_wasm"] = (a0, a1, a2, a3, a4) => (Module["_ts_parser_parse_wasm"] = wasmExports["ts_parser_parse_wasm"])(a0, a1, a2, a3, a4);
            Module["_ts_parser_included_ranges_wasm"] = (a0) => (Module["_ts_parser_included_ranges_wasm"] = wasmExports["ts_parser_included_ranges_wasm"])(a0);
            Module["_ts_language_type_is_named_wasm"] = (a0, a1) => (Module["_ts_language_type_is_named_wasm"] = wasmExports["ts_language_type_is_named_wasm"])(a0, a1);
            Module["_ts_language_type_is_visible_wasm"] = (a0, a1) => (Module["_ts_language_type_is_visible_wasm"] = wasmExports["ts_language_type_is_visible_wasm"])(a0, a1);
            Module["_ts_tree_root_node_wasm"] = (a0) => (Module["_ts_tree_root_node_wasm"] = wasmExports["ts_tree_root_node_wasm"])(a0);
            Module["_ts_tree_root_node_with_offset_wasm"] = (a0) => (Module["_ts_tree_root_node_with_offset_wasm"] = wasmExports["ts_tree_root_node_with_offset_wasm"])(a0);
            Module["_ts_tree_edit_wasm"] = (a0) => (Module["_ts_tree_edit_wasm"] = wasmExports["ts_tree_edit_wasm"])(a0);
            Module["_ts_tree_included_ranges_wasm"] = (a0) => (Module["_ts_tree_included_ranges_wasm"] = wasmExports["ts_tree_included_ranges_wasm"])(a0);
            Module["_ts_tree_get_changed_ranges_wasm"] = (a0, a1) => (Module["_ts_tree_get_changed_ranges_wasm"] = wasmExports["ts_tree_get_changed_ranges_wasm"])(a0, a1);
            Module["_ts_tree_cursor_new_wasm"] = (a0) => (Module["_ts_tree_cursor_new_wasm"] = wasmExports["ts_tree_cursor_new_wasm"])(a0);
            Module["_ts_tree_cursor_delete_wasm"] = (a0) => (Module["_ts_tree_cursor_delete_wasm"] = wasmExports["ts_tree_cursor_delete_wasm"])(a0);
            Module["_ts_tree_cursor_reset_wasm"] = (a0) => (Module["_ts_tree_cursor_reset_wasm"] = wasmExports["ts_tree_cursor_reset_wasm"])(a0);
            Module["_ts_tree_cursor_reset_to_wasm"] = (a0, a1) => (Module["_ts_tree_cursor_reset_to_wasm"] = wasmExports["ts_tree_cursor_reset_to_wasm"])(a0, a1);
            Module["_ts_tree_cursor_goto_first_child_wasm"] = (a0) => (Module["_ts_tree_cursor_goto_first_child_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_wasm"])(a0);
            Module["_ts_tree_cursor_goto_last_child_wasm"] = (a0) => (Module["_ts_tree_cursor_goto_last_child_wasm"] = wasmExports["ts_tree_cursor_goto_last_child_wasm"])(a0);
            Module["_ts_tree_cursor_goto_first_child_for_index_wasm"] = (a0) => (Module["_ts_tree_cursor_goto_first_child_for_index_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_for_index_wasm"])(a0);
            Module["_ts_tree_cursor_goto_first_child_for_position_wasm"] = (a0) => (Module["_ts_tree_cursor_goto_first_child_for_position_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_for_position_wasm"])(a0);
            Module["_ts_tree_cursor_goto_next_sibling_wasm"] = (a0) => (Module["_ts_tree_cursor_goto_next_sibling_wasm"] = wasmExports["ts_tree_cursor_goto_next_sibling_wasm"])(a0);
            Module["_ts_tree_cursor_goto_previous_sibling_wasm"] = (a0) => (Module["_ts_tree_cursor_goto_previous_sibling_wasm"] = wasmExports["ts_tree_cursor_goto_previous_sibling_wasm"])(a0);
            Module["_ts_tree_cursor_goto_descendant_wasm"] = (a0, a1) => (Module["_ts_tree_cursor_goto_descendant_wasm"] = wasmExports["ts_tree_cursor_goto_descendant_wasm"])(a0, a1);
            Module["_ts_tree_cursor_goto_parent_wasm"] = (a0) => (Module["_ts_tree_cursor_goto_parent_wasm"] = wasmExports["ts_tree_cursor_goto_parent_wasm"])(a0);
            Module["_ts_tree_cursor_current_node_type_id_wasm"] = (a0) => (Module["_ts_tree_cursor_current_node_type_id_wasm"] = wasmExports["ts_tree_cursor_current_node_type_id_wasm"])(a0);
            Module["_ts_tree_cursor_current_node_state_id_wasm"] = (a0) => (Module["_ts_tree_cursor_current_node_state_id_wasm"] = wasmExports["ts_tree_cursor_current_node_state_id_wasm"])(a0);
            Module["_ts_tree_cursor_current_node_is_named_wasm"] = (a0) => (Module["_ts_tree_cursor_current_node_is_named_wasm"] = wasmExports["ts_tree_cursor_current_node_is_named_wasm"])(a0);
            Module["_ts_tree_cursor_current_node_is_missing_wasm"] = (a0) => (Module["_ts_tree_cursor_current_node_is_missing_wasm"] = wasmExports["ts_tree_cursor_current_node_is_missing_wasm"])(a0);
            Module["_ts_tree_cursor_current_node_id_wasm"] = (a0) => (Module["_ts_tree_cursor_current_node_id_wasm"] = wasmExports["ts_tree_cursor_current_node_id_wasm"])(a0);
            Module["_ts_tree_cursor_start_position_wasm"] = (a0) => (Module["_ts_tree_cursor_start_position_wasm"] = wasmExports["ts_tree_cursor_start_position_wasm"])(a0);
            Module["_ts_tree_cursor_end_position_wasm"] = (a0) => (Module["_ts_tree_cursor_end_position_wasm"] = wasmExports["ts_tree_cursor_end_position_wasm"])(a0);
            Module["_ts_tree_cursor_start_index_wasm"] = (a0) => (Module["_ts_tree_cursor_start_index_wasm"] = wasmExports["ts_tree_cursor_start_index_wasm"])(a0);
            Module["_ts_tree_cursor_end_index_wasm"] = (a0) => (Module["_ts_tree_cursor_end_index_wasm"] = wasmExports["ts_tree_cursor_end_index_wasm"])(a0);
            Module["_ts_tree_cursor_current_field_id_wasm"] = (a0) => (Module["_ts_tree_cursor_current_field_id_wasm"] = wasmExports["ts_tree_cursor_current_field_id_wasm"])(a0);
            Module["_ts_tree_cursor_current_depth_wasm"] = (a0) => (Module["_ts_tree_cursor_current_depth_wasm"] = wasmExports["ts_tree_cursor_current_depth_wasm"])(a0);
            Module["_ts_tree_cursor_current_descendant_index_wasm"] = (a0) => (Module["_ts_tree_cursor_current_descendant_index_wasm"] = wasmExports["ts_tree_cursor_current_descendant_index_wasm"])(a0);
            Module["_ts_tree_cursor_current_node_wasm"] = (a0) => (Module["_ts_tree_cursor_current_node_wasm"] = wasmExports["ts_tree_cursor_current_node_wasm"])(a0);
            Module["_ts_node_symbol_wasm"] = (a0) => (Module["_ts_node_symbol_wasm"] = wasmExports["ts_node_symbol_wasm"])(a0);
            Module["_ts_node_field_name_for_child_wasm"] = (a0, a1) => (Module["_ts_node_field_name_for_child_wasm"] = wasmExports["ts_node_field_name_for_child_wasm"])(a0, a1);
            Module["_ts_node_children_by_field_id_wasm"] = (a0, a1) => (Module["_ts_node_children_by_field_id_wasm"] = wasmExports["ts_node_children_by_field_id_wasm"])(a0, a1);
            Module["_ts_node_first_child_for_byte_wasm"] = (a0) => (Module["_ts_node_first_child_for_byte_wasm"] = wasmExports["ts_node_first_child_for_byte_wasm"])(a0);
            Module["_ts_node_first_named_child_for_byte_wasm"] = (a0) => (Module["_ts_node_first_named_child_for_byte_wasm"] = wasmExports["ts_node_first_named_child_for_byte_wasm"])(a0);
            Module["_ts_node_grammar_symbol_wasm"] = (a0) => (Module["_ts_node_grammar_symbol_wasm"] = wasmExports["ts_node_grammar_symbol_wasm"])(a0);
            Module["_ts_node_child_count_wasm"] = (a0) => (Module["_ts_node_child_count_wasm"] = wasmExports["ts_node_child_count_wasm"])(a0);
            Module["_ts_node_named_child_count_wasm"] = (a0) => (Module["_ts_node_named_child_count_wasm"] = wasmExports["ts_node_named_child_count_wasm"])(a0);
            Module["_ts_node_child_wasm"] = (a0, a1) => (Module["_ts_node_child_wasm"] = wasmExports["ts_node_child_wasm"])(a0, a1);
            Module["_ts_node_named_child_wasm"] = (a0, a1) => (Module["_ts_node_named_child_wasm"] = wasmExports["ts_node_named_child_wasm"])(a0, a1);
            Module["_ts_node_child_by_field_id_wasm"] = (a0, a1) => (Module["_ts_node_child_by_field_id_wasm"] = wasmExports["ts_node_child_by_field_id_wasm"])(a0, a1);
            Module["_ts_node_next_sibling_wasm"] = (a0) => (Module["_ts_node_next_sibling_wasm"] = wasmExports["ts_node_next_sibling_wasm"])(a0);
            Module["_ts_node_prev_sibling_wasm"] = (a0) => (Module["_ts_node_prev_sibling_wasm"] = wasmExports["ts_node_prev_sibling_wasm"])(a0);
            Module["_ts_node_next_named_sibling_wasm"] = (a0) => (Module["_ts_node_next_named_sibling_wasm"] = wasmExports["ts_node_next_named_sibling_wasm"])(a0);
            Module["_ts_node_prev_named_sibling_wasm"] = (a0) => (Module["_ts_node_prev_named_sibling_wasm"] = wasmExports["ts_node_prev_named_sibling_wasm"])(a0);
            Module["_ts_node_descendant_count_wasm"] = (a0) => (Module["_ts_node_descendant_count_wasm"] = wasmExports["ts_node_descendant_count_wasm"])(a0);
            Module["_ts_node_parent_wasm"] = (a0) => (Module["_ts_node_parent_wasm"] = wasmExports["ts_node_parent_wasm"])(a0);
            Module["_ts_node_descendant_for_index_wasm"] = (a0) => (Module["_ts_node_descendant_for_index_wasm"] = wasmExports["ts_node_descendant_for_index_wasm"])(a0);
            Module["_ts_node_named_descendant_for_index_wasm"] = (a0) => (Module["_ts_node_named_descendant_for_index_wasm"] = wasmExports["ts_node_named_descendant_for_index_wasm"])(a0);
            Module["_ts_node_descendant_for_position_wasm"] = (a0) => (Module["_ts_node_descendant_for_position_wasm"] = wasmExports["ts_node_descendant_for_position_wasm"])(a0);
            Module["_ts_node_named_descendant_for_position_wasm"] = (a0) => (Module["_ts_node_named_descendant_for_position_wasm"] = wasmExports["ts_node_named_descendant_for_position_wasm"])(a0);
            Module["_ts_node_start_point_wasm"] = (a0) => (Module["_ts_node_start_point_wasm"] = wasmExports["ts_node_start_point_wasm"])(a0);
            Module["_ts_node_end_point_wasm"] = (a0) => (Module["_ts_node_end_point_wasm"] = wasmExports["ts_node_end_point_wasm"])(a0);
            Module["_ts_node_start_index_wasm"] = (a0) => (Module["_ts_node_start_index_wasm"] = wasmExports["ts_node_start_index_wasm"])(a0);
            Module["_ts_node_end_index_wasm"] = (a0) => (Module["_ts_node_end_index_wasm"] = wasmExports["ts_node_end_index_wasm"])(a0);
            Module["_ts_node_to_string_wasm"] = (a0) => (Module["_ts_node_to_string_wasm"] = wasmExports["ts_node_to_string_wasm"])(a0);
            Module["_ts_node_children_wasm"] = (a0) => (Module["_ts_node_children_wasm"] = wasmExports["ts_node_children_wasm"])(a0);
            Module["_ts_node_named_children_wasm"] = (a0) => (Module["_ts_node_named_children_wasm"] = wasmExports["ts_node_named_children_wasm"])(a0);
            Module["_ts_node_descendants_of_type_wasm"] = (a0, a1, a2, a3, a4, a5, a6) => (Module["_ts_node_descendants_of_type_wasm"] = wasmExports["ts_node_descendants_of_type_wasm"])(a0, a1, a2, a3, a4, a5, a6);
            Module["_ts_node_is_named_wasm"] = (a0) => (Module["_ts_node_is_named_wasm"] = wasmExports["ts_node_is_named_wasm"])(a0);
            Module["_ts_node_has_changes_wasm"] = (a0) => (Module["_ts_node_has_changes_wasm"] = wasmExports["ts_node_has_changes_wasm"])(a0);
            Module["_ts_node_has_error_wasm"] = (a0) => (Module["_ts_node_has_error_wasm"] = wasmExports["ts_node_has_error_wasm"])(a0);
            Module["_ts_node_is_error_wasm"] = (a0) => (Module["_ts_node_is_error_wasm"] = wasmExports["ts_node_is_error_wasm"])(a0);
            Module["_ts_node_is_missing_wasm"] = (a0) => (Module["_ts_node_is_missing_wasm"] = wasmExports["ts_node_is_missing_wasm"])(a0);
            Module["_ts_node_is_extra_wasm"] = (a0) => (Module["_ts_node_is_extra_wasm"] = wasmExports["ts_node_is_extra_wasm"])(a0);
            Module["_ts_node_parse_state_wasm"] = (a0) => (Module["_ts_node_parse_state_wasm"] = wasmExports["ts_node_parse_state_wasm"])(a0);
            Module["_ts_node_next_parse_state_wasm"] = (a0) => (Module["_ts_node_next_parse_state_wasm"] = wasmExports["ts_node_next_parse_state_wasm"])(a0);
            Module["_ts_query_matches_wasm"] = (a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) => (Module["_ts_query_matches_wasm"] = wasmExports["ts_query_matches_wasm"])(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);
            Module["_ts_query_captures_wasm"] = (a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) => (Module["_ts_query_captures_wasm"] = wasmExports["ts_query_captures_wasm"])(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);
            Module["_iswalpha"] = (a0) => (Module["_iswalpha"] = wasmExports["iswalpha"])(a0);
            Module["_iswblank"] = (a0) => (Module["_iswblank"] = wasmExports["iswblank"])(a0);
            Module["_iswdigit"] = (a0) => (Module["_iswdigit"] = wasmExports["iswdigit"])(a0);
            Module["_iswlower"] = (a0) => (Module["_iswlower"] = wasmExports["iswlower"])(a0);
            Module["_iswupper"] = (a0) => (Module["_iswupper"] = wasmExports["iswupper"])(a0);
            Module["_iswxdigit"] = (a0) => (Module["_iswxdigit"] = wasmExports["iswxdigit"])(a0);
            Module["_memchr"] = (a0, a1, a2) => (Module["_memchr"] = wasmExports["memchr"])(a0, a1, a2);
            Module["_strlen"] = (a0) => (Module["_strlen"] = wasmExports["strlen"])(a0);
            Module["_strcmp"] = (a0, a1) => (Module["_strcmp"] = wasmExports["strcmp"])(a0, a1);
            Module["_strncat"] = (a0, a1, a2) => (Module["_strncat"] = wasmExports["strncat"])(a0, a1, a2);
            Module["_strncpy"] = (a0, a1, a2) => (Module["_strncpy"] = wasmExports["strncpy"])(a0, a1, a2);
            Module["_towlower"] = (a0) => (Module["_towlower"] = wasmExports["towlower"])(a0);
            Module["_towupper"] = (a0) => (Module["_towupper"] = wasmExports["towupper"])(a0);
            var _setThrew = (a0, a1) => (_setThrew = wasmExports["setThrew"])(a0, a1);
            var __emscripten_stack_restore = (a0) => (__emscripten_stack_restore = wasmExports["_emscripten_stack_restore"])(a0);
            var __emscripten_stack_alloc = (a0) => (__emscripten_stack_alloc = wasmExports["_emscripten_stack_alloc"])(a0);
            var _emscripten_stack_get_current = () => (_emscripten_stack_get_current = wasmExports["emscripten_stack_get_current"])();
            Module["dynCall_jiji"] = (a0, a1, a2, a3, a4) => (Module["dynCall_jiji"] = wasmExports["dynCall_jiji"])(a0, a1, a2, a3, a4);
            Module["_orig$ts_parser_timeout_micros"] = (a0) => (Module["_orig$ts_parser_timeout_micros"] = wasmExports["orig$ts_parser_timeout_micros"])(a0);
            Module["_orig$ts_parser_set_timeout_micros"] = (a0, a1) => (Module["_orig$ts_parser_set_timeout_micros"] = wasmExports["orig$ts_parser_set_timeout_micros"])(a0, a1);
            Module["AsciiToString"] = AsciiToString;
            Module["stringToUTF16"] = stringToUTF16;
            var calledRun;
            dependenciesFulfilled = function runCaller() {
              if (!calledRun) run();
              if (!calledRun) dependenciesFulfilled = runCaller;
            };
            function callMain(args2 = []) {
              var entryFunction = resolveGlobalSymbol("main").sym;
              if (!entryFunction) return;
              args2.unshift(thisProgram);
              var argc = args2.length;
              var argv = stackAlloc((argc + 1) * 4);
              var argv_ptr = argv;
              args2.forEach((arg) => {
                LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, stringToUTF8OnStack(arg));
                argv_ptr += 4;
              });
              LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, 0);
              try {
                var ret = entryFunction(argc, argv);
                exitJS(
                  ret,
                  /* implicit = */
                  true
                );
                return ret;
              } catch (e) {
                return handleException(e);
              }
            }
            function run(args2 = arguments_) {
              if (runDependencies > 0) {
                return;
              }
              preRun();
              if (runDependencies > 0) {
                return;
              }
              function doRun() {
                if (calledRun) return;
                calledRun = true;
                Module["calledRun"] = true;
                if (ABORT) return;
                initRuntime();
                preMain();
                Module["onRuntimeInitialized"]?.();
                if (shouldRunNow) callMain(args2);
                postRun();
              }
              if (Module["setStatus"]) {
                Module["setStatus"]("Running...");
                setTimeout(function() {
                  setTimeout(function() {
                    Module["setStatus"]("");
                  }, 1);
                  doRun();
                }, 1);
              } else {
                doRun();
              }
            }
            if (Module["preInit"]) {
              if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
              while (Module["preInit"].length > 0) {
                Module["preInit"].pop()();
              }
            }
            var shouldRunNow = true;
            if (Module["noInitialRun"]) shouldRunNow = false;
            run();
            const C = Module;
            const INTERNAL = {};
            const SIZE_OF_INT = 4;
            const SIZE_OF_CURSOR = 4 * SIZE_OF_INT;
            const SIZE_OF_NODE = 5 * SIZE_OF_INT;
            const SIZE_OF_POINT = 2 * SIZE_OF_INT;
            const SIZE_OF_RANGE = 2 * SIZE_OF_INT + 2 * SIZE_OF_POINT;
            const ZERO_POINT = {
              row: 0,
              column: 0
            };
            const QUERY_WORD_REGEX = /[\w-.]*/g;
            const PREDICATE_STEP_TYPE_CAPTURE = 1;
            const PREDICATE_STEP_TYPE_STRING = 2;
            const LANGUAGE_FUNCTION_REGEX = /^_?tree_sitter_\w+/;
            let VERSION;
            let MIN_COMPATIBLE_VERSION;
            let TRANSFER_BUFFER;
            let currentParseCallback;
            let currentLogCallback;
            class ParserImpl {
              static init() {
                TRANSFER_BUFFER = C._ts_init();
                VERSION = getValue(TRANSFER_BUFFER, "i32");
                MIN_COMPATIBLE_VERSION = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
              }
              initialize() {
                C._ts_parser_new_wasm();
                this[0] = getValue(TRANSFER_BUFFER, "i32");
                this[1] = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
              }
              delete() {
                C._ts_parser_delete(this[0]);
                C._free(this[1]);
                this[0] = 0;
                this[1] = 0;
              }
              setLanguage(language) {
                let address;
                if (!language) {
                  address = 0;
                  language = null;
                } else if (language.constructor === Language) {
                  address = language[0];
                  const version = C._ts_language_version(address);
                  if (version < MIN_COMPATIBLE_VERSION || VERSION < version) {
                    throw new Error(`Incompatible language version ${version}. Compatibility range ${MIN_COMPATIBLE_VERSION} through ${VERSION}.`);
                  }
                } else {
                  throw new Error("Argument must be a Language");
                }
                this.language = language;
                C._ts_parser_set_language(this[0], address);
                return this;
              }
              getLanguage() {
                return this.language;
              }
              parse(callback, oldTree, options) {
                if (typeof callback === "string") {
                  currentParseCallback = (index, _) => callback.slice(index);
                } else if (typeof callback === "function") {
                  currentParseCallback = callback;
                } else {
                  throw new Error("Argument must be a string or a function");
                }
                if (this.logCallback) {
                  currentLogCallback = this.logCallback;
                  C._ts_parser_enable_logger_wasm(this[0], 1);
                } else {
                  currentLogCallback = null;
                  C._ts_parser_enable_logger_wasm(this[0], 0);
                }
                let rangeCount = 0;
                let rangeAddress = 0;
                if (options?.includedRanges) {
                  rangeCount = options.includedRanges.length;
                  rangeAddress = C._calloc(rangeCount, SIZE_OF_RANGE);
                  let address = rangeAddress;
                  for (let i2 = 0; i2 < rangeCount; i2++) {
                    marshalRange(address, options.includedRanges[i2]);
                    address += SIZE_OF_RANGE;
                  }
                }
                const treeAddress = C._ts_parser_parse_wasm(this[0], this[1], oldTree ? oldTree[0] : 0, rangeAddress, rangeCount);
                if (!treeAddress) {
                  currentParseCallback = null;
                  currentLogCallback = null;
                  throw new Error("Parsing failed");
                }
                const result = new Tree(INTERNAL, treeAddress, this.language, currentParseCallback);
                currentParseCallback = null;
                currentLogCallback = null;
                return result;
              }
              reset() {
                C._ts_parser_reset(this[0]);
              }
              getIncludedRanges() {
                C._ts_parser_included_ranges_wasm(this[0]);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(count);
                if (count > 0) {
                  let address = buffer;
                  for (let i2 = 0; i2 < count; i2++) {
                    result[i2] = unmarshalRange(address);
                    address += SIZE_OF_RANGE;
                  }
                  C._free(buffer);
                }
                return result;
              }
              getTimeoutMicros() {
                return C._ts_parser_timeout_micros(this[0]);
              }
              setTimeoutMicros(timeout) {
                C._ts_parser_set_timeout_micros(this[0], timeout);
              }
              setLogger(callback) {
                if (!callback) {
                  callback = null;
                } else if (typeof callback !== "function") {
                  throw new Error("Logger callback must be a function");
                }
                this.logCallback = callback;
                return this;
              }
              getLogger() {
                return this.logCallback;
              }
            }
            class Tree {
              constructor(internal, address, language, textCallback) {
                assertInternal(internal);
                this[0] = address;
                this.language = language;
                this.textCallback = textCallback;
              }
              copy() {
                const address = C._ts_tree_copy(this[0]);
                return new Tree(INTERNAL, address, this.language, this.textCallback);
              }
              delete() {
                C._ts_tree_delete(this[0]);
                this[0] = 0;
              }
              edit(edit) {
                marshalEdit(edit);
                C._ts_tree_edit_wasm(this[0]);
              }
              get rootNode() {
                C._ts_tree_root_node_wasm(this[0]);
                return unmarshalNode(this);
              }
              rootNodeWithOffset(offsetBytes, offsetExtent) {
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, offsetBytes, "i32");
                marshalPoint(address + SIZE_OF_INT, offsetExtent);
                C._ts_tree_root_node_with_offset_wasm(this[0]);
                return unmarshalNode(this);
              }
              getLanguage() {
                return this.language;
              }
              walk() {
                return this.rootNode.walk();
              }
              getChangedRanges(other) {
                if (other.constructor !== Tree) {
                  throw new TypeError("Argument must be a Tree");
                }
                C._ts_tree_get_changed_ranges_wasm(this[0], other[0]);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(count);
                if (count > 0) {
                  let address = buffer;
                  for (let i2 = 0; i2 < count; i2++) {
                    result[i2] = unmarshalRange(address);
                    address += SIZE_OF_RANGE;
                  }
                  C._free(buffer);
                }
                return result;
              }
              getIncludedRanges() {
                C._ts_tree_included_ranges_wasm(this[0]);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(count);
                if (count > 0) {
                  let address = buffer;
                  for (let i2 = 0; i2 < count; i2++) {
                    result[i2] = unmarshalRange(address);
                    address += SIZE_OF_RANGE;
                  }
                  C._free(buffer);
                }
                return result;
              }
            }
            class Node {
              constructor(internal, tree) {
                assertInternal(internal);
                this.tree = tree;
              }
              get typeId() {
                marshalNode(this);
                return C._ts_node_symbol_wasm(this.tree[0]);
              }
              get grammarId() {
                marshalNode(this);
                return C._ts_node_grammar_symbol_wasm(this.tree[0]);
              }
              get type() {
                return this.tree.language.types[this.typeId] || "ERROR";
              }
              get grammarType() {
                return this.tree.language.types[this.grammarId] || "ERROR";
              }
              get endPosition() {
                marshalNode(this);
                C._ts_node_end_point_wasm(this.tree[0]);
                return unmarshalPoint(TRANSFER_BUFFER);
              }
              get endIndex() {
                marshalNode(this);
                return C._ts_node_end_index_wasm(this.tree[0]);
              }
              get text() {
                return getText(this.tree, this.startIndex, this.endIndex);
              }
              get parseState() {
                marshalNode(this);
                return C._ts_node_parse_state_wasm(this.tree[0]);
              }
              get nextParseState() {
                marshalNode(this);
                return C._ts_node_next_parse_state_wasm(this.tree[0]);
              }
              get isNamed() {
                marshalNode(this);
                return C._ts_node_is_named_wasm(this.tree[0]) === 1;
              }
              get hasError() {
                marshalNode(this);
                return C._ts_node_has_error_wasm(this.tree[0]) === 1;
              }
              get hasChanges() {
                marshalNode(this);
                return C._ts_node_has_changes_wasm(this.tree[0]) === 1;
              }
              get isError() {
                marshalNode(this);
                return C._ts_node_is_error_wasm(this.tree[0]) === 1;
              }
              get isMissing() {
                marshalNode(this);
                return C._ts_node_is_missing_wasm(this.tree[0]) === 1;
              }
              get isExtra() {
                marshalNode(this);
                return C._ts_node_is_extra_wasm(this.tree[0]) === 1;
              }
              equals(other) {
                return this.id === other.id;
              }
              child(index) {
                marshalNode(this);
                C._ts_node_child_wasm(this.tree[0], index);
                return unmarshalNode(this.tree);
              }
              namedChild(index) {
                marshalNode(this);
                C._ts_node_named_child_wasm(this.tree[0], index);
                return unmarshalNode(this.tree);
              }
              childForFieldId(fieldId) {
                marshalNode(this);
                C._ts_node_child_by_field_id_wasm(this.tree[0], fieldId);
                return unmarshalNode(this.tree);
              }
              childForFieldName(fieldName) {
                const fieldId = this.tree.language.fields.indexOf(fieldName);
                if (fieldId !== -1) return this.childForFieldId(fieldId);
                return null;
              }
              fieldNameForChild(index) {
                marshalNode(this);
                const address = C._ts_node_field_name_for_child_wasm(this.tree[0], index);
                if (!address) {
                  return null;
                }
                const result = AsciiToString(address);
                return result;
              }
              childrenForFieldName(fieldName) {
                const fieldId = this.tree.language.fields.indexOf(fieldName);
                if (fieldId !== -1 && fieldId !== 0) return this.childrenForFieldId(fieldId);
                return [];
              }
              childrenForFieldId(fieldId) {
                marshalNode(this);
                C._ts_node_children_by_field_id_wasm(this.tree[0], fieldId);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(count);
                if (count > 0) {
                  let address = buffer;
                  for (let i2 = 0; i2 < count; i2++) {
                    result[i2] = unmarshalNode(this.tree, address);
                    address += SIZE_OF_NODE;
                  }
                  C._free(buffer);
                }
                return result;
              }
              firstChildForIndex(index) {
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, index, "i32");
                C._ts_node_first_child_for_byte_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              firstNamedChildForIndex(index) {
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, index, "i32");
                C._ts_node_first_named_child_for_byte_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get childCount() {
                marshalNode(this);
                return C._ts_node_child_count_wasm(this.tree[0]);
              }
              get namedChildCount() {
                marshalNode(this);
                return C._ts_node_named_child_count_wasm(this.tree[0]);
              }
              get firstChild() {
                return this.child(0);
              }
              get firstNamedChild() {
                return this.namedChild(0);
              }
              get lastChild() {
                return this.child(this.childCount - 1);
              }
              get lastNamedChild() {
                return this.namedChild(this.namedChildCount - 1);
              }
              get children() {
                if (!this._children) {
                  marshalNode(this);
                  C._ts_node_children_wasm(this.tree[0]);
                  const count = getValue(TRANSFER_BUFFER, "i32");
                  const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                  this._children = new Array(count);
                  if (count > 0) {
                    let address = buffer;
                    for (let i2 = 0; i2 < count; i2++) {
                      this._children[i2] = unmarshalNode(this.tree, address);
                      address += SIZE_OF_NODE;
                    }
                    C._free(buffer);
                  }
                }
                return this._children;
              }
              get namedChildren() {
                if (!this._namedChildren) {
                  marshalNode(this);
                  C._ts_node_named_children_wasm(this.tree[0]);
                  const count = getValue(TRANSFER_BUFFER, "i32");
                  const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                  this._namedChildren = new Array(count);
                  if (count > 0) {
                    let address = buffer;
                    for (let i2 = 0; i2 < count; i2++) {
                      this._namedChildren[i2] = unmarshalNode(this.tree, address);
                      address += SIZE_OF_NODE;
                    }
                    C._free(buffer);
                  }
                }
                return this._namedChildren;
              }
              descendantsOfType(types, startPosition, endPosition) {
                if (!Array.isArray(types)) types = [types];
                if (!startPosition) startPosition = ZERO_POINT;
                if (!endPosition) endPosition = ZERO_POINT;
                const symbols = [];
                const typesBySymbol = this.tree.language.types;
                for (let i2 = 0, n = typesBySymbol.length; i2 < n; i2++) {
                  if (types.includes(typesBySymbol[i2])) {
                    symbols.push(i2);
                  }
                }
                const symbolsAddress = C._malloc(SIZE_OF_INT * symbols.length);
                for (let i2 = 0, n = symbols.length; i2 < n; i2++) {
                  setValue(symbolsAddress + i2 * SIZE_OF_INT, symbols[i2], "i32");
                }
                marshalNode(this);
                C._ts_node_descendants_of_type_wasm(this.tree[0], symbolsAddress, symbols.length, startPosition.row, startPosition.column, endPosition.row, endPosition.column);
                const descendantCount = getValue(TRANSFER_BUFFER, "i32");
                const descendantAddress = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(descendantCount);
                if (descendantCount > 0) {
                  let address = descendantAddress;
                  for (let i2 = 0; i2 < descendantCount; i2++) {
                    result[i2] = unmarshalNode(this.tree, address);
                    address += SIZE_OF_NODE;
                  }
                }
                C._free(descendantAddress);
                C._free(symbolsAddress);
                return result;
              }
              get nextSibling() {
                marshalNode(this);
                C._ts_node_next_sibling_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get previousSibling() {
                marshalNode(this);
                C._ts_node_prev_sibling_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get nextNamedSibling() {
                marshalNode(this);
                C._ts_node_next_named_sibling_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get previousNamedSibling() {
                marshalNode(this);
                C._ts_node_prev_named_sibling_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get descendantCount() {
                marshalNode(this);
                return C._ts_node_descendant_count_wasm(this.tree[0]);
              }
              get parent() {
                marshalNode(this);
                C._ts_node_parent_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              descendantForIndex(start2, end = start2) {
                if (typeof start2 !== "number" || typeof end !== "number") {
                  throw new Error("Arguments must be numbers");
                }
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, start2, "i32");
                setValue(address + SIZE_OF_INT, end, "i32");
                C._ts_node_descendant_for_index_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              namedDescendantForIndex(start2, end = start2) {
                if (typeof start2 !== "number" || typeof end !== "number") {
                  throw new Error("Arguments must be numbers");
                }
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, start2, "i32");
                setValue(address + SIZE_OF_INT, end, "i32");
                C._ts_node_named_descendant_for_index_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              descendantForPosition(start2, end = start2) {
                if (!isPoint(start2) || !isPoint(end)) {
                  throw new Error("Arguments must be {row, column} objects");
                }
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                marshalPoint(address, start2);
                marshalPoint(address + SIZE_OF_POINT, end);
                C._ts_node_descendant_for_position_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              namedDescendantForPosition(start2, end = start2) {
                if (!isPoint(start2) || !isPoint(end)) {
                  throw new Error("Arguments must be {row, column} objects");
                }
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                marshalPoint(address, start2);
                marshalPoint(address + SIZE_OF_POINT, end);
                C._ts_node_named_descendant_for_position_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              walk() {
                marshalNode(this);
                C._ts_tree_cursor_new_wasm(this.tree[0]);
                return new TreeCursor(INTERNAL, this.tree);
              }
              toString() {
                marshalNode(this);
                const address = C._ts_node_to_string_wasm(this.tree[0]);
                const result = AsciiToString(address);
                C._free(address);
                return result;
              }
            }
            class TreeCursor {
              constructor(internal, tree) {
                assertInternal(internal);
                this.tree = tree;
                unmarshalTreeCursor(this);
              }
              delete() {
                marshalTreeCursor(this);
                C._ts_tree_cursor_delete_wasm(this.tree[0]);
                this[0] = this[1] = this[2] = 0;
              }
              reset(node) {
                marshalNode(node);
                marshalTreeCursor(this, TRANSFER_BUFFER + SIZE_OF_NODE);
                C._ts_tree_cursor_reset_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
              }
              resetTo(cursor) {
                marshalTreeCursor(this, TRANSFER_BUFFER);
                marshalTreeCursor(cursor, TRANSFER_BUFFER + SIZE_OF_CURSOR);
                C._ts_tree_cursor_reset_to_wasm(this.tree[0], cursor.tree[0]);
                unmarshalTreeCursor(this);
              }
              get nodeType() {
                return this.tree.language.types[this.nodeTypeId] || "ERROR";
              }
              get nodeTypeId() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_type_id_wasm(this.tree[0]);
              }
              get nodeStateId() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_state_id_wasm(this.tree[0]);
              }
              get nodeId() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_id_wasm(this.tree[0]);
              }
              get nodeIsNamed() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_is_named_wasm(this.tree[0]) === 1;
              }
              get nodeIsMissing() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_is_missing_wasm(this.tree[0]) === 1;
              }
              get nodeText() {
                marshalTreeCursor(this);
                const startIndex = C._ts_tree_cursor_start_index_wasm(this.tree[0]);
                const endIndex = C._ts_tree_cursor_end_index_wasm(this.tree[0]);
                return getText(this.tree, startIndex, endIndex);
              }
              get startPosition() {
                marshalTreeCursor(this);
                C._ts_tree_cursor_start_position_wasm(this.tree[0]);
                return unmarshalPoint(TRANSFER_BUFFER);
              }
              get endPosition() {
                marshalTreeCursor(this);
                C._ts_tree_cursor_end_position_wasm(this.tree[0]);
                return unmarshalPoint(TRANSFER_BUFFER);
              }
              get startIndex() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_start_index_wasm(this.tree[0]);
              }
              get endIndex() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_end_index_wasm(this.tree[0]);
              }
              get currentNode() {
                marshalTreeCursor(this);
                C._ts_tree_cursor_current_node_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get currentFieldId() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_field_id_wasm(this.tree[0]);
              }
              get currentFieldName() {
                return this.tree.language.fields[this.currentFieldId];
              }
              get currentDepth() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_depth_wasm(this.tree[0]);
              }
              get currentDescendantIndex() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_descendant_index_wasm(this.tree[0]);
              }
              gotoFirstChild() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_first_child_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoLastChild() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_last_child_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoFirstChildForIndex(goalIndex) {
                marshalTreeCursor(this);
                setValue(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalIndex, "i32");
                const result = C._ts_tree_cursor_goto_first_child_for_index_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoFirstChildForPosition(goalPosition) {
                marshalTreeCursor(this);
                marshalPoint(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalPosition);
                const result = C._ts_tree_cursor_goto_first_child_for_position_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoNextSibling() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_next_sibling_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoPreviousSibling() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_previous_sibling_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoDescendant(goalDescendantindex) {
                marshalTreeCursor(this);
                C._ts_tree_cursor_goto_descendant_wasm(this.tree[0], goalDescendantindex);
                unmarshalTreeCursor(this);
              }
              gotoParent() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_parent_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
            }
            class Language {
              constructor(internal, address) {
                assertInternal(internal);
                this[0] = address;
                this.types = new Array(C._ts_language_symbol_count(this[0]));
                for (let i2 = 0, n = this.types.length; i2 < n; i2++) {
                  if (C._ts_language_symbol_type(this[0], i2) < 2) {
                    this.types[i2] = UTF8ToString(C._ts_language_symbol_name(this[0], i2));
                  }
                }
                this.fields = new Array(C._ts_language_field_count(this[0]) + 1);
                for (let i2 = 0, n = this.fields.length; i2 < n; i2++) {
                  const fieldName = C._ts_language_field_name_for_id(this[0], i2);
                  if (fieldName !== 0) {
                    this.fields[i2] = UTF8ToString(fieldName);
                  } else {
                    this.fields[i2] = null;
                  }
                }
              }
              get version() {
                return C._ts_language_version(this[0]);
              }
              get fieldCount() {
                return this.fields.length - 1;
              }
              get stateCount() {
                return C._ts_language_state_count(this[0]);
              }
              fieldIdForName(fieldName) {
                const result = this.fields.indexOf(fieldName);
                if (result !== -1) {
                  return result;
                } else {
                  return null;
                }
              }
              fieldNameForId(fieldId) {
                return this.fields[fieldId] || null;
              }
              idForNodeType(type, named) {
                const typeLength = lengthBytesUTF8(type);
                const typeAddress = C._malloc(typeLength + 1);
                stringToUTF8(type, typeAddress, typeLength + 1);
                const result = C._ts_language_symbol_for_name(this[0], typeAddress, typeLength, named);
                C._free(typeAddress);
                return result || null;
              }
              get nodeTypeCount() {
                return C._ts_language_symbol_count(this[0]);
              }
              nodeTypeForId(typeId) {
                const name2 = C._ts_language_symbol_name(this[0], typeId);
                return name2 ? UTF8ToString(name2) : null;
              }
              nodeTypeIsNamed(typeId) {
                return C._ts_language_type_is_named_wasm(this[0], typeId) ? true : false;
              }
              nodeTypeIsVisible(typeId) {
                return C._ts_language_type_is_visible_wasm(this[0], typeId) ? true : false;
              }
              nextState(stateId, typeId) {
                return C._ts_language_next_state(this[0], stateId, typeId);
              }
              lookaheadIterator(stateId) {
                const address = C._ts_lookahead_iterator_new(this[0], stateId);
                if (address) return new LookaheadIterable(INTERNAL, address, this);
                return null;
              }
              query(source) {
                const sourceLength = lengthBytesUTF8(source);
                const sourceAddress = C._malloc(sourceLength + 1);
                stringToUTF8(source, sourceAddress, sourceLength + 1);
                const address = C._ts_query_new(this[0], sourceAddress, sourceLength, TRANSFER_BUFFER, TRANSFER_BUFFER + SIZE_OF_INT);
                if (!address) {
                  const errorId = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                  const errorByte = getValue(TRANSFER_BUFFER, "i32");
                  const errorIndex = UTF8ToString(sourceAddress, errorByte).length;
                  const suffix = source.substr(errorIndex, 100).split("\n")[0];
                  let word = suffix.match(QUERY_WORD_REGEX)[0];
                  let error;
                  switch (errorId) {
                    case 2:
                      error = new RangeError(`Bad node name '${word}'`);
                      break;
                    case 3:
                      error = new RangeError(`Bad field name '${word}'`);
                      break;
                    case 4:
                      error = new RangeError(`Bad capture name @${word}`);
                      break;
                    case 5:
                      error = new TypeError(`Bad pattern structure at offset ${errorIndex}: '${suffix}'...`);
                      word = "";
                      break;
                    default:
                      error = new SyntaxError(`Bad syntax at offset ${errorIndex}: '${suffix}'...`);
                      word = "";
                      break;
                  }
                  error.index = errorIndex;
                  error.length = word.length;
                  C._free(sourceAddress);
                  throw error;
                }
                const stringCount = C._ts_query_string_count(address);
                const captureCount = C._ts_query_capture_count(address);
                const patternCount = C._ts_query_pattern_count(address);
                const captureNames = new Array(captureCount);
                const stringValues = new Array(stringCount);
                for (let i2 = 0; i2 < captureCount; i2++) {
                  const nameAddress = C._ts_query_capture_name_for_id(address, i2, TRANSFER_BUFFER);
                  const nameLength = getValue(TRANSFER_BUFFER, "i32");
                  captureNames[i2] = UTF8ToString(nameAddress, nameLength);
                }
                for (let i2 = 0; i2 < stringCount; i2++) {
                  const valueAddress = C._ts_query_string_value_for_id(address, i2, TRANSFER_BUFFER);
                  const nameLength = getValue(TRANSFER_BUFFER, "i32");
                  stringValues[i2] = UTF8ToString(valueAddress, nameLength);
                }
                const setProperties = new Array(patternCount);
                const assertedProperties = new Array(patternCount);
                const refutedProperties = new Array(patternCount);
                const predicates = new Array(patternCount);
                const textPredicates = new Array(patternCount);
                for (let i2 = 0; i2 < patternCount; i2++) {
                  const predicatesAddress = C._ts_query_predicates_for_pattern(address, i2, TRANSFER_BUFFER);
                  const stepCount = getValue(TRANSFER_BUFFER, "i32");
                  predicates[i2] = [];
                  textPredicates[i2] = [];
                  const steps = [];
                  let stepAddress = predicatesAddress;
                  for (let j = 0; j < stepCount; j++) {
                    const stepType = getValue(stepAddress, "i32");
                    stepAddress += SIZE_OF_INT;
                    const stepValueId = getValue(stepAddress, "i32");
                    stepAddress += SIZE_OF_INT;
                    if (stepType === PREDICATE_STEP_TYPE_CAPTURE) {
                      steps.push({
                        type: "capture",
                        name: captureNames[stepValueId]
                      });
                    } else if (stepType === PREDICATE_STEP_TYPE_STRING) {
                      steps.push({
                        type: "string",
                        value: stringValues[stepValueId]
                      });
                    } else if (steps.length > 0) {
                      if (steps[0].type !== "string") {
                        throw new Error("Predicates must begin with a literal value");
                      }
                      const operator = steps[0].value;
                      let isPositive = true;
                      let matchAll = true;
                      let captureName;
                      switch (operator) {
                        case "any-not-eq?":
                        case "not-eq?":
                          isPositive = false;
                        case "any-eq?":
                        case "eq?":
                          if (steps.length !== 3) {
                            throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}`);
                          }
                          if (steps[1].type !== "capture") {
                            throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}"`);
                          }
                          matchAll = !operator.startsWith("any-");
                          if (steps[2].type === "capture") {
                            const captureName1 = steps[1].name;
                            const captureName2 = steps[2].name;
                            textPredicates[i2].push((captures) => {
                              const nodes1 = [];
                              const nodes2 = [];
                              for (const c of captures) {
                                if (c.name === captureName1) nodes1.push(c.node);
                                if (c.name === captureName2) nodes2.push(c.node);
                              }
                              const compare = (n1, n2, positive) => positive ? n1.text === n2.text : n1.text !== n2.text;
                              return matchAll ? nodes1.every((n1) => nodes2.some((n2) => compare(n1, n2, isPositive))) : nodes1.some((n1) => nodes2.some((n2) => compare(n1, n2, isPositive)));
                            });
                          } else {
                            captureName = steps[1].name;
                            const stringValue = steps[2].value;
                            const matches = (n) => n.text === stringValue;
                            const doesNotMatch = (n) => n.text !== stringValue;
                            textPredicates[i2].push((captures) => {
                              const nodes = [];
                              for (const c of captures) {
                                if (c.name === captureName) nodes.push(c.node);
                              }
                              const test = isPositive ? matches : doesNotMatch;
                              return matchAll ? nodes.every(test) : nodes.some(test);
                            });
                          }
                          break;
                        case "any-not-match?":
                        case "not-match?":
                          isPositive = false;
                        case "any-match?":
                        case "match?":
                          if (steps.length !== 3) {
                            throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}.`);
                          }
                          if (steps[1].type !== "capture") {
                            throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`);
                          }
                          if (steps[2].type !== "string") {
                            throw new Error(`Second argument of \`#${operator}\` predicate must be a string. Got @${steps[2].value}.`);
                          }
                          captureName = steps[1].name;
                          const regex = new RegExp(steps[2].value);
                          matchAll = !operator.startsWith("any-");
                          textPredicates[i2].push((captures) => {
                            const nodes = [];
                            for (const c of captures) {
                              if (c.name === captureName) nodes.push(c.node.text);
                            }
                            const test = (text, positive) => positive ? regex.test(text) : !regex.test(text);
                            if (nodes.length === 0) return !isPositive;
                            return matchAll ? nodes.every((text) => test(text, isPositive)) : nodes.some((text) => test(text, isPositive));
                          });
                          break;
                        case "set!":
                          if (steps.length < 2 || steps.length > 3) {
                            throw new Error(`Wrong number of arguments to \`#set!\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`);
                          }
                          if (steps.some((s) => s.type !== "string")) {
                            throw new Error(`Arguments to \`#set!\` predicate must be a strings.".`);
                          }
                          if (!setProperties[i2]) setProperties[i2] = {};
                          setProperties[i2][steps[1].value] = steps[2] ? steps[2].value : null;
                          break;
                        case "is?":
                        case "is-not?":
                          if (steps.length < 2 || steps.length > 3) {
                            throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`);
                          }
                          if (steps.some((s) => s.type !== "string")) {
                            throw new Error(`Arguments to \`#${operator}\` predicate must be a strings.".`);
                          }
                          const properties = operator === "is?" ? assertedProperties : refutedProperties;
                          if (!properties[i2]) properties[i2] = {};
                          properties[i2][steps[1].value] = steps[2] ? steps[2].value : null;
                          break;
                        case "not-any-of?":
                          isPositive = false;
                        case "any-of?":
                          if (steps.length < 2) {
                            throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected at least 1. Got ${steps.length - 1}.`);
                          }
                          if (steps[1].type !== "capture") {
                            throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`);
                          }
                          for (let i3 = 2; i3 < steps.length; i3++) {
                            if (steps[i3].type !== "string") {
                              throw new Error(`Arguments to \`#${operator}\` predicate must be a strings.".`);
                            }
                          }
                          captureName = steps[1].name;
                          const values = steps.slice(2).map((s) => s.value);
                          textPredicates[i2].push((captures) => {
                            const nodes = [];
                            for (const c of captures) {
                              if (c.name === captureName) nodes.push(c.node.text);
                            }
                            if (nodes.length === 0) return !isPositive;
                            return nodes.every((text) => values.includes(text)) === isPositive;
                          });
                          break;
                        default:
                          predicates[i2].push({
                            operator,
                            operands: steps.slice(1)
                          });
                      }
                      steps.length = 0;
                    }
                  }
                  Object.freeze(setProperties[i2]);
                  Object.freeze(assertedProperties[i2]);
                  Object.freeze(refutedProperties[i2]);
                }
                C._free(sourceAddress);
                return new Query(INTERNAL, address, captureNames, textPredicates, predicates, Object.freeze(setProperties), Object.freeze(assertedProperties), Object.freeze(refutedProperties));
              }
              static load(input) {
                let bytes;
                if (input instanceof Uint8Array) {
                  bytes = Promise.resolve(input);
                } else {
                  const url = input;
                  if (typeof process !== "undefined" && process.versions && process.versions.node) {
                    const fs2 = __require("fs");
                    bytes = Promise.resolve(fs2.readFileSync(url));
                  } else {
                    bytes = fetch(url).then((response) => response.arrayBuffer().then((buffer) => {
                      if (response.ok) {
                        return new Uint8Array(buffer);
                      } else {
                        const body2 = new TextDecoder("utf-8").decode(buffer);
                        throw new Error(`Language.load failed with status ${response.status}.

${body2}`);
                      }
                    }));
                  }
                }
                return bytes.then((bytes2) => loadWebAssemblyModule(bytes2, {
                  loadAsync: true
                })).then((mod) => {
                  const symbolNames = Object.keys(mod);
                  const functionName = symbolNames.find((key) => LANGUAGE_FUNCTION_REGEX.test(key) && !key.includes("external_scanner_"));
                  if (!functionName) {
                    console.log(`Couldn't find language function in WASM file. Symbols:
${JSON.stringify(symbolNames, null, 2)}`);
                  }
                  const languageAddress = mod[functionName]();
                  return new Language(INTERNAL, languageAddress);
                });
              }
            }
            class LookaheadIterable {
              constructor(internal, address, language) {
                assertInternal(internal);
                this[0] = address;
                this.language = language;
              }
              get currentTypeId() {
                return C._ts_lookahead_iterator_current_symbol(this[0]);
              }
              get currentType() {
                return this.language.types[this.currentTypeId] || "ERROR";
              }
              delete() {
                C._ts_lookahead_iterator_delete(this[0]);
                this[0] = 0;
              }
              resetState(stateId) {
                return C._ts_lookahead_iterator_reset_state(this[0], stateId);
              }
              reset(language, stateId) {
                if (C._ts_lookahead_iterator_reset(this[0], language[0], stateId)) {
                  this.language = language;
                  return true;
                }
                return false;
              }
              [Symbol.iterator]() {
                const self2 = this;
                return {
                  next() {
                    if (C._ts_lookahead_iterator_next(self2[0])) {
                      return {
                        done: false,
                        value: self2.currentType
                      };
                    }
                    return {
                      done: true,
                      value: ""
                    };
                  }
                };
              }
            }
            class Query {
              constructor(internal, address, captureNames, textPredicates, predicates, setProperties, assertedProperties, refutedProperties) {
                assertInternal(internal);
                this[0] = address;
                this.captureNames = captureNames;
                this.textPredicates = textPredicates;
                this.predicates = predicates;
                this.setProperties = setProperties;
                this.assertedProperties = assertedProperties;
                this.refutedProperties = refutedProperties;
                this.exceededMatchLimit = false;
              }
              delete() {
                C._ts_query_delete(this[0]);
                this[0] = 0;
              }
              matches(node, { startPosition = ZERO_POINT, endPosition = ZERO_POINT, startIndex = 0, endIndex = 0, matchLimit = 4294967295, maxStartDepth = 4294967295, timeoutMicros = 0 } = {}) {
                if (typeof matchLimit !== "number") {
                  throw new Error("Arguments must be numbers");
                }
                marshalNode(node);
                C._ts_query_matches_wasm(this[0], node.tree[0], startPosition.row, startPosition.column, endPosition.row, endPosition.column, startIndex, endIndex, matchLimit, maxStartDepth, timeoutMicros);
                const rawCount = getValue(TRANSFER_BUFFER, "i32");
                const startAddress = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const didExceedMatchLimit = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
                const result = new Array(rawCount);
                this.exceededMatchLimit = Boolean(didExceedMatchLimit);
                let filteredCount = 0;
                let address = startAddress;
                for (let i2 = 0; i2 < rawCount; i2++) {
                  const pattern = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  const captureCount = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  const captures = new Array(captureCount);
                  address = unmarshalCaptures(this, node.tree, address, captures);
                  if (this.textPredicates[pattern].every((p) => p(captures))) {
                    result[filteredCount] = {
                      pattern,
                      captures
                    };
                    const setProperties = this.setProperties[pattern];
                    if (setProperties) result[filteredCount].setProperties = setProperties;
                    const assertedProperties = this.assertedProperties[pattern];
                    if (assertedProperties) result[filteredCount].assertedProperties = assertedProperties;
                    const refutedProperties = this.refutedProperties[pattern];
                    if (refutedProperties) result[filteredCount].refutedProperties = refutedProperties;
                    filteredCount++;
                  }
                }
                result.length = filteredCount;
                C._free(startAddress);
                return result;
              }
              captures(node, { startPosition = ZERO_POINT, endPosition = ZERO_POINT, startIndex = 0, endIndex = 0, matchLimit = 4294967295, maxStartDepth = 4294967295, timeoutMicros = 0 } = {}) {
                if (typeof matchLimit !== "number") {
                  throw new Error("Arguments must be numbers");
                }
                marshalNode(node);
                C._ts_query_captures_wasm(this[0], node.tree[0], startPosition.row, startPosition.column, endPosition.row, endPosition.column, startIndex, endIndex, matchLimit, maxStartDepth, timeoutMicros);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const startAddress = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const didExceedMatchLimit = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
                const result = [];
                this.exceededMatchLimit = Boolean(didExceedMatchLimit);
                const captures = [];
                let address = startAddress;
                for (let i2 = 0; i2 < count; i2++) {
                  const pattern = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  const captureCount = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  const captureIndex = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  captures.length = captureCount;
                  address = unmarshalCaptures(this, node.tree, address, captures);
                  if (this.textPredicates[pattern].every((p) => p(captures))) {
                    const capture = captures[captureIndex];
                    const setProperties = this.setProperties[pattern];
                    if (setProperties) capture.setProperties = setProperties;
                    const assertedProperties = this.assertedProperties[pattern];
                    if (assertedProperties) capture.assertedProperties = assertedProperties;
                    const refutedProperties = this.refutedProperties[pattern];
                    if (refutedProperties) capture.refutedProperties = refutedProperties;
                    result.push(capture);
                  }
                }
                C._free(startAddress);
                return result;
              }
              predicatesForPattern(patternIndex) {
                return this.predicates[patternIndex];
              }
              disableCapture(captureName) {
                const captureNameLength = lengthBytesUTF8(captureName);
                const captureNameAddress = C._malloc(captureNameLength + 1);
                stringToUTF8(captureName, captureNameAddress, captureNameLength + 1);
                C._ts_query_disable_capture(this[0], captureNameAddress, captureNameLength);
                C._free(captureNameAddress);
              }
              didExceedMatchLimit() {
                return this.exceededMatchLimit;
              }
            }
            function getText(tree, startIndex, endIndex) {
              const length = endIndex - startIndex;
              let result = tree.textCallback(startIndex, null, endIndex);
              startIndex += result.length;
              while (startIndex < endIndex) {
                const string = tree.textCallback(startIndex, null, endIndex);
                if (string && string.length > 0) {
                  startIndex += string.length;
                  result += string;
                } else {
                  break;
                }
              }
              if (startIndex > endIndex) {
                result = result.slice(0, length);
              }
              return result;
            }
            function unmarshalCaptures(query, tree, address, result) {
              for (let i2 = 0, n = result.length; i2 < n; i2++) {
                const captureIndex = getValue(address, "i32");
                address += SIZE_OF_INT;
                const node = unmarshalNode(tree, address);
                address += SIZE_OF_NODE;
                result[i2] = {
                  name: query.captureNames[captureIndex],
                  node
                };
              }
              return address;
            }
            function assertInternal(x) {
              if (x !== INTERNAL) throw new Error("Illegal constructor");
            }
            function isPoint(point) {
              return point && typeof point.row === "number" && typeof point.column === "number";
            }
            function marshalNode(node) {
              let address = TRANSFER_BUFFER;
              setValue(address, node.id, "i32");
              address += SIZE_OF_INT;
              setValue(address, node.startIndex, "i32");
              address += SIZE_OF_INT;
              setValue(address, node.startPosition.row, "i32");
              address += SIZE_OF_INT;
              setValue(address, node.startPosition.column, "i32");
              address += SIZE_OF_INT;
              setValue(address, node[0], "i32");
            }
            function unmarshalNode(tree, address = TRANSFER_BUFFER) {
              const id = getValue(address, "i32");
              address += SIZE_OF_INT;
              if (id === 0) return null;
              const index = getValue(address, "i32");
              address += SIZE_OF_INT;
              const row = getValue(address, "i32");
              address += SIZE_OF_INT;
              const column = getValue(address, "i32");
              address += SIZE_OF_INT;
              const other = getValue(address, "i32");
              const result = new Node(INTERNAL, tree);
              result.id = id;
              result.startIndex = index;
              result.startPosition = {
                row,
                column
              };
              result[0] = other;
              return result;
            }
            function marshalTreeCursor(cursor, address = TRANSFER_BUFFER) {
              setValue(address + 0 * SIZE_OF_INT, cursor[0], "i32");
              setValue(address + 1 * SIZE_OF_INT, cursor[1], "i32");
              setValue(address + 2 * SIZE_OF_INT, cursor[2], "i32");
              setValue(address + 3 * SIZE_OF_INT, cursor[3], "i32");
            }
            function unmarshalTreeCursor(cursor) {
              cursor[0] = getValue(TRANSFER_BUFFER + 0 * SIZE_OF_INT, "i32");
              cursor[1] = getValue(TRANSFER_BUFFER + 1 * SIZE_OF_INT, "i32");
              cursor[2] = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
              cursor[3] = getValue(TRANSFER_BUFFER + 3 * SIZE_OF_INT, "i32");
            }
            function marshalPoint(address, point) {
              setValue(address, point.row, "i32");
              setValue(address + SIZE_OF_INT, point.column, "i32");
            }
            function unmarshalPoint(address) {
              const result = {
                row: getValue(address, "i32") >>> 0,
                column: getValue(address + SIZE_OF_INT, "i32") >>> 0
              };
              return result;
            }
            function marshalRange(address, range2) {
              marshalPoint(address, range2.startPosition);
              address += SIZE_OF_POINT;
              marshalPoint(address, range2.endPosition);
              address += SIZE_OF_POINT;
              setValue(address, range2.startIndex, "i32");
              address += SIZE_OF_INT;
              setValue(address, range2.endIndex, "i32");
              address += SIZE_OF_INT;
            }
            function unmarshalRange(address) {
              const result = {};
              result.startPosition = unmarshalPoint(address);
              address += SIZE_OF_POINT;
              result.endPosition = unmarshalPoint(address);
              address += SIZE_OF_POINT;
              result.startIndex = getValue(address, "i32") >>> 0;
              address += SIZE_OF_INT;
              result.endIndex = getValue(address, "i32") >>> 0;
              return result;
            }
            function marshalEdit(edit) {
              let address = TRANSFER_BUFFER;
              marshalPoint(address, edit.startPosition);
              address += SIZE_OF_POINT;
              marshalPoint(address, edit.oldEndPosition);
              address += SIZE_OF_POINT;
              marshalPoint(address, edit.newEndPosition);
              address += SIZE_OF_POINT;
              setValue(address, edit.startIndex, "i32");
              address += SIZE_OF_INT;
              setValue(address, edit.oldEndIndex, "i32");
              address += SIZE_OF_INT;
              setValue(address, edit.newEndIndex, "i32");
              address += SIZE_OF_INT;
            }
            for (const name2 of Object.getOwnPropertyNames(ParserImpl.prototype)) {
              Object.defineProperty(Parser.prototype, name2, {
                value: ParserImpl.prototype[name2],
                enumerable: false,
                writable: false
              });
            }
            Parser.Language = Language;
            Module.onRuntimeInitialized = () => {
              ParserImpl.init();
              resolveInitPromise();
            };
          });
        }
      }
      return Parser;
    })();
    if (typeof exports$1 === "object") {
      module.exports = TreeSitter;
    }
  }
});

// src/ir/transforms.ts
function merge(patterns) {
  return {
    now: () => patterns[0]?.now() ?? 0,
    query(begin, end) {
      const all = [];
      for (const p of patterns) {
        all.push(...p.query(begin, end));
      }
      return all.sort((a, b) => a.begin - b.begin);
    }
  };
}
function transpose(events, semitones) {
  return events.map((e) => ({
    ...e,
    note: typeof e.note === "number" ? e.note + semitones : e.note,
    freq: e.freq !== null ? e.freq * Math.pow(2, semitones / 12) : null
  }));
}
function timestretch(events, factor) {
  return events.map((e) => ({
    ...e,
    begin: e.begin * factor,
    end: e.end * factor,
    endClipped: e.endClipped * factor
  }));
}
function filter(events, pred) {
  return events.filter(pred);
}
function scaleGain(events, factor) {
  return events.map((e) => ({
    ...e,
    gain: Math.min(1, Math.max(0, e.gain * factor))
  }));
}

// src/ir/PatternIR.ts
var IR = {
  pure: () => ({ tag: "Pure" }),
  play: (note2, duration = 0.25, params = {}) => ({ tag: "Play", note: note2, duration, params: { gain: 1, velocity: 1, ...params } }),
  sleep: (duration) => ({ tag: "Sleep", duration }),
  seq: (...children) => ({ tag: "Seq", children }),
  stack: (...tracks) => ({ tag: "Stack", tracks }),
  choice: (p, then, else_ = { tag: "Pure" }) => ({ tag: "Choice", p, then, else_ }),
  every: (n, body2, default_) => ({ tag: "Every", n, body: body2, default_ }),
  cycle: (...items) => ({ tag: "Cycle", items }),
  when: (gate, body2) => ({ tag: "When", gate, body: body2 }),
  fx: (name2, params, body2) => ({ tag: "FX", name: name2, params, body: body2 }),
  ramp: (param, from, to, cycles, body2) => ({ tag: "Ramp", param, from, to, cycles, body: body2 }),
  fast: (factor, body2) => ({ tag: "Fast", factor, body: body2 }),
  slow: (factor, body2) => ({ tag: "Slow", factor, body: body2 }),
  loop: (body2) => ({ tag: "Loop", body: body2 }),
  code: (code) => ({ tag: "Code", code, lang: "strudel" })
};

// src/ir/collect.ts
var DEFAULT_CONTEXT = {
  begin: 0,
  end: Infinity,
  // no window by default — all events emitted
  time: 0,
  cycle: 0,
  duration: 1,
  speed: 1,
  params: {}
};
function noteToFreq(note2) {
  if (typeof note2 === "number") {
    return 440 * Math.pow(2, (note2 - 69) / 12);
  }
  const noteNames = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];
  const lower = note2.toLowerCase();
  for (let i2 = 0; i2 < noteNames.length; i2++) {
    const name2 = noteNames[i2];
    if (lower.startsWith(name2)) {
      const octaveStr = lower.slice(name2.length);
      const octave = parseInt(octaveStr, 10);
      if (!isNaN(octave)) {
        const midi = (octave + 1) * 12 + i2;
        return 440 * Math.pow(2, (midi - 69) / 12);
      }
    }
  }
  return null;
}
function makeEvent(ctx, note2, params) {
  const duration = ctx.duration / ctx.speed;
  const merged = { ...params, ...ctx.params };
  return {
    begin: ctx.time,
    end: ctx.time + duration,
    endClipped: ctx.time + duration,
    note: note2,
    freq: noteToFreq(note2),
    s: merged.s ?? null,
    type: merged.s ? "sample" : "synth",
    gain: merged.gain ?? 1,
    velocity: merged.velocity ?? 1,
    color: merged.color ?? null,
    params: merged
  };
}
function collect(ir, partialCtx) {
  const ctx = { ...DEFAULT_CONTEXT, ...partialCtx };
  return walk(ir, ctx);
}
function walk(ir, ctx) {
  switch (ir.tag) {
    case "Pure":
      return [];
    case "Code":
      return [];
    case "Play": {
      if (ctx.time < ctx.begin || ctx.time >= ctx.end) return [];
      const event = makeEvent(ctx, ir.note, { ...ir.params });
      return [event];
    }
    case "Sleep":
      return [];
    case "Seq": {
      if (ir.children.length === 0) return [];
      const slotDuration = ctx.duration / ir.children.length;
      const events = [];
      let cursor = ctx.time;
      for (const child of ir.children) {
        const childCtx = {
          ...ctx,
          time: cursor,
          duration: slotDuration
        };
        const childEvents = walk(child, childCtx);
        events.push(...childEvents);
        cursor += slotDuration / ctx.speed;
      }
      return events;
    }
    case "Stack": {
      const events = [];
      for (const track of ir.tracks) {
        events.push(...walk(track, ctx));
      }
      return events;
    }
    case "Choice": {
      const chosen = Math.random() < ir.p ? ir.then : ir.else_;
      return walk(chosen, ctx);
    }
    case "Every": {
      const fires = ctx.cycle % ir.n === 0;
      if (fires) return walk(ir.body, ctx);
      if (ir.default_) return walk(ir.default_, ctx);
      return [];
    }
    case "Cycle": {
      if (ir.items.length === 0) return [];
      const item = ir.items[ctx.cycle % ir.items.length];
      return walk(item, ctx);
    }
    case "When": {
      const slots = ir.gate.trim().split(/\s+/);
      if (slots.length === 0) return [];
      const slotIndex = Math.floor(ctx.time % 1 * slots.length);
      const slot = slots[Math.min(slotIndex, slots.length - 1)];
      const active2 = slot !== "0" && slot !== "" && slot !== "~";
      if (active2) return walk(ir.body, ctx);
      return [];
    }
    case "FX": {
      const childCtx = {
        ...ctx,
        params: { ...ctx.params, ...ir.params }
      };
      return walk(ir.body, childCtx);
    }
    case "Ramp": {
      const progress = ir.cycles > 0 ? Math.min(ctx.cycle / ir.cycles, 1) : 1;
      const value = ir.from + (ir.to - ir.from) * progress;
      const childCtx = {
        ...ctx,
        params: { ...ctx.params, [ir.param]: value }
      };
      return walk(ir.body, childCtx);
    }
    case "Fast": {
      const childCtx = {
        ...ctx,
        speed: ctx.speed * ir.factor,
        duration: ctx.duration
      };
      return walk(ir.body, childCtx);
    }
    case "Slow": {
      const childCtx = {
        ...ctx,
        speed: ctx.speed / ir.factor,
        duration: ctx.duration
      };
      return walk(ir.body, childCtx);
    }
    case "Loop": {
      return walk(ir.body, ctx);
    }
  }
}

// src/ir/toStrudel.ts
function toStrudel(ir) {
  return gen(ir);
}
function gen(ir) {
  switch (ir.tag) {
    case "Pure":
      return '""';
    case "Code":
      return ir.code;
    case "Play":
      return genPlay(ir.note, ir.params);
    case "Sleep":
      return "~";
    case "Seq": {
      if (ir.children.length === 0) return '""';
      if (canCollapse(ir.children)) {
        return collapseToMini(ir.children);
      }
      const parts2 = ir.children.map(gen);
      return `cat(${parts2.join(", ")})`;
    }
    case "Stack": {
      if (ir.tracks.length === 0) return '""';
      const parts2 = ir.tracks.map(gen);
      return `stack(
  ${parts2.join(",\n  ")}
)`;
    }
    case "Choice": {
      const thenCode = gen(ir.then);
      if (ir.else_.tag === "Pure") {
        const dropAmount = +(1 - ir.p).toFixed(4);
        return `${thenCode}.degradeBy(${dropAmount})`;
      }
      const elseCode = gen(ir.else_);
      const dropThen = +(1 - ir.p).toFixed(4);
      const dropElse = +ir.p.toFixed(4);
      return `stack(
  ${thenCode}.degradeBy(${dropThen}),
  ${elseCode}.degradeBy(${dropElse})
)`;
    }
    case "Every": {
      const base = ir.default_;
      const baseCode = base ? gen(base) : gen(ir.body);
      const transformStr = base ? extractTransform(ir.body, base) : "() => rev";
      return `${baseCode}.every(${ir.n}, ${transformStr})`;
    }
    case "Cycle": {
      if (ir.items.length === 0) return '""';
      const notes = ir.items.map((item) => {
        if (item.tag === "Play") return String(item.note);
        if (item.tag === "Sleep") return "~";
        return gen(item);
      });
      const allSimple = ir.items.every((item) => item.tag === "Play" || item.tag === "Sleep");
      if (allSimple) {
        const firstPlay = ir.items.find((i2) => i2.tag === "Play");
        if (firstPlay && firstPlay.tag === "Play" && firstPlay.params.s) {
          return `s("<${notes.join(" ")}>")`;
        }
        return `note("<${notes.join(" ")}>")`;
      }
      return `note("<${notes.join(" ")}>")`;
    }
    case "When": {
      const body2 = gen(ir.body);
      return `${body2}.mask("${ir.gate}")`;
    }
    case "FX": {
      const body2 = gen(ir.body);
      if (Object.keys(ir.params).length > 0) {
        let result = body2;
        for (const [k, v] of Object.entries(ir.params)) {
          result = `${result}.${k}(${v})`;
        }
        return result;
      }
      return `${body2}.${ir.name}()`;
    }
    case "Ramp": {
      const body2 = gen(ir.body);
      return `${body2}.${ir.param}(slow(${ir.cycles}, saw))`;
    }
    case "Fast": {
      const body2 = gen(ir.body);
      return `${body2}.fast(${ir.factor})`;
    }
    case "Slow": {
      const body2 = gen(ir.body);
      return `${body2}.slow(${ir.factor})`;
    }
    case "Loop":
      return gen(ir.body);
  }
}
function nodesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function extractTransform(body2, base) {
  if (body2.tag === "Fast" && nodesEqual(body2.body, base)) return `fast(${body2.factor})`;
  if (body2.tag === "Slow" && nodesEqual(body2.body, base)) return `slow(${body2.factor})`;
  if (body2.tag === "FX" && nodesEqual(body2.body, base)) {
    const params = Object.entries(body2.params).map(([k, v]) => `.${k}(${v})`).join("");
    return `x => x${params}`;
  }
  return `() => ${gen(body2)}`;
}
function genPlay(note2, params) {
  if (params.s) {
    return `s("${params.s}")`;
  }
  return `note("${note2}")`;
}
function canCollapse(children) {
  return children.every((child) => {
    if (child.tag === "Sleep") return true;
    if (child.tag === "Play") {
      const { s, gain, velocity, color, ...rest } = child.params;
      return Object.keys(rest).length === 0;
    }
    return false;
  });
}
function collapseToMini(children) {
  const hasSample = children.some((c) => c.tag === "Play" && c.params.s);
  const tokens = children.map((child) => {
    if (child.tag === "Sleep") return "~";
    if (child.tag === "Play") {
      if (hasSample) return String(child.params.s ?? child.note);
      return String(child.note);
    }
    return "~";
  });
  const notation = tokens.join(" ");
  if (hasSample) return `s("${notation}")`;
  return `note("${notation}")`;
}

// src/ir/serialize.ts
var PATTERN_IR_SCHEMA_VERSION = "1.0";
function patternToJSON(ir, pretty) {
  const envelope = {
    $schema: `patternir/${PATTERN_IR_SCHEMA_VERSION}`,
    tree: ir
  };
  return pretty ? JSON.stringify(envelope, null, 2) : JSON.stringify(envelope);
}
function patternFromJSON(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`PatternIR: invalid JSON \u2014 ${String(e)}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("PatternIR: expected object at root");
  }
  const envelope = parsed;
  if (!("tree" in envelope)) {
    throw new Error('PatternIR: missing "tree" field');
  }
  return validateNode(envelope.tree, "tree");
}
var VALID_TAGS = /* @__PURE__ */ new Set([
  "Pure",
  "Seq",
  "Stack",
  "Play",
  "Sleep",
  "Choice",
  "Every",
  "Cycle",
  "When",
  "FX",
  "Ramp",
  "Fast",
  "Slow",
  "Loop",
  "Code"
]);
function validateNode(raw, path) {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${path}: expected object, got ${typeof raw}`);
  }
  const node = raw;
  if (typeof node.tag !== "string") {
    throw new Error(`${path}: missing or invalid "tag" field`);
  }
  if (!VALID_TAGS.has(node.tag)) {
    throw new Error(`${path}: unknown tag "${node.tag}"`);
  }
  switch (node.tag) {
    case "Pure":
      return { tag: "Pure" };
    case "Seq": {
      requireArray(node, "children", path);
      const children = node.children.map(
        (c, i2) => validateNode(c, `${path}.children[${i2}]`)
      );
      return { tag: "Seq", children };
    }
    case "Stack": {
      requireArray(node, "tracks", path);
      const tracks = node.tracks.map(
        (t, i2) => validateNode(t, `${path}.tracks[${i2}]`)
      );
      return { tag: "Stack", tracks };
    }
    case "Play": {
      requireField(node, "note", ["string", "number"], path);
      requireField(node, "duration", ["number"], path);
      requireObject(node, "params", path);
      return {
        tag: "Play",
        note: node.note,
        duration: node.duration,
        params: node.params
      };
    }
    case "Sleep": {
      requireField(node, "duration", ["number"], path);
      return { tag: "Sleep", duration: node.duration };
    }
    case "Choice": {
      requireField(node, "p", ["number"], path);
      requireField(node, "then", ["object"], path);
      requireField(node, "else_", ["object"], path);
      return {
        tag: "Choice",
        p: node.p,
        then: validateNode(node.then, `${path}.then`),
        else_: validateNode(node.else_, `${path}.else_`)
      };
    }
    case "Every": {
      requireField(node, "n", ["number"], path);
      requireField(node, "body", ["object"], path);
      const result = {
        tag: "Every",
        n: node.n,
        body: validateNode(node.body, `${path}.body`)
      };
      if (node.default_ !== void 0) {
        result.default_ = validateNode(node.default_, `${path}.default_`);
      }
      return result;
    }
    case "Cycle": {
      requireArray(node, "items", path);
      const items = node.items.map(
        (item, i2) => validateNode(item, `${path}.items[${i2}]`)
      );
      return { tag: "Cycle", items };
    }
    case "When": {
      requireField(node, "gate", ["string"], path);
      requireField(node, "body", ["object"], path);
      return {
        tag: "When",
        gate: node.gate,
        body: validateNode(node.body, `${path}.body`)
      };
    }
    case "FX": {
      requireField(node, "name", ["string"], path);
      requireObject(node, "params", path);
      requireField(node, "body", ["object"], path);
      return {
        tag: "FX",
        name: node.name,
        params: node.params,
        body: validateNode(node.body, `${path}.body`)
      };
    }
    case "Ramp": {
      requireField(node, "param", ["string"], path);
      requireField(node, "from", ["number"], path);
      requireField(node, "to", ["number"], path);
      requireField(node, "cycles", ["number"], path);
      requireField(node, "body", ["object"], path);
      return {
        tag: "Ramp",
        param: node.param,
        from: node.from,
        to: node.to,
        cycles: node.cycles,
        body: validateNode(node.body, `${path}.body`)
      };
    }
    case "Fast": {
      requireField(node, "factor", ["number"], path);
      requireField(node, "body", ["object"], path);
      return {
        tag: "Fast",
        factor: node.factor,
        body: validateNode(node.body, `${path}.body`)
      };
    }
    case "Slow": {
      requireField(node, "factor", ["number"], path);
      requireField(node, "body", ["object"], path);
      return {
        tag: "Slow",
        factor: node.factor,
        body: validateNode(node.body, `${path}.body`)
      };
    }
    case "Loop": {
      requireField(node, "body", ["object"], path);
      return {
        tag: "Loop",
        body: validateNode(node.body, `${path}.body`)
      };
    }
    case "Code": {
      requireField(node, "code", ["string"], path);
      return { tag: "Code", code: node.code, lang: "strudel" };
    }
    default:
      throw new Error(`${path}: unhandled tag "${node.tag}"`);
  }
}
function requireField(node, key, types, path) {
  if (!(key in node)) {
    throw new Error(`${path}: missing field "${key}"`);
  }
  if (!types.includes(typeof node[key])) {
    throw new Error(
      `${path}: field "${key}" must be ${types.join(" or ")}, got ${typeof node[key]}`
    );
  }
}
function requireArray(node, key, path) {
  if (!(key in node) || !Array.isArray(node[key])) {
    throw new Error(`${path}: field "${key}" must be an array`);
  }
}
function requireObject(node, key, path) {
  if (!(key in node) || typeof node[key] !== "object" || node[key] === null || Array.isArray(node[key])) {
    throw new Error(`${path}: field "${key}" must be an object`);
  }
}

// src/ir/parseMini.ts
function parseMini(input, isSample = false) {
  const trimmed = input.trim();
  if (!trimmed) return IR.pure();
  try {
    const tokens = tokenize(trimmed);
    if (tokens.length === 0) return IR.pure();
    const nodes = parseTokens(tokens, isSample);
    if (nodes.length === 0) return IR.pure();
    if (nodes.length === 1) return nodes[0];
    return IR.seq(...nodes);
  } catch {
    return IR.code(input);
  }
}
function tokenize(input) {
  const tokens = [];
  let i2 = 0;
  while (i2 < input.length) {
    const ch = input[i2];
    if (/\s/.test(ch)) {
      i2++;
      continue;
    }
    if (ch === "[") {
      tokens.push({ type: "lbracket" });
      i2++;
      continue;
    }
    if (ch === "]") {
      tokens.push({ type: "rbracket" });
      i2++;
      continue;
    }
    if (ch === "<") {
      tokens.push({ type: "langle" });
      i2++;
      continue;
    }
    if (ch === ">") {
      tokens.push({ type: "rangle" });
      i2++;
      continue;
    }
    if (ch === "~") {
      tokens.push({ type: "rest" });
      i2++;
      continue;
    }
    if (/[a-zA-Z0-9#-]/.test(ch)) {
      let atom = "";
      while (i2 < input.length && /[a-zA-Z0-9#\-_.]/.test(input[i2])) {
        atom += input[i2++];
      }
      tokens.push({ type: "atom", value: atom });
      if (i2 < input.length && input[i2] === "*") {
        i2++;
        let numStr = "";
        while (i2 < input.length && /[0-9.]/.test(input[i2])) numStr += input[i2++];
        const factor = parseFloat(numStr);
        if (!isNaN(factor) && factor > 0) {
          tokens.push({ type: "repeat", factor });
        }
      } else if (i2 < input.length && input[i2] === "?") {
        i2++;
        tokens.push({ type: "sometimes" });
      }
      continue;
    }
    i2++;
  }
  return tokens;
}
function parseTokens(tokens, isSample) {
  const nodes = [];
  let i2 = 0;
  while (i2 < tokens.length) {
    const tok = tokens[i2];
    if (tok.type === "atom") {
      const note2 = tok.value;
      let node = isSample ? IR.play(note2, 1, { s: note2 }) : IR.play(note2);
      i2++;
      if (i2 < tokens.length) {
        const next = tokens[i2];
        if (next.type === "repeat") {
          node = IR.fast(next.factor, node);
          i2++;
        } else if (next.type === "sometimes") {
          node = IR.choice(0.5, node, IR.pure());
          i2++;
        }
      }
      nodes.push(node);
    } else if (tok.type === "rest") {
      nodes.push(IR.sleep(1));
      i2++;
    } else if (tok.type === "lbracket") {
      i2++;
      const subTokens = [];
      let depth = 1;
      while (i2 < tokens.length && depth > 0) {
        const t = tokens[i2];
        if (t.type === "lbracket") depth++;
        if (t.type === "rbracket") {
          depth--;
          if (depth === 0) {
            i2++;
            break;
          }
        }
        subTokens.push(t);
        i2++;
      }
      const subNodes = parseTokens(subTokens, isSample);
      if (subNodes.length > 0) {
        nodes.push(subNodes.length === 1 ? subNodes[0] : IR.seq(...subNodes));
      }
    } else if (tok.type === "langle") {
      i2++;
      const cycleTokens = [];
      let depth = 1;
      while (i2 < tokens.length && depth > 0) {
        const t = tokens[i2];
        if (t.type === "langle") depth++;
        if (t.type === "rangle") {
          depth--;
          if (depth === 0) {
            i2++;
            break;
          }
        }
        cycleTokens.push(t);
        i2++;
      }
      const cycleNodes = parseTokens(cycleTokens, isSample);
      if (cycleNodes.length > 0) {
        nodes.push(IR.cycle(...cycleNodes));
      }
    } else {
      i2++;
    }
  }
  return nodes;
}

// src/ir/parseStrudel.ts
function parseStrudel(code) {
  if (!code.trim()) return IR.pure();
  try {
    const tracks = extractTracks(code);
    if (tracks.length === 0) {
      return parseExpression(code.trim());
    }
    if (tracks.length === 1) {
      return parseExpression(tracks[0]);
    }
    return IR.stack(...tracks.map(parseExpression));
  } catch {
    return IR.code(code);
  }
}
function extractTracks(code) {
  const lines = code.split("\n");
  const hasPrefix = lines.some((l) => l.trim().startsWith("$:"));
  if (!hasPrefix) return [];
  const trackExprs = [];
  let current = "";
  for (const line2 of lines) {
    const trimmed = line2.trim();
    if (trimmed.startsWith("$:")) {
      if (current) trackExprs.push(current.trim());
      current = trimmed.slice(2).trim();
    } else if (current && trimmed) {
      current += "\n" + trimmed;
    }
  }
  if (current) trackExprs.push(current.trim());
  return trackExprs;
}
function parseExpression(expr) {
  if (!expr.trim()) return IR.pure();
  try {
    const { root, chain } = splitRootAndChain(expr.trim());
    const rootIR = parseRoot(root);
    if (rootIR.tag === "Code" && !chain.trim()) {
      return IR.code(expr);
    }
    if (rootIR.tag === "Code") {
      return IR.code(expr);
    }
    const ir = applyChain(rootIR, chain);
    return ir;
  } catch {
    return IR.code(expr);
  }
}
function parseRoot(root) {
  const trimmed = root.trim();
  const noteMatch = trimmed.match(/^(?:note|n)\s*\(\s*"([^"]*)"\s*\)/);
  if (noteMatch) {
    return parseMini(noteMatch[1], false);
  }
  const sMatch = trimmed.match(/^s\s*\(\s*"([^"]*)"\s*\)/);
  if (sMatch) {
    return parseMini(sMatch[1], true);
  }
  const stackMatch = trimmed.match(/^stack\s*\(/);
  if (stackMatch) {
    const inner = extractParenContent(trimmed, "stack(");
    if (inner !== null) {
      const args2 = splitArgs(inner);
      const tracks = args2.map((a) => parseExpression(a.trim()));
      if (tracks.length === 0) return IR.pure();
      if (tracks.length === 1) return tracks[0];
      return IR.stack(...tracks);
    }
  }
  return IR.code(trimmed);
}
function applyChain(ir, chain) {
  if (!chain.trim()) return ir;
  let remaining = chain.trim();
  let current = ir;
  while (remaining.startsWith(".")) {
    const { method, args: args2, rest } = extractNextMethod(remaining);
    if (!method) break;
    current = applyMethod(current, method, args2);
    remaining = rest;
  }
  return current;
}
function applyMethod(ir, method, args2) {
  switch (method) {
    case "fast": {
      const n = parseFloat(args2.trim());
      if (!isNaN(n)) return IR.fast(n, ir);
      return ir;
    }
    case "slow": {
      const n = parseFloat(args2.trim());
      if (!isNaN(n)) return IR.slow(n, ir);
      return ir;
    }
    case "every": {
      const [nStr, transformStr] = splitFirstArg(args2);
      const n = parseInt(nStr.trim(), 10);
      if (isNaN(n)) return ir;
      const transform = transformStr ? parseTransform(transformStr.trim(), ir) : ir;
      return IR.every(n, transform, ir);
    }
    case "sometimes": {
      const transform = args2.trim() ? parseTransform(args2.trim(), ir) : ir;
      return IR.choice(0.5, transform, ir);
    }
    case "sometimesBy": {
      const [pStr, transformStr] = splitFirstArg(args2);
      const p = parseFloat(pStr.trim());
      if (isNaN(p)) return ir;
      const transform = transformStr ? parseTransform(transformStr.trim(), ir) : ir;
      return IR.choice(p, transform, ir);
    }
    case "mask": {
      const gateMatch = args2.trim().match(/^"([^"]*)"$/);
      if (gateMatch) return IR.when(gateMatch[1], ir);
      return ir;
    }
    case "gain": {
      const val = parseFloat(args2.trim());
      if (!isNaN(val)) return IR.fx("gain", { gain: val }, ir);
      return ir;
    }
    case "pan": {
      const val = parseFloat(args2.trim());
      if (!isNaN(val)) return IR.fx("pan", { pan: val }, ir);
      return ir;
    }
    case "room":
    case "delay":
    case "reverb":
    case "crush":
    case "distort":
    case "vowel":
    case "speed":
    case "begin":
    case "end":
    case "cut":
    case "cutoff":
    case "resonance":
    case "lpf":
    case "hpf": {
      const val = parseFloat(args2.trim());
      if (!isNaN(val)) return IR.fx(method, { [method]: val }, ir);
      return ir;
    }
    case "p":
      return ir;
    default:
      return ir;
  }
}
function parseTransform(transformStr, defaultIr) {
  const str = transformStr.trim();
  const fastMatch = str.match(/^fast\s*\(\s*([0-9.]+)\s*\)$/);
  if (fastMatch) {
    const n = parseFloat(fastMatch[1]);
    if (!isNaN(n)) return IR.fast(n, defaultIr);
  }
  const slowMatch = str.match(/^slow\s*\(\s*([0-9.]+)\s*\)$/);
  if (slowMatch) {
    const n = parseFloat(slowMatch[1]);
    if (!isNaN(n)) return IR.slow(n, defaultIr);
  }
  const arrowMatch = str.match(/^[a-z]\s*=>\s*[a-z]\s*\.(.+)$/);
  if (arrowMatch) {
    return applyChain(defaultIr, "." + arrowMatch[1]);
  }
  return defaultIr;
}
function splitRootAndChain(expr) {
  let i2 = 0;
  while (i2 < expr.length && /[a-zA-Z0-9_$]/.test(expr[i2])) i2++;
  if (i2 < expr.length && expr[i2] === "(") {
    const closeIdx = findMatchingParen(expr, i2);
    if (closeIdx !== -1) {
      i2 = closeIdx + 1;
    }
  }
  return {
    root: expr.slice(0, i2),
    chain: expr.slice(i2)
  };
}
function extractNextMethod(chain) {
  if (!chain.startsWith(".")) return { method: "", args: "", rest: chain };
  let i2 = 1;
  let method = "";
  while (i2 < chain.length && /[a-zA-Z0-9_$]/.test(chain[i2])) {
    method += chain[i2++];
  }
  if (!method) return { method: "", args: "", rest: chain };
  let args2 = "";
  let rest = chain.slice(i2);
  if (rest.startsWith("(")) {
    const closeIdx = findMatchingParen(rest, 0);
    if (closeIdx !== -1) {
      args2 = rest.slice(1, closeIdx);
      rest = rest.slice(closeIdx + 1);
    }
  }
  return { method, args: args2, rest };
}
function findMatchingParen(str, startIdx) {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  for (let i2 = startIdx; i2 < str.length; i2++) {
    const ch = str[i2];
    if (inString) {
      if (ch === stringChar && str[i2 - 1] !== "\\") inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return i2;
    }
  }
  return -1;
}
function extractParenContent(expr, prefix) {
  const start2 = expr.indexOf(prefix);
  if (start2 === -1) return null;
  const parenStart = start2 + prefix.length - 1;
  const closeIdx = findMatchingParen(expr, parenStart);
  if (closeIdx === -1) return null;
  return expr.slice(parenStart + 1, closeIdx);
}
function splitArgs(argsStr) {
  const args2 = [];
  let depth = 0;
  let current = "";
  let inString = false;
  let stringChar = "";
  for (let i2 = 0; i2 < argsStr.length; i2++) {
    const ch = argsStr[i2];
    if (inString) {
      current += ch;
      if (ch === stringChar && argsStr[i2 - 1] !== "\\") inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      current += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      args2.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args2.push(current.trim());
  return args2;
}
function splitFirstArg(argsStr) {
  const parts2 = splitArgs(argsStr);
  if (parts2.length === 0) return ["", ""];
  if (parts2.length === 1) return [parts2[0], ""];
  return [parts2[0], parts2.slice(1).join(", ")];
}

// src/ir/propagation.ts
function propagate(bag, systems) {
  const sorted = [...systems].sort((a, b) => a.stratum - b.stratum);
  let current = bag;
  for (const system of sorted) {
    const hasAllInputs = system.inputs.every(
      (key) => current[key] !== void 0 && current[key] !== null
    );
    if (!hasAllInputs) continue;
    current = system.run(current);
  }
  return current;
}
var StrudelParseSystem = {
  name: "StrudelParseSystem",
  stratum: 1,
  inputs: ["strudelCode"],
  outputs: ["patternIR"],
  run(bag) {
    if (!bag.strudelCode) return bag;
    return { ...bag, patternIR: parseStrudel(bag.strudelCode) };
  }
};
var IREventCollectSystem = {
  name: "IREventCollectSystem",
  stratum: 2,
  inputs: ["patternIR"],
  outputs: ["irEvents"],
  run(bag) {
    if (!bag.patternIR) return bag;
    return { ...bag, irEvents: collect(bag.patternIR) };
  }
};

// src/engine/noteToMidi.ts
function noteToMidi(note2) {
  if (typeof note2 === "number") return Math.round(note2);
  if (typeof note2 !== "string") return null;
  const m = note2.toLowerCase().match(/^([a-g])(b|#)?(-?\d+)$/);
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const acc = m[2] === "b" ? -1 : m[2] === "#" ? 1 : 0;
  return (parseInt(m[3]) + 1) * 12 + base[m[1]] + acc;
}

// src/engine/HapStream.ts
var HapStream = class {
  constructor() {
    this.handlers = /* @__PURE__ */ new Set();
  }
  on(handler) {
    this.handlers.add(handler);
  }
  off(handler) {
    this.handlers.delete(handler);
  }
  /**
   * Called by the engine scheduler for each scheduled Hap.
   * Enriches the raw data and fans it out to all subscribers.
   *
   * Parameters match Strudel's onTrigger signature:
   *   (hap, deadline, duration, cps, t)
   */
  emit(hap, deadline, duration, cps, audioCtxCurrentTime) {
    const scheduledAheadMs = (deadline - audioCtxCurrentTime) * 1e3;
    const audioDuration = duration;
    const event = {
      hap,
      audioTime: deadline,
      audioDuration,
      scheduledAheadMs,
      midiNote: noteToMidi(hap?.value?.note ?? hap?.value?.n),
      s: hap?.value?.s ?? null,
      color: hap?.value?.color ?? null,
      loc: hap?.context?.locations ?? hap?.context?.loc ?? null
    };
    this.emitEvent(event);
  }
  /**
   * Emit a pre-constructed HapEvent directly.
   * Preferred API for non-Strudel engines that don't have raw hap objects.
   */
  emitEvent(event) {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
      }
    }
  }
  dispose() {
    this.handlers.clear();
  }
};

// src/engine/WavEncoder.ts
var WavEncoder = class {
  /**
   * Encode an AudioBuffer (e.g. from OfflineAudioContext) into a WAV Blob.
   */
  static encode(buffer) {
    const L = buffer.getChannelData(0);
    const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
    return this.encodeChunks([L], [R], buffer.sampleRate);
  }
  /**
   * Encode interleaved stereo chunks (e.g. from ScriptProcessorNode) into a WAV Blob.
   * Samples are clamped to [-1, 1] then converted to 16-bit signed integers.
   */
  static encodeChunks(chunksL, chunksR, sampleRate) {
    const totalSamples = chunksL.reduce((n, c) => n + c.length, 0);
    const numChannels = 2;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = totalSamples * blockAlign;
    const bufferSize = 44 + dataSize;
    const ab = new ArrayBuffer(bufferSize);
    const view = new DataView(ab);
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let chunk = 0; chunk < chunksL.length; chunk++) {
      const l = chunksL[chunk];
      const r = chunksR[chunk] ?? l;
      for (let i2 = 0; i2 < l.length; i2++) {
        view.setInt16(offset, floatToInt16(l[i2]), true);
        offset += 2;
        view.setInt16(offset, floatToInt16(r[i2]), true);
        offset += 2;
      }
    }
    return new Blob([ab], { type: "audio/wav" });
  }
};
function writeString(view, offset, str) {
  for (let i2 = 0; i2 < str.length; i2++) {
    view.setUint8(offset + i2, str.charCodeAt(i2));
  }
}
function floatToInt16(sample) {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 32768 : clamped * 32767;
}

// src/engine/LiveRecorder.ts
var LiveRecorder = class {
  static capture(analyser, ctx, duration) {
    return new Promise((resolve) => {
      const bufferSize = 4096;
      const processor = ctx.createScriptProcessor(bufferSize, 2, 2);
      const chunksL = [];
      const chunksR = [];
      processor.onaudioprocess = (e) => {
        chunksL.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        chunksR.push(new Float32Array(e.inputBuffer.getChannelData(1)));
        e.outputBuffer.getChannelData(0).set(e.inputBuffer.getChannelData(0));
        e.outputBuffer.getChannelData(1).set(e.inputBuffer.getChannelData(1));
      };
      analyser.connect(processor);
      processor.connect(ctx.destination);
      setTimeout(() => {
        processor.disconnect();
        try {
          analyser.disconnect(processor);
        } catch {
        }
        resolve(WavEncoder.encodeChunks(chunksL, chunksR, ctx.sampleRate));
      }, duration * 1e3);
    });
  }
};

// src/engine/OfflineRenderer.ts
var OfflineRenderer = class {
  static async render(code, duration, sampleRate) {
    const mini = await import('@strudel/mini');
    mini.miniAllStrings();
    await import('@strudel/tonal');
    const { evaluate } = await import('@strudel/core');
    const { transpiler } = await import('@strudel/transpiler');
    const result = await evaluate(code, transpiler);
    const pattern = result.pattern;
    if (!pattern) {
      throw new Error("OfflineRenderer: no pattern returned from evaluate()");
    }
    const cps = extractCps(code);
    const numFrames = Math.ceil(duration * sampleRate);
    const offlineCtx = new OfflineAudioContext(2, numFrames, sampleRate);
    const haps = pattern.queryArc(0, duration * cps);
    for (const hap of haps) {
      if (typeof hap.hasOnset === "function" && !hap.hasOnset()) continue;
      const startCycle = hap.whole?.begin?.valueOf() ?? hap.part?.begin?.valueOf() ?? 0;
      const endCycle = hap.whole?.end?.valueOf() ?? hap.part?.end?.valueOf() ?? startCycle + 1;
      const startTime = startCycle / cps;
      const endTime = endCycle / cps;
      if (startTime >= duration) continue;
      const s = hap.value?.s ?? "sine";
      const oscType = toOscType(s);
      if (!oscType) continue;
      const midi = noteToMidi(hap.value?.note ?? hap.value?.n);
      if (midi === null) continue;
      const freq = midiToFreq(midi);
      const gain = Math.min(1, Math.max(0, hap.value?.gain ?? 0.7));
      const release = Math.min(hap.value?.release ?? 0.1, endTime - startTime);
      renderNote(offlineCtx, oscType, freq, gain, release, startTime, Math.min(endTime, duration));
    }
    const audioBuffer = await offlineCtx.startRendering();
    return WavEncoder.encode(audioBuffer);
  }
};
function extractCps(code) {
  const m = code.match(/setcps\s*\(\s*([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)/);
  if (!m) return 1;
  const num = parseFloat(m[1]);
  const den = m[2] ? parseFloat(m[2]) : 1;
  return den > 0 ? num / den : 1;
}
function toOscType(s) {
  const norm = s.toLowerCase().replace(/:\d+$/, "");
  if (norm === "sine") return "sine";
  if (norm === "sawtooth" || norm === "saw") return "sawtooth";
  if (norm === "square") return "square";
  if (norm === "triangle" || norm === "tri") return "triangle";
  return null;
}
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
function renderNote(ctx, oscType, freq, gain, release, startTime, endTime) {
  const osc = ctx.createOscillator();
  osc.type = oscType;
  osc.frequency.value = freq;
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(gain, startTime);
  gainNode.gain.setValueAtTime(gain, Math.max(startTime, endTime - release));
  gainNode.gain.exponentialRampToValueAtTime(1e-4, endTime);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(endTime + 1e-3);
}

// src/engine/NormalizedHap.ts
function normalizeStrudelHap(hap) {
  const begin = Number(hap.whole?.begin ?? 0);
  const end = Number(hap.whole?.end ?? begin + 0.25);
  const endClipped = Number(hap.endClipped ?? end);
  const value = hap.value;
  return {
    begin,
    end,
    endClipped,
    note: value?.note ?? value?.n ?? null,
    freq: typeof value?.freq === "number" ? value.freq : null,
    s: value?.s ?? null,
    gain: value?.gain ?? 1,
    velocity: value?.velocity ?? 1,
    color: value?.color ?? null
  };
}

// src/engine/StrudelEngine.ts
function extractVizName(rawArg) {
  if (typeof rawArg === "string") return rawArg || void 0;
  const pat = rawArg;
  if (!pat || !pat._Pattern || typeof pat.queryArc !== "function") {
    return void 0;
  }
  const renderHapValue = (v) => {
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.join(":");
    if (v == null) return "";
    return String(v);
  };
  let haps;
  try {
    haps = pat.queryArc(0, 1);
  } catch {
    return void 0;
  }
  if (haps.length === 0) return void 0;
  if (haps.length === 1) {
    const out3 = renderHapValue(haps[0].value);
    return out3 === "" ? void 0 : out3;
  }
  const out2 = haps.map((h) => renderHapValue(h.value)).join(" ");
  return out2 === "" ? void 0 : out2;
}
var StrudelEngine = class {
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.repl = null;
    this.audioCtx = null;
    this.analyserNode = null;
    this.hapStream = new HapStream();
    this.initialized = false;
    // Resolve function for the current in-flight evaluate() call
    this.evalResolve = null;
    // Runtime audio error handler (e.g. "sound X not found" during scheduling)
    this.runtimeErrorHandler = null;
    // Sound names registered after init() — used for editor autocompletion
    this.loadedSoundNames = [];
    // Per-track PatternSchedulers captured during the last evaluate() call
    this.trackSchedulers = /* @__PURE__ */ new Map();
    // Per-track viz requests captured during the last evaluate() call
    this.vizRequests = /* @__PURE__ */ new Map();
    // Reference to superdough audio controller (set during init)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.audioController = null;
    // Per-track AnalyserNodes keyed by captureId, side-tapped off the
    // superdough Orbit each captured pattern plays through.
    this.trackAnalysers = /* @__PURE__ */ new Map();
    // The orbit each tracked analyser is tapped from — lets re-evaluate reuse
    // existing analysers when the captureId/orbit pair hasn't changed.
    this.trackOrbit = /* @__PURE__ */ new Map();
    // Code from the last successful evaluate() — used by buildVizRequestsWithLines
    this.lastEvaluatedCode = "";
    // Pattern IR from the last successful evaluate() — derived by propagation
    this.lastPatternIR = null;
    this.lastIREvents = [];
  }
  async init() {
    if (this.initialized) return;
    const [coreMod, miniMod, tonalMod, webaudioMod, soundfontsMod, xenMod, midiMod] = await Promise.all([
      import('@strudel/core'),
      import('@strudel/mini'),
      import('@strudel/tonal'),
      import('@strudel/webaudio'),
      import('@strudel/soundfonts'),
      import('@strudel/xen'),
      import('@strudel/midi')
    ]);
    await coreMod.evalScope(coreMod, miniMod, tonalMod, webaudioMod, soundfontsMod, xenMod, midiMod);
    miniMod.miniAllStrings();
    const { transpiler } = await import('@strudel/transpiler');
    const { initAudio, getAudioContext, webaudioOutput, webaudioRepl } = webaudioMod;
    await initAudio();
    webaudioMod.registerSynthSounds();
    webaudioMod.registerZZFXSounds();
    soundfontsMod.registerSoundfonts();
    await webaudioMod.samples("github:tidalcycles/Dirt-Samples/master");
    const soundMapData = webaudioMod.soundMap?.get() ?? {};
    this.loadedSoundNames = Object.keys(soundMapData).filter((k) => !k.startsWith("_"));
    this.audioCtx = getAudioContext();
    const audioCtx = this.audioCtx;
    this.analyserNode = audioCtx.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.analyserNode.smoothingTimeConstant = 0.8;
    const audioController = webaudioMod.getSuperdoughAudioController();
    this.audioController = audioController;
    audioController.output.destinationGain.connect(this.analyserNode);
    const hapStream = this.hapStream;
    const audioCtxRef = audioCtx;
    const wrappedOutput = async (hap, deadline, duration, cps, t) => {
      hapStream.emit(hap, deadline, duration, cps, audioCtxRef.currentTime);
      try {
        return await webaudioOutput(hap, deadline, duration, cps, t);
      } catch (err2) {
        const error = err2 instanceof Error ? err2 : new Error(String(err2));
        this.runtimeErrorHandler?.(error);
      }
    };
    this.repl = webaudioRepl({
      transpiler,
      defaultOutput: wrappedOutput,
      onEvalError: (err2) => {
        this.evalResolve?.({ error: err2 });
        this.evalResolve = null;
      }
    });
    this.initialized = true;
  }
  async evaluate(code) {
    if (!this.initialized) await this.init();
    this.lastEvaluatedCode = code;
    const capturedPatterns = /* @__PURE__ */ new Map();
    const capturedVizRequests = /* @__PURE__ */ new Map();
    let anonIndex = 0;
    let autoOrbitNext = 100;
    const probeExplicitOrbit = (pat) => {
      try {
        const haps = pat.queryArc(0, 1);
        for (const h of haps) {
          if (h?.value?.orbit !== void 0) return true;
        }
        const more = pat.queryArc(0, 4);
        for (const h of more) {
          if (h?.value?.orbit !== void 0) return true;
        }
      } catch {
      }
      return false;
    };
    const { Pattern } = await import('@strudel/core');
    const savedDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, "p");
    const savedVizDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, "viz");
    const legacyVizNames = ["pianoroll", "punchcard", "wordfall", "scope", "fscope", "spectrum", "spiral", "pitchwheel", "markCSS"];
    const savedLegacyDescriptors = /* @__PURE__ */ new Map();
    Object.defineProperty(Pattern.prototype, "p", {
      configurable: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set(strudelFn) {
        const strudelViz = Pattern.prototype.viz;
        Object.defineProperty(Pattern.prototype, "viz", {
          configurable: true,
          writable: true,
          value: function(vizName) {
            const resolvedName = extractVizName(vizName);
            const result = strudelViz ? strudelViz.call(this, vizName) : this;
            if (resolvedName) {
              result._pendingViz = resolvedName;
            }
            return result;
          }
        });
        for (const name2 of legacyVizNames) {
          const methodName = `_${name2}`;
          savedLegacyDescriptors.set(methodName, Object.getOwnPropertyDescriptor(Pattern.prototype, methodName));
          const strudelLegacy = Pattern.prototype[methodName];
          Object.defineProperty(Pattern.prototype, methodName, {
            configurable: true,
            writable: true,
            value: function(...args2) {
              const result = strudelLegacy ? strudelLegacy.apply(this, args2) : this;
              result._pendingViz = name2;
              return result;
            }
          });
        }
        Object.defineProperty(Pattern.prototype, "p", {
          configurable: true,
          writable: true,
          value: function(id) {
            if (typeof id === "string" && !(id.startsWith("_") || id.endsWith("_"))) {
              let captureId = id;
              if (id.includes("$")) {
                captureId = `$${anonIndex}`;
                anonIndex++;
              }
              let vizName = "";
              if (this._pendingViz && typeof this._pendingViz === "string") {
                vizName = this._pendingViz;
                capturedVizRequests.set(captureId, vizName);
                delete this._pendingViz;
              }
              let effectivePattern = this;
              if (vizName && typeof this.orbit === "function" && !probeExplicitOrbit(this)) {
                const autoOrbit = autoOrbitNext++;
                try {
                  effectivePattern = this.orbit(autoOrbit);
                } catch {
                }
              }
              capturedPatterns.set(captureId, effectivePattern);
              return strudelFn.call(effectivePattern, id);
            }
            return strudelFn.call(this, id);
          }
        });
      }
    });
    try {
      const result = await new Promise((resolve) => {
        this.evalResolve = resolve;
        this.repl.evaluate(code).then(() => {
          if (this.evalResolve) {
            this.evalResolve({});
            this.evalResolve = null;
          }
        });
      });
      if (!result.error) {
        const sched = this.repl.scheduler;
        this.trackSchedulers = /* @__PURE__ */ new Map();
        for (const [id, pattern] of capturedPatterns) {
          const captured = pattern;
          this.trackSchedulers.set(id, {
            now: () => sched.now(),
            query: (begin, end) => {
              try {
                return captured.queryArc(begin, end).map(normalizeStrudelHap);
              } catch {
                return [];
              }
            }
          });
        }
        this.vizRequests = capturedVizRequests;
        this.rebuildTrackAnalysers(capturedPatterns);
        const irBag = propagate(
          { strudelCode: code },
          [StrudelParseSystem, IREventCollectSystem]
        );
        this.lastPatternIR = irBag.patternIR ?? null;
        this.lastIREvents = irBag.irEvents ?? [];
      } else {
        this.lastPatternIR = null;
        this.lastIREvents = [];
      }
      return result;
    } finally {
      if (savedDescriptor) {
        Object.defineProperty(Pattern.prototype, "p", savedDescriptor);
      } else {
        delete Pattern.prototype.p;
      }
      if (savedVizDescriptor) {
        Object.defineProperty(Pattern.prototype, "viz", savedVizDescriptor);
      } else {
        delete Pattern.prototype.viz;
      }
      for (const [methodName, desc] of savedLegacyDescriptors) {
        if (desc) {
          Object.defineProperty(Pattern.prototype, methodName, desc);
        } else {
          delete Pattern.prototype[methodName];
        }
      }
    }
  }
  get components() {
    const bag = {
      streaming: { hapStream: this.hapStream }
    };
    if (this.analyserNode && this.audioCtx) {
      bag.audio = {
        analyser: this.analyserNode,
        audioCtx: this.audioCtx,
        trackAnalysers: this.trackAnalysers.size > 0 ? this.trackAnalysers : void 0
      };
    }
    bag.queryable = {
      scheduler: this.getPatternScheduler(),
      trackSchedulers: this.trackSchedulers
    };
    if (this.vizRequests.size > 0 && this.lastEvaluatedCode) {
      bag.inlineViz = {
        vizRequests: this.buildVizRequestsWithLines(this.vizRequests, this.lastEvaluatedCode)
      };
    }
    if (this.lastPatternIR) {
      bag.ir = {
        patternIR: this.lastPatternIR,
        irEvents: this.lastIREvents
      };
    }
    return bag;
  }
  /**
   * Scans code for $: blocks and maps each track's viz request to the line
   * after the last line of that block. Mirrors the line-scanning logic in
   * viewZones.ts but returns structured data instead of creating DOM zones.
   */
  buildVizRequestsWithLines(requests, code) {
    const result = /* @__PURE__ */ new Map();
    const lines = code.split("\n");
    let anonIndex = 0;
    for (let i2 = 0; i2 < lines.length; i2++) {
      if (!lines[i2].trim().startsWith("$:")) continue;
      const key = `$${anonIndex}`;
      anonIndex++;
      const vizId = requests.get(key);
      if (!vizId) continue;
      let lastLineIdx = i2;
      for (let j = i2 + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next.startsWith("$:") || next.startsWith("setcps")) break;
        if (next !== "") lastLineIdx = j;
      }
      result.set(key, { vizId, afterLine: lastLineIdx + 1 });
    }
    return result;
  }
  play() {
    this.repl?.scheduler?.start();
  }
  stop() {
    this.repl?.scheduler?.stop();
  }
  async record(durationSeconds) {
    if (!this.analyserNode || !this.audioCtx) {
      throw new Error("StrudelEngine not initialized \u2014 call init() first");
    }
    return LiveRecorder.capture(this.analyserNode, this.audioCtx, durationSeconds);
  }
  async renderOffline(code, duration, sampleRate) {
    return OfflineRenderer.render(
      code,
      duration,
      sampleRate ?? this.audioCtx?.sampleRate ?? 44100
    );
  }
  async renderStems(stems, duration, onProgress) {
    const keys = Object.keys(stems);
    const sampleRate = this.audioCtx?.sampleRate ?? 44100;
    const blobs = await Promise.all(
      keys.map(async (key, i2) => {
        const blob = await OfflineRenderer.render(stems[key], duration, sampleRate);
        onProgress?.(key, i2 + 1, keys.length);
        return [key, blob];
      })
    );
    return Object.fromEntries(blobs);
  }
  getAnalyser() {
    if (!this.analyserNode) throw new Error("StrudelEngine not initialized");
    return this.analyserNode;
  }
  getAudioContext() {
    if (!this.audioCtx) throw new Error("StrudelEngine not initialized");
    return this.audioCtx;
  }
  on(_event, handler) {
    this.hapStream.on(handler);
  }
  off(_event, handler) {
    this.hapStream.off(handler);
  }
  getHapStream() {
    return this.hapStream;
  }
  /**
   * Returns a thin PatternScheduler wrapper around the Strudel scheduler.
   * Only available after evaluate() succeeds (scheduler.pattern is set then).
   */
  getPatternScheduler() {
    const sched = this.repl?.scheduler;
    const pattern = sched?.pattern;
    if (!sched || !pattern) return null;
    return {
      now: () => sched.now(),
      query: (begin, end) => {
        try {
          return pattern.queryArc(begin, end).map(normalizeStrudelHap);
        } catch {
          return [];
        }
      }
    };
  }
  /**
   * Returns per-track PatternSchedulers captured during the last evaluate() call.
   * Each $: block gets its own scheduler that queries its Pattern directly via queryArc.
   * Keys: anonymous "$:" → "$0", "$1"; named "d1:" → "d1".
   * Empty Map before first evaluate or after evaluate error.
   */
  getTrackSchedulers() {
    return this.trackSchedulers;
  }
  /**
   * Returns per-track viz requests captured during the last evaluate() call.
   * Maps track keys ("$0", "$1", "d1") to viz descriptor IDs ("pianoroll", "scope").
   * Only patterns that called .viz("name") in user code appear in this map.
   * Empty Map before first evaluate or if no patterns use .viz().
   */
  getVizRequests() {
    return this.vizRequests;
  }
  /** Register a handler for runtime audio errors (fires during scheduling, not evaluation). */
  setRuntimeErrorHandler(handler) {
    this.runtimeErrorHandler = handler;
  }
  /** Returns all sound names registered after init() — useful for editor autocompletion. */
  getSoundNames() {
    return this.loadedSoundNames;
  }
  dispose() {
    this.repl?.scheduler?.stop();
    this.hapStream.dispose();
    this.analyserNode?.disconnect();
    for (const analyser of this.trackAnalysers.values()) {
      try {
        analyser.disconnect();
      } catch {
      }
    }
    this.trackAnalysers.clear();
    this.trackOrbit.clear();
    this.initialized = false;
    this.repl = null;
  }
  /**
   * Query a pattern for its first non-silent hap within [0, lookahead) cycles
   * and return the orbit it uses. Default orbit is 1 (superdough's default).
   * Returns 1 for silent patterns — falls back to orbit 1 just like superdough.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolveOrbit(pattern) {
    const tryArc = (begin, end) => {
      try {
        const haps = pattern.queryArc(begin, end);
        for (const h of haps) {
          const o = h?.value?.orbit;
          if (typeof o === "number") return o;
        }
      } catch {
      }
      return null;
    };
    return tryArc(0, 1) ?? tryArc(0, 4) ?? 1;
  }
  /**
   * Reconcile trackAnalysers against capturedPatterns.
   * - Creates analysers for new captureIds, tapped off their orbit's GainNode.
   * - Reuses analysers when (captureId, orbit) is unchanged.
   * - Rewires when a captureId's orbit changed (disconnect old, tap new).
   * - Removes+disconnects analysers for captureIds no longer present.
   *
   * Safe to call repeatedly. No-op if audioController isn't available yet.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rebuildTrackAnalysers(capturedPatterns) {
    if (!this.audioController || !this.audioCtx) return;
    const seen = /* @__PURE__ */ new Set();
    for (const [captureId, pattern] of capturedPatterns) {
      seen.add(captureId);
      const orbit = this.resolveOrbit(pattern);
      const existingOrbit = this.trackOrbit.get(captureId);
      const existingAnalyser = this.trackAnalysers.get(captureId);
      if (existingAnalyser && existingOrbit === orbit) continue;
      let orbitNode = null;
      try {
        orbitNode = this.audioController.getOrbit(orbit, [0, 1]);
      } catch (err2) {
        console.warn(`[stave] Could not resolve superdough orbit ${orbit} for "${captureId}":`, err2);
      }
      const orbitOutput = orbitNode?.output;
      if (!orbitOutput) {
        continue;
      }
      const analyser = existingAnalyser ?? this.audioCtx.createAnalyser();
      if (!existingAnalyser) {
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
      } else {
        try {
          analyser.disconnect();
        } catch {
        }
      }
      try {
        orbitOutput.connect(analyser);
      } catch (err2) {
        console.warn(`[stave] Could not tap orbit ${orbit} for "${captureId}":`, err2);
        continue;
      }
      this.trackAnalysers.set(captureId, analyser);
      this.trackOrbit.set(captureId, orbit);
    }
    for (const captureId of [...this.trackAnalysers.keys()]) {
      if (seen.has(captureId)) continue;
      const a = this.trackAnalysers.get(captureId);
      if (a) {
        try {
          a.disconnect();
        } catch {
        }
      }
      this.trackAnalysers.delete(captureId);
      this.trackOrbit.delete(captureId);
    }
  }
};
var P5VizRenderer = class {
  constructor(sketch) {
    this.sketch = sketch;
    this.instance = null;
    this.hapStreamRef = { current: null };
    this.analyserRef = { current: null };
    this.schedulerRef = { current: null };
    this.containerSizeRef = {
      current: { w: 400, h: 300 }
    };
  }
  mount(container, components, size, onError) {
    try {
      this.hapStreamRef.current = components.streaming?.hapStream ?? null;
      this.analyserRef.current = components.audio?.analyser ?? null;
      this.schedulerRef.current = components.queryable?.scheduler ?? null;
      this.containerSizeRef.current = { w: size.w, h: size.h };
      const sketchFn = this.sketch(
        this.hapStreamRef,
        this.analyserRef,
        this.schedulerRef,
        this.containerSizeRef
      );
      this.instance = new p5__default.default(sketchFn, container);
      this.instance.resizeCanvas(size.w, size.h);
    } catch (e) {
      onError(e);
    }
  }
  update(components) {
    if (!this.instance) return;
    this.hapStreamRef.current = components.streaming?.hapStream ?? null;
    this.analyserRef.current = components.audio?.analyser ?? null;
    this.schedulerRef.current = components.queryable?.scheduler ?? null;
  }
  resize(w, h) {
    this.containerSizeRef.current = { w, h };
    this.instance?.resizeCanvas(w, h);
  }
  pause() {
    this.instance?.noLoop();
  }
  resume() {
    this.instance?.loop();
  }
  destroy() {
    if (this.instance) {
      const pi = this.instance;
      pi.hitCriticalError = true;
      pi.setup = function() {
      };
      pi.draw = function() {
      };
      pi.preload = function() {
      };
      pi.createCanvas = function() {
        return null;
      };
      pi._setupDone = true;
      this.instance.remove();
    }
    this.instance = null;
  }
};

// src/visualizers/vizConfig.ts
var DEFAULT_VIZ_CONFIG = {
  // Resolver
  defaultRenderer: "p5",
  // Inline view zones
  inlineZoneHeight: 150,
  // Audio analysis
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
  // Hydra
  hydraAudioBins: 4,
  hydraAutoLoop: true,
  // Pianoroll
  pianorollWindowSeconds: 6,
  pianorollCycles: 4,
  pianorollPlayhead: 0.5,
  pianorollMidiMin: 24,
  pianorollMidiMax: 96,
  // Scope / FScope
  scopeWindowSeconds: 4,
  scopeAmplitudeScale: 0.25,
  scopeBaseline: 0.75,
  // Spectrum
  spectrumMinDb: -80,
  spectrumMaxDb: 0,
  spectrumScrollSpeed: 2,
  // Colors
  backgroundColor: "#090912",
  accentColor: "#75baff",
  activeColor: "#FFCA28",
  playheadColor: "rgba(255,255,255,0.5)"
};
function createVizConfig(overrides) {
  return { ...DEFAULT_VIZ_CONFIG, ...overrides };
}
var _active = { ...DEFAULT_VIZ_CONFIG };
function getVizConfig() {
  return _active;
}
function setVizConfig(config) {
  _active = { ...DEFAULT_VIZ_CONFIG, ...config };
}

// src/visualizers/renderers/HydraVizRenderer.ts
var HapEnergyEnvelope = class {
  constructor(numBins, decay = 0.92) {
    this.numBins = numBins;
    this.bins = new Array(numBins).fill(0);
    this.decay = decay;
  }
  /** Call when a hap event fires. */
  onHap(event) {
    const gain = Math.min(1, Math.max(0, event.hap?.value?.gain ?? 1));
    const midi = event.midiNote;
    if (midi != null) {
      const bin = Math.min(this.numBins - 1, Math.floor(midi / 127 * this.numBins));
      this.bins[bin] = Math.min(1, this.bins[bin] + gain);
    } else {
      this.bins[0] = Math.min(1, this.bins[0] + gain * 0.8);
      if (this.numBins > 1) {
        this.bins[1] = Math.min(1, this.bins[1] + gain * 0.4);
      }
    }
  }
  /** Call once per animation frame to apply decay. */
  tick() {
    for (let i2 = 0; i2 < this.numBins; i2++) {
      this.bins[i2] *= this.decay;
    }
  }
};
var HydraVizRenderer = class {
  constructor(pattern) {
    this.pattern = pattern;
    this.hydra = null;
    this.canvas = null;
    this.analyser = null;
    this.freqData = null;
    this.rafId = null;
    this.paused = false;
    this.destroyed = false;
    this.hapStream = null;
    this.envelope = null;
    this.hapHandler = null;
    this.useEnvelope = false;
    this.pumpAudio = (now) => {
      if (this.paused || this.destroyed) {
        this.rafId = null;
        return;
      }
      const a = this.hydra?.synth?.a;
      if (a?.fft) {
        if (this.analyser && this.freqData) {
          this.analyser.getByteFrequencyData(this.freqData);
          const numBins = getVizConfig().hydraAudioBins;
          const binSize = Math.floor(this.freqData.length / numBins);
          for (let i2 = 0; i2 < numBins; i2++) {
            let sum = 0;
            for (let j = 0; j < binSize; j++) {
              sum += this.freqData[i2 * binSize + j];
            }
            a.fft[i2] = sum / (binSize * 255);
          }
        } else if (this.useEnvelope && this.envelope) {
          this.envelope.tick();
          const numBins = getVizConfig().hydraAudioBins;
          for (let i2 = 0; i2 < numBins; i2++) {
            a.fft[i2] = this.envelope.bins[i2];
          }
        }
      }
      if (this.hydra && typeof this.hydra.tick === "function") {
        try {
          this.hydra.tick(now ?? performance.now());
        } catch {
        }
      }
      this.rafId = requestAnimationFrame(this.pumpAudio);
    };
  }
  mount(container, components, size, onError) {
    try {
      const config = getVizConfig();
      this.analyser = components.audio?.analyser ?? null;
      this.hapStream = components.streaming?.hapStream ?? null;
      if (this.analyser) {
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this.useEnvelope = false;
      } else if (this.hapStream) {
        this.envelope = new HapEnergyEnvelope(config.hydraAudioBins);
        this.hapHandler = (e) => this.envelope?.onHap(e);
        this.hapStream.on(this.hapHandler);
        this.useEnvelope = true;
      }
      this.canvas = document.createElement("canvas");
      this.canvas.width = size.w;
      this.canvas.height = size.h;
      this.canvas.style.width = "100%";
      this.canvas.style.height = "100%";
      container.appendChild(this.canvas);
      this.initHydra(size).catch(onError);
    } catch (e) {
      onError(e);
    }
  }
  async initHydra(size) {
    const { default: Hydra } = await import('hydra-synth');
    const config = getVizConfig();
    if (!this.canvas || this.destroyed) return;
    this.hydra = new Hydra({
      canvas: this.canvas,
      width: size.w,
      height: size.h,
      detectAudio: false,
      makeGlobal: false,
      // We OWN the animation loop (see class jsdoc) — hydra must
      // not run its own rAF, or pause() can't actually halt the
      // shader render. `pumpAudio` calls `hydra.tick(time)` itself.
      autoLoop: false
    });
    const synth = this.hydra.synth;
    const audio = this.hydra.a;
    if (audio) {
      synth.a = audio;
      if (typeof audio.setCutoff === "function") audio.setCutoff(config.hydraAudioBins);
      if (typeof audio.setBins === "function") audio.setBins(config.hydraAudioBins);
      if (!Array.isArray(audio.fft) || audio.fft.length < config.hydraAudioBins) {
        audio.fft = new Array(config.hydraAudioBins).fill(0);
      }
    } else {
      synth.a = { fft: new Array(config.hydraAudioBins).fill(0) };
    }
    if (this.pattern) {
      this.pattern(synth);
    } else {
      this.defaultPattern(synth);
    }
    if (!this.paused && !this.destroyed && this.rafId == null) {
      this.rafId = requestAnimationFrame(this.pumpAudio);
    }
  }
  defaultPattern(s) {
    s.osc(10, 0.1, () => s.a.fft[0] * 4).color(1, 0.5, () => s.a.fft[1] * 2).rotate(() => s.a.fft[2] * 6.28).modulate(s.noise(3, () => s.a.fft[3] * 0.5), 0.02).out();
  }
  update(components) {
    const newAnalyser = components.audio?.analyser ?? null;
    if (newAnalyser !== this.analyser) {
      this.analyser = newAnalyser;
      this.freqData = newAnalyser ? new Uint8Array(newAnalyser.frequencyBinCount) : null;
      if (newAnalyser) {
        this.useEnvelope = false;
      }
    }
  }
  resize(w, h) {
    if (this.canvas) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.hydra?.setResolution?.(w, h);
  }
  pause() {
    this.paused = true;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
  resume() {
    this.paused = false;
    if (this.rafId == null && !this.destroyed) {
      this.rafId = requestAnimationFrame(this.pumpAudio);
    }
  }
  destroy() {
    this.destroyed = true;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.hapStream && this.hapHandler) {
      this.hapStream.off(this.hapHandler);
      this.hapHandler = null;
    }
    this.canvas?.remove();
    this.canvas = null;
    this.hydra = null;
    this.analyser = null;
    this.freqData = null;
    this.envelope = null;
    this.hapStream = null;
  }
};

// src/visualizers/renderers/hydraPresets.ts
var hydraPianoroll = (s) => {
  s.osc(() => 10 + s.a.fft[0] * 50, -0.3, 0).thresh(() => 0.3 + s.a.fft[0] * 0.5, 0.1).color(0.46, 0.71, 1).add(
    // Mid band — narrower stripes, scrolling right
    s.osc(() => 20 + s.a.fft[1] * 40, 0.2, 0).rotate(Math.PI / 2).thresh(() => 0.4 + s.a.fft[1] * 0.4, 0.08).color(1, 0.79, 0.16),
    // Stave active yellow
    () => s.a.fft[1] * 0.8
  ).add(
    // High band — fine texture, subtle shimmer
    s.osc(() => 40 + s.a.fft[2] * 60, 0.1, 0).thresh(() => 0.6 + s.a.fft[2] * 0.3, 0.05).color(0.54, 0.36, 0.96),
    // purple accent
    () => s.a.fft[2] * 0.5
  ).modulate(s.noise(2, () => s.a.fft[3] * 0.4), () => s.a.fft[0] * 0.015).scrollX(() => s.a.fft[0] * 0.02).out();
};
var hydraScope = (s) => {
  s.osc(() => 20 + s.a.fft[0] * 80, 0.1, 0).color(0.2, 0.8, 1).rotate(() => s.a.fft[1] * 0.5).modulate(s.osc(3, 0, 0), () => s.a.fft[2] * 0.1).diff(s.osc(2, 0.1, 0).rotate(0.5)).out();
};
var hydraKaleidoscope = (s) => {
  s.osc(6, 0.1, () => s.a.fft[0] * 3).kaleid(() => 3 + Math.floor(s.a.fft[1] * 8)).color(
    () => 0.5 + s.a.fft[0] * 0.5,
    () => 0.3 + s.a.fft[1] * 0.7,
    () => 0.8 + s.a.fft[2] * 0.2
  ).rotate(() => s.a.fft[3] * 3.14).modulate(s.noise(3), () => s.a.fft[0] * 0.05).out();
};

// src/visualizers/sketches/PianorollSketch.ts
var CYCLES = 4;
var PLAYHEAD = 0.5;
var BG = "#090912";
var INACTIVE_COLOR = "#75baff";
var ACTIVE_COLOR = "#FFCA28";
var PLAYHEAD_COLOR = "rgba(255,255,255,0.5)";
function getValue2(hap) {
  if (hap.freq !== null) return Math.round(12 * Math.log2(hap.freq / 440) + 69);
  if (typeof hap.note === "string") return noteToMidi(hap.note) ?? "_" + hap.note;
  if (typeof hap.note === "number") return hap.note;
  if (hap.s !== null) return "_" + hap.s;
  return 0;
}
function parseHex(hex) {
  const s = hex.replace("#", "");
  if (s.length === 6) {
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  if (s.length === 3) {
    return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)];
  }
  return null;
}
function PianorollSketch(_hapStreamRef, _analyserRef, schedulerRef) {
  return (p) => {
    p.setup = () => {
      p.createCanvas(window.innerWidth, 200);
      p.pixelDensity(window.devicePixelRatio || 1);
      p.noSmooth();
    };
    p.draw = () => {
      const W = p.width;
      const H = p.height;
      const scheduler = schedulerRef.current;
      if (!scheduler) {
        p.background(BG);
        return;
      }
      let now;
      try {
        now = scheduler.now();
      } catch {
        p.background(BG);
        return;
      }
      const from = now - CYCLES * PLAYHEAD;
      const to = now + CYCLES * (1 - PLAYHEAD);
      const timeExtent = to - from;
      let haps;
      try {
        haps = scheduler.query(from, to);
      } catch {
        haps = [];
      }
      const valueSet = /* @__PURE__ */ new Set();
      for (const h of haps) valueSet.add(getValue2(h));
      const foldValues = Array.from(valueSet).sort((a, b) => {
        if (typeof a === "number" && typeof b === "number") return a - b;
        if (typeof a === "number") return -1;
        if (typeof b === "number") return 1;
        return String(a).localeCompare(String(b));
      });
      const foldCount = Math.max(1, foldValues.length);
      const barH = H / foldCount;
      p.background(BG);
      p.noStroke();
      for (const hap of haps) {
        const value = getValue2(hap);
        const laneIdx = foldValues.indexOf(value);
        if (laneIdx < 0) continue;
        const duration = hap.end - hap.begin;
        const x = (hap.begin - now + CYCLES * PLAYHEAD) / timeExtent * W;
        const noteW = Math.max(2, duration / timeExtent * W);
        const y = (foldCount - 1 - laneIdx) / foldCount * H;
        const isActive = hap.begin <= now && hap.endClipped > now;
        const gain = Math.min(1, Math.max(0.1, hap.gain));
        const velocity = Math.min(1, Math.max(0.1, hap.velocity));
        const alpha = gain * velocity;
        const rgb = hap.color ? parseHex(String(hap.color)) : null;
        if (isActive) {
          const [r, g, b] = rgb ?? parseHex(ACTIVE_COLOR);
          p.fill(r, g, b, alpha * 255);
          p.rect(x, y + 1, noteW - 2, barH - 2);
          p.noFill();
          p.stroke(r, g, b, 255);
          p.strokeWeight(1);
          p.rect(x, y + 1, noteW - 2, barH - 2);
          p.noStroke();
        } else {
          const [r, g, b] = rgb ?? parseHex(INACTIVE_COLOR);
          p.fill(r, g, b, alpha * 180);
          p.rect(x, y + 1, noteW - 2, barH - 2);
        }
      }
      const phX = PLAYHEAD * W;
      p.stroke(PLAYHEAD_COLOR);
      p.strokeWeight(1);
      p.line(phX, 0, phX, H);
      p.noStroke();
    };
  };
}

// src/visualizers/sketches/WordfallSketch.ts
var BG2 = "#090912";
var INACTIVE_COLOR2 = "#75baff";
var ACTIVE_COLOR2 = "#ffffff";
var PLAYHEAD_COLOR2 = "rgba(255,255,255,0.5)";
var CYCLES2 = 4;
var PLAYHEAD2 = 0.5;
function getValue3(hap) {
  if (hap.freq !== null) return hap.freq;
  if (hap.note !== null) return hap.note;
  if (hap.s !== null) return "_" + hap.s;
  return 0;
}
function getLabel(hap) {
  if (hap.note !== null && hap.s !== null) return `${hap.s}:${hap.note}`;
  if (hap.note !== null) return String(hap.note);
  if (hap.s !== null) return String(hap.s);
  return "";
}
function WordfallSketch(_hapStreamRef, _analyserRef, schedulerRef) {
  return (p) => {
    p.setup = () => {
      p.createCanvas(window.innerWidth, 200);
      p.pixelDensity(window.devicePixelRatio || 1);
    };
    p.draw = () => {
      const W = p.width;
      const H = p.height;
      p.background(BG2);
      const scheduler = schedulerRef.current;
      if (!scheduler) return;
      let now;
      try {
        now = scheduler.now();
      } catch {
        return;
      }
      let haps;
      try {
        haps = scheduler.query(now - CYCLES2 * PLAYHEAD2, now + CYCLES2 * (1 - PLAYHEAD2));
      } catch {
        return;
      }
      const allValues = haps.map((h) => getValue3(h));
      const foldValues = [...new Set(allValues)].sort(
        (a, b) => typeof a === "number" && typeof b === "number" ? a - b : typeof a === "number" ? 1 : String(a).localeCompare(String(b))
      );
      if (foldValues.length === 0) return;
      const barW = W / foldValues.length;
      for (const hap of haps) {
        const hapDuration = hap.endClipped - hap.begin;
        const isActive = hap.begin <= now && hap.endClipped > now;
        const timeToHap = hap.begin - now;
        const playheadY = H * PLAYHEAD2;
        const y = playheadY - timeToHap / CYCLES2 * H;
        const durationH = hapDuration / CYCLES2 * H;
        const value = getValue3(hap);
        const foldIdx = foldValues.indexOf(value);
        const x = foldIdx * barW;
        const color = hap.color ?? INACTIVE_COLOR2;
        p.noStroke();
        if (isActive) {
          p.fill(ACTIVE_COLOR2);
        } else {
          try {
            const c = p.color(color);
            c.setAlpha(160);
            p.fill(c);
          } catch {
            p.fill(INACTIVE_COLOR2);
          }
        }
        p.rect(x + 1, y + 1, barW - 2, durationH - 2);
        if (durationH > 10 && barW > 16) {
          const label = getLabel(hap);
          if (label) {
            const fontSize = Math.min(barW * 0.55, durationH * 0.7, 11);
            p.textSize(fontSize);
            p.textAlign(p.LEFT, p.TOP);
            p.fill(isActive ? 0 : 255);
            p.noStroke();
            p.text(label, x + 3, y + 3);
          }
        }
      }
      p.stroke(PLAYHEAD_COLOR2);
      p.strokeWeight(1);
      p.line(0, H * PLAYHEAD2, W, H * PLAYHEAD2);
    };
  };
}

// src/visualizers/sketches/ScopeSketch.ts
var BG3 = "#090912";
var LINE_COLOR = "#75baff";
var PULSE_COLOR = "#75baff";
var POS = 0.75;
var SCALE = 0.25;
function ScopeSketch(_hapStreamRef, analyserRef, schedulerRef) {
  return (p) => {
    p.setup = () => {
      p.createCanvas(window.innerWidth, 200);
      p.pixelDensity(window.devicePixelRatio || 1);
      p.noFill();
    };
    p.draw = () => {
      const W = p.width;
      const H = p.height;
      p.background(BG3);
      p.stroke(40, 50, 70);
      p.strokeWeight(0.5);
      p.line(0, POS * H, W, POS * H);
      const analyser = analyserRef.current;
      if (analyser) {
        const bufferSize = analyser.frequencyBinCount;
        const data = new Float32Array(bufferSize);
        analyser.getFloatTimeDomainData(data);
        let triggerIndex = 0;
        for (let i2 = 1; i2 < bufferSize; i2++) {
          if (data[i2 - 1] > 0 && data[i2] <= 0) {
            triggerIndex = i2;
            break;
          }
        }
        const sliceWidth = W / (bufferSize - triggerIndex);
        p.stroke(LINE_COLOR);
        p.strokeWeight(2);
        p.strokeCap("round");
        p.beginShape();
        for (let i2 = triggerIndex; i2 < bufferSize; i2++) {
          const x = (i2 - triggerIndex) * sliceWidth;
          const y = (POS - SCALE * data[i2]) * H;
          p.vertex(x, y);
        }
        p.endShape();
        return;
      }
      const scheduler = schedulerRef.current;
      if (!scheduler) return;
      let now;
      try {
        now = scheduler.now();
      } catch {
        return;
      }
      const WINDOW = 4;
      const from = now - WINDOW;
      let haps;
      try {
        haps = scheduler.query(from, now + 0.1);
      } catch {
        return;
      }
      p.noStroke();
      for (const hap of haps) {
        const age = now - hap.begin;
        const decay = Math.max(0, 1 - age / WINDOW);
        const x = (hap.begin - from) / WINDOW * W;
        const pulseW = Math.max(3, (hap.end - hap.begin) / WINDOW * W);
        const pulseH = H * 0.6 * decay * hap.gain;
        const col = p.color(hap.color ?? PULSE_COLOR);
        col.setAlpha(decay * 200);
        p.fill(col);
        p.rect(x, POS * H - pulseH / 2, pulseW, pulseH, 2);
      }
      p.stroke(255, 255, 255, 80);
      p.strokeWeight(1);
      p.line(W - 2, 0, W - 2, H);
    };
  };
}

// src/visualizers/sketches/FscopeSketch.ts
var BG4 = "#090912";
var COLOR = "#75baff";
var SCALE2 = 0.25;
var POS2 = 0.75;
var LEAN = 0.5;
var MIN_DB = -100;
var MAX_DB = 0;
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function midiToFreq2(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
function resolveFreq(hap) {
  if (hap.freq !== null) return hap.freq;
  if (typeof hap.note === "number") return midiToFreq2(hap.note);
  if (typeof hap.note === "string") {
    const midi = noteToMidi(hap.note);
    return midi !== null ? midiToFreq2(midi) : null;
  }
  return null;
}
function FscopeSketch(_hapStreamRef, analyserRef, schedulerRef) {
  return (p) => {
    p.setup = () => {
      p.createCanvas(window.innerWidth, 200);
      p.pixelDensity(window.devicePixelRatio || 1);
      p.noStroke();
    };
    p.draw = () => {
      const W = p.width;
      const H = p.height;
      p.background(BG4);
      p.stroke(40, 50, 70);
      p.strokeWeight(0.5);
      p.noFill();
      p.line(0, POS2 * H, W, POS2 * H);
      p.noStroke();
      const analyser = analyserRef.current;
      if (analyser) {
        const bufferSize = analyser.frequencyBinCount;
        const data = new Float32Array(bufferSize);
        analyser.getFloatFrequencyData(data);
        const sliceWidth2 = W / bufferSize;
        p.fill(COLOR);
        for (let i2 = 0; i2 < bufferSize; i2++) {
          const normalized = clamp((data[i2] - MIN_DB) / (MAX_DB - MIN_DB), 0, 1);
          const v = normalized * SCALE2;
          const barH = v * H;
          const barY = (POS2 - v * LEAN) * H;
          p.rect(i2 * sliceWidth2, barY, Math.max(sliceWidth2, 1), barH);
        }
        return;
      }
      const scheduler = schedulerRef.current;
      if (!scheduler) return;
      let now;
      try {
        now = scheduler.now();
      } catch {
        return;
      }
      let haps;
      try {
        haps = scheduler.query(now - 0.2, now + 0.05);
      } catch {
        return;
      }
      const MIN_FREQ = 30;
      const MAX_FREQ = 4e3;
      const NUM_BINS = 64;
      const bins = new Float32Array(NUM_BINS);
      for (const hap of haps) {
        const freq = resolveFreq(hap);
        if (freq === null || freq < MIN_FREQ) continue;
        const logPos = Math.log(freq / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ);
        const binIdx = clamp(Math.floor(logPos * NUM_BINS), 0, NUM_BINS - 1);
        const age = now - hap.begin;
        const decay = Math.max(0, 1 - age / 0.5);
        bins[binIdx] = Math.max(bins[binIdx], decay * hap.gain);
      }
      const sliceWidth = W / NUM_BINS;
      for (let i2 = 0; i2 < NUM_BINS; i2++) {
        if (bins[i2] <= 0) continue;
        const v = bins[i2] * SCALE2;
        const barH = v * H;
        const barY = (POS2 - v * LEAN) * H;
        const col = p.color(COLOR);
        col.setAlpha(bins[i2] * 220);
        p.fill(col);
        p.rect(i2 * sliceWidth, barY, Math.max(sliceWidth - 1, 1), barH);
      }
    };
  };
}

// src/visualizers/sketches/SpectrumSketch.ts
var BG5 = "#090912";
var COLOR2 = "#75baff";
var MIN_DB2 = -80;
var MAX_DB2 = 0;
var SPEED = 2;
function midiToFreq3(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
function resolveFreq2(hap) {
  if (hap.freq !== null) return hap.freq;
  if (typeof hap.note === "number") return midiToFreq3(hap.note);
  if (typeof hap.note === "string") {
    const midi = noteToMidi(hap.note);
    return midi !== null ? midiToFreq3(midi) : null;
  }
  return null;
}
function SpectrumSketch(_hapStreamRef, analyserRef, schedulerRef) {
  return (p) => {
    p.setup = () => {
      p.createCanvas(window.innerWidth, 200);
      p.pixelDensity(1);
      p.noStroke();
    };
    p.draw = () => {
      const W = p.width;
      const H = p.height;
      const ctx = p.drawingContext;
      const analyser = analyserRef.current;
      if (analyser) {
        const bufferSize = analyser.frequencyBinCount;
        const data = new Float32Array(bufferSize);
        analyser.getFloatFrequencyData(data);
        const imageData2 = ctx.getImageData(0, 0, W, H);
        ctx.clearRect(0, 0, W, H);
        ctx.putImageData(imageData2, -SPEED, 0);
        const q2 = W - SPEED;
        ctx.fillStyle = COLOR2;
        for (let i2 = 0; i2 < bufferSize; i2++) {
          const normalized = Math.max(0, Math.min(1, (data[i2] - MIN_DB2) / (MAX_DB2 - MIN_DB2)));
          if (normalized <= 0) continue;
          ctx.globalAlpha = normalized;
          const yEnd = Math.log(i2 + 1) / Math.log(bufferSize) * H;
          const yStart = i2 > 0 ? Math.log(i2) / Math.log(bufferSize) * H : 0;
          const barH = Math.max(2, yEnd - yStart);
          ctx.fillRect(q2, H - yEnd, SPEED, barH);
        }
        ctx.globalAlpha = 1;
        return;
      }
      const scheduler = schedulerRef.current;
      if (!scheduler) {
        p.background(BG5);
        return;
      }
      let now;
      try {
        now = scheduler.now();
      } catch {
        p.background(BG5);
        return;
      }
      const imageData = ctx.getImageData(0, 0, W, H);
      ctx.clearRect(0, 0, W, H);
      ctx.putImageData(imageData, -SPEED, 0);
      let haps;
      try {
        haps = scheduler.query(now - 0.3, now + 0.05);
      } catch {
        return;
      }
      const q = W - SPEED;
      const MIN_FREQ = 20;
      const MAX_FREQ = 4e3;
      for (const hap of haps) {
        const freq = resolveFreq2(hap);
        if (freq === null || freq < MIN_FREQ) continue;
        const logPos = Math.log(freq / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ);
        const y = H - logPos * H;
        const barH = Math.max(4, H * 0.03);
        const age = now - hap.begin;
        const alpha = Math.max(0.1, 1 - age / 0.5) * hap.gain;
        const col = p.color(hap.color ?? COLOR2);
        col.setAlpha(alpha * 220);
        ctx.fillStyle = col.toString();
        ctx.globalAlpha = 1;
        ctx.fillRect(q, y - barH / 2, SPEED, barH);
      }
      ctx.globalAlpha = 1;
    };
  };
}

// src/visualizers/sketches/SpiralSketch.ts
var BG6 = "#090912";
var ACTIVE_COLOR3 = "#75baff";
var INACTIVE_COLOR3 = "#8a919966";
var PLAYHEAD_COLOR3 = "#ffffff";
function xyOnSpiral(rotations, margin, cx, cy, rotate) {
  const angle = ((rotations + rotate) * 360 - 90) * (Math.PI / 180);
  return [cx + Math.cos(angle) * margin * rotations, cy + Math.sin(angle) * margin * rotations];
}
function SpiralSketch(_hapStreamRef, _analyserRef, schedulerRef) {
  return (p) => {
    p.setup = () => {
      p.createCanvas(300, 200);
      p.pixelDensity(window.devicePixelRatio || 1);
      p.noFill();
    };
    p.draw = () => {
      const W = p.width;
      const H = p.height;
      p.background(BG6);
      const scheduler = schedulerRef.current;
      if (!scheduler) return;
      let now;
      try {
        now = scheduler.now();
      } catch {
        return;
      }
      const lookbehind = 2;
      const lookahead = 1;
      let haps;
      try {
        haps = scheduler.query(now - lookbehind, now + lookahead);
      } catch {
        return;
      }
      const cx = W / 2;
      const cy = H / 2;
      const size = Math.min(W, H) * 0.38;
      const margin = size / 3;
      const inset = 3;
      const rotate = now;
      for (const hap of haps) {
        const isActive = hap.begin <= now && hap.endClipped > now;
        const from = hap.begin - now + inset;
        const to = hap.endClipped - now + inset - 5e-3;
        const opacity = Math.max(0, 1 - Math.abs((hap.begin - now) / lookbehind));
        const hapColor = hap.color ?? (isActive ? ACTIVE_COLOR3 : INACTIVE_COLOR3);
        const col = p.color(hapColor);
        col.setAlpha(opacity * 255);
        p.stroke(col);
        p.strokeWeight(margin / 2);
        p.strokeCap("round");
        p.beginShape();
        const inc = 1 / 60;
        let angle2 = from;
        while (angle2 <= to) {
          const [x, y] = xyOnSpiral(angle2, margin, cx, cy, rotate);
          p.vertex(x, y);
          angle2 += inc;
        }
        p.endShape();
      }
      p.stroke(PLAYHEAD_COLOR3);
      p.strokeWeight(margin / 2);
      p.strokeCap("round");
      p.beginShape();
      let angle = inset - 0.02;
      while (angle <= inset) {
        const [x, y] = xyOnSpiral(angle, margin, cx, cy, rotate);
        p.vertex(x, y);
        angle += 1 / 60;
      }
      p.endShape();
    };
  };
}

// src/visualizers/sketches/PitchwheelSketch.ts
var BG7 = "#090912";
var BASE_COLOR = "#75baff";
var ROOT_FREQ = 440 * Math.pow(2, (36 - 69) / 12);
var EDO = 12;
function midiToFreq4(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
function getFreq(hap) {
  if (hap.freq !== null) return hap.freq;
  const midi = typeof hap.note === "number" ? hap.note : noteToMidi(String(hap.note ?? ""));
  return midi !== null ? midiToFreq4(midi) : null;
}
function freq2angle(freq, root) {
  return 0.5 - Math.log2(freq / root) % 1;
}
function circlePos(cx, cy, radius, angle) {
  const a = angle * Math.PI * 2;
  return [Math.sin(a) * radius + cx, Math.cos(a) * radius + cy];
}
function PitchwheelSketch(_hapStreamRef, _analyserRef, schedulerRef) {
  return (p) => {
    p.setup = () => {
      p.createCanvas(300, 200);
      p.pixelDensity(window.devicePixelRatio || 1);
    };
    p.draw = () => {
      const W = p.width;
      const H = p.height;
      p.background(BG7);
      const scheduler = schedulerRef.current;
      if (!scheduler) return;
      let now;
      try {
        now = scheduler.now();
      } catch {
        return;
      }
      let haps;
      try {
        haps = scheduler.query(now - 0.01, now + 0.01);
      } catch {
        return;
      }
      haps = haps.filter((h) => h.begin <= now && h.endClipped > now);
      const size = Math.min(W, H);
      const hapRadius = 6;
      const thickness = 2;
      const margin = 12;
      const radius = size / 2 - thickness / 2 - hapRadius - margin;
      const cx = W / 2;
      const cy = H / 2;
      p.noStroke();
      p.fill(BASE_COLOR + "40");
      for (let i2 = 0; i2 < EDO; i2++) {
        const angle = freq2angle(ROOT_FREQ * Math.pow(2, i2 / EDO), ROOT_FREQ);
        const [x, y] = circlePos(cx, cy, radius, angle);
        p.circle(x, y, hapRadius * 1.2);
      }
      p.noFill();
      p.stroke(BASE_COLOR + "30");
      p.strokeWeight(1);
      p.circle(cx, cy, radius * 2);
      for (const hap of haps) {
        const freq = getFreq(hap);
        if (freq === null) continue;
        const angle = freq2angle(freq, ROOT_FREQ);
        const [x, y] = circlePos(cx, cy, radius, angle);
        const color = hap.color ?? BASE_COLOR;
        const alpha = Math.min(1, hap.gain * hap.velocity);
        p.stroke(color);
        p.strokeWeight(thickness);
        p.drawingContext.globalAlpha = alpha;
        p.line(cx, cy, x, y);
        p.fill(color);
        p.noStroke();
        p.circle(x, y, hapRadius * 2);
      }
      p.drawingContext.globalAlpha = 1;
    };
  };
}

// src/visualizers/defaultDescriptors.ts
var DEFAULT_VIZ_DESCRIPTORS = [
  // p5 renderers (default for each mode)
  { id: "pianoroll", label: "Piano Roll", renderer: "p5", requires: ["streaming"], factory: () => new P5VizRenderer(PianorollSketch) },
  { id: "wordfall", label: "Wordfall", renderer: "p5", requires: ["streaming"], factory: () => new P5VizRenderer(WordfallSketch) },
  { id: "scope", label: "Scope", renderer: "p5", requires: ["streaming"], factory: () => new P5VizRenderer(ScopeSketch) },
  { id: "fscope", label: "FScope", renderer: "p5", requires: ["streaming"], factory: () => new P5VizRenderer(FscopeSketch) },
  { id: "spectrum", label: "Spectrum", renderer: "p5", requires: ["streaming"], factory: () => new P5VizRenderer(SpectrumSketch) },
  { id: "spiral", label: "Spiral", renderer: "p5", requires: ["streaming"], factory: () => new P5VizRenderer(SpiralSketch) },
  { id: "pitchwheel", label: "Pitchwheel", renderer: "p5", requires: ["streaming"], factory: () => new P5VizRenderer(PitchwheelSketch) },
  // Hydra renderers (WebGL shader-based)
  { id: "hydra", label: "Hydra", renderer: "hydra", requires: ["audio"], factory: () => new HydraVizRenderer() },
  { id: "pianoroll:hydra", label: "Piano Roll (Hydra)", renderer: "hydra", requires: ["audio"], factory: () => new HydraVizRenderer(hydraPianoroll) },
  { id: "scope:hydra", label: "Scope (Hydra)", renderer: "hydra", requires: ["audio"], factory: () => new HydraVizRenderer(hydraScope) },
  { id: "kaleidoscope:hydra", label: "Kaleidoscope", renderer: "hydra", requires: ["audio"], factory: () => new HydraVizRenderer(hydraKaleidoscope) }
];
function SplitPane({
  direction,
  children,
  initialSizes,
  minSize = 100
}) {
  const count = React__default.default.Children.count(children);
  const childArray = React__default.default.Children.toArray(children);
  const defaultSizes = initialSizes ?? Array(count).fill(100 / count);
  const [sizes, setSizes] = React.useState(defaultSizes);
  const containerRef = React.useRef(null);
  const draggingRef = React.useRef(null);
  const isHorizontal = direction === "horizontal";
  const handleMouseDown = React.useCallback((dividerIndex, e) => {
    e.preventDefault();
    draggingRef.current = dividerIndex;
    const startPos = isHorizontal ? e.clientX : e.clientY;
    const startSizes = [...sizes];
    const container = containerRef.current;
    if (!container) return;
    const containerSize = isHorizontal ? container.offsetWidth : container.offsetHeight;
    const minPct = minSize / containerSize * 100;
    const onMouseMove = (ev) => {
      if (draggingRef.current === null) return;
      const delta = isHorizontal ? ev.clientX - startPos : ev.clientY - startPos;
      const deltaPct = delta / containerSize * 100;
      const newSizes = [...startSizes];
      const i2 = dividerIndex;
      newSizes[i2] = Math.max(minPct, startSizes[i2] + deltaPct);
      newSizes[i2 + 1] = Math.max(minPct, startSizes[i2 + 1] - deltaPct);
      if (newSizes[i2] < minPct) {
        newSizes[i2] = minPct;
        newSizes[i2 + 1] = startSizes[i2] + startSizes[i2 + 1] - minPct;
      }
      if (newSizes[i2 + 1] < minPct) {
        newSizes[i2 + 1] = minPct;
        newSizes[i2] = startSizes[i2] + startSizes[i2 + 1] - minPct;
      }
      setSizes(newSizes);
    };
    const onMouseUp = () => {
      draggingRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sizes, isHorizontal, minSize]);
  React__default.default.useEffect(() => {
    if (sizes.length !== count) {
      setSizes(Array(count).fill(100 / count));
    }
  }, [count]);
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      ref: containerRef,
      style: {
        display: "flex",
        flexDirection: isHorizontal ? "row" : "column",
        width: "100%",
        height: "100%",
        overflow: "hidden"
      },
      children: childArray.map((child, i2) => /* @__PURE__ */ jsxRuntime.jsxs(React__default.default.Fragment, { children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            style: {
              [isHorizontal ? "width" : "height"]: `${sizes[i2]}%`,
              [isHorizontal ? "height" : "width"]: "100%",
              overflow: "hidden",
              position: "relative",
              minWidth: isHorizontal ? minSize : void 0,
              minHeight: !isHorizontal ? minSize : void 0
            },
            children: child
          }
        ),
        i2 < childArray.length - 1 && /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            onMouseDown: (e) => handleMouseDown(i2, e),
            style: {
              [isHorizontal ? "width" : "height"]: 4,
              [isHorizontal ? "height" : "width"]: "100%",
              background: "var(--border, rgba(255,255,255,0.1))",
              cursor: isHorizontal ? "col-resize" : "row-resize",
              flexShrink: 0,
              transition: "background 0.15s"
            },
            onMouseEnter: (e) => {
              e.currentTarget.style.background = "var(--accent, #75baff)";
            },
            onMouseLeave: (e) => {
              e.currentTarget.style.background = "var(--border, rgba(255,255,255,0.1))";
            }
          }
        )
      ] }, i2))
    }
  );
}

// src/theme/tokens.ts
var DARK_THEME_TOKENS = {
  "--accent-rgb": "106, 106, 200",
  "--stem-drums": "#f97316",
  "--stem-bass": "#06b6d4",
  "--stem-melody": "#a78bfa",
  "--stem-pad": "#10b981",
  "--code-bg": "#090912",
  "--code-foreground": "#c4b5fd",
  "--code-caret": "#7c7cff",
  "--code-selection": "rgba(124,124,255,0.25)",
  "--code-line-highlight": "rgba(124,124,255,0.05)",
  "--code-note": "#86efac",
  "--code-function": "#93c5fd",
  "--code-string": "#fcd34d",
  "--code-number": "#fb923c",
  "--code-comment": "rgba(255,255,255,0.25)",
  "--code-active-hap": "rgba(124,124,255,0.3)",
  "--font-mono": '"JetBrains Mono", "Fira Code", "Cascadia Code", "Menlo", monospace'
};
var LIGHT_THEME_TOKENS = {
  "--accent-rgb": "85, 85, 184",
  "--stem-drums": "#ea580c",
  "--stem-bass": "#0891b2",
  "--stem-melody": "#5555b8",
  "--stem-pad": "#059669",
  "--code-bg": "#f0f0f6",
  "--code-foreground": "#1e1b4b",
  "--code-caret": "#4a4ae0",
  "--code-selection": "rgba(74,74,224,0.2)",
  "--code-line-highlight": "rgba(74,74,224,0.04)",
  "--code-note": "#15803d",
  "--code-function": "#1d4ed8",
  "--code-string": "#92400e",
  "--code-number": "#c2410c",
  "--code-comment": "rgba(0,0,0,0.3)",
  "--code-active-hap": "rgba(74,74,224,0.25)",
  "--font-mono": '"JetBrains Mono", "Fira Code", "Cascadia Code", "Menlo", monospace'
};
function applyTheme(el, theme) {
  const tokens = theme === "dark" ? DARK_THEME_TOKENS : theme === "light" ? LIGHT_THEME_TOKENS : theme.tokens;
  for (const [key, value] of Object.entries(tokens)) {
    el.style.setProperty(key, value);
  }
}

// src/theme/monacoTheme.ts
function defineStrudelMonacoTheme(monaco) {
  monaco.editor.defineTheme("stave-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "strudel.pattern-start", foreground: "7c7cff", fontStyle: "bold" },
      { token: "strudel.tempo", foreground: "a78bfa" },
      { token: "strudel.function", foreground: "93c5fd" },
      { token: "strudel.note", foreground: "86efac" },
      { token: "strudel.mini.note", foreground: "86efac" },
      { token: "strudel.mini.operator", foreground: "f472b6" },
      { token: "strudel.mini.number", foreground: "fb923c" },
      { token: "string", foreground: "fcd34d" },
      { token: "number", foreground: "fb923c" },
      { token: "comment", foreground: "6b7280", fontStyle: "italic" },
      { token: "keyword", foreground: "c4b5fd" },
      // Sonic Pi tokens
      { token: "sonicpi.function", foreground: "93c5fd", fontStyle: "bold" },
      { token: "sonicpi.music", foreground: "a78bfa" },
      { token: "sonicpi.symbol", foreground: "f472b6" },
      { token: "sonicpi.note", foreground: "86efac" },
      { token: "sonicpi.kwarg", foreground: "6ee7b7" }
    ],
    colors: {
      "editor.background": "#090912",
      "editor.foreground": "#c4b5fd",
      "editorLineNumber.foreground": "#3d3d5c",
      "editorCursor.foreground": "#7c7cff",
      "editor.selectionBackground": "#6a6ac840",
      "editor.lineHighlightBackground": "#6a6ac80d",
      "editorIndentGuide.background": "#ffffff10",
      "editorWidget.background": "#0f0f1e",
      "editorSuggestWidget.background": "#0f0f1e",
      "editorSuggestWidget.border": "#6a6ac840"
    }
  });
  monaco.editor.defineTheme("stave-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "strudel.pattern-start", foreground: "4a4ae0", fontStyle: "bold" },
      { token: "strudel.tempo", foreground: "5555b8" },
      { token: "strudel.function", foreground: "1d4ed8" },
      { token: "strudel.note", foreground: "15803d" },
      { token: "strudel.mini.note", foreground: "15803d" },
      { token: "strudel.mini.operator", foreground: "be185d" },
      { token: "strudel.mini.number", foreground: "c2410c" },
      { token: "string", foreground: "92400e" },
      { token: "number", foreground: "c2410c" },
      { token: "comment", foreground: "9ca3af", fontStyle: "italic" }
    ],
    colors: {
      "editor.background": "#f0f0f6",
      "editor.foreground": "#1e1b4b",
      "editorLineNumber.foreground": "#a0a0b4",
      "editorCursor.foreground": "#4a4ae0",
      "editor.selectionBackground": "#5555b830",
      "editor.lineHighlightBackground": "#5555b808"
    }
  });
}
var activeDoc = null;
var activeProvider = null;
var activeProjectId = null;
var docReady = false;
async function initProjectDoc(projectId) {
  if (activeProvider) {
    activeProvider.destroy();
    activeProvider = null;
  }
  if (activeDoc) {
    activeDoc.destroy();
  }
  activeDoc = new Y4__namespace.Doc();
  docReady = false;
  const { IndexeddbPersistence } = await import('y-indexeddb');
  activeProvider = new IndexeddbPersistence(`stave-${projectId}`, activeDoc);
  await activeProvider.whenSynced;
  activeProjectId = projectId;
  docReady = true;
}
function initProjectDocSync() {
  if (activeProvider) {
    activeProvider.destroy();
    activeProvider = null;
  }
  if (activeDoc) {
    activeDoc.destroy();
  }
  activeDoc = new Y4__namespace.Doc();
  docReady = true;
}
function ensureDoc() {
  if (!activeDoc) {
    initProjectDocSync();
  }
  return activeDoc;
}
function getActiveDoc() {
  return ensureDoc();
}
function getFilesMap() {
  return ensureDoc().getMap("files");
}
function isDocReady() {
  return docReady;
}
function getActiveProjectId() {
  return activeProjectId;
}
async function switchProject(projectId) {
  await initProjectDoc(projectId);
}
function subscribeToDocUpdate(cb, options) {
  const doc = ensureDoc();
  const localOnly = options?.localOnly ?? false;
  const handler = (_update, _origin, _doc, tr) => {
    if (localOnly && !tr.local) return;
    cb();
  };
  doc.on("update", handler);
  return () => {
    doc.off("update", handler);
  };
}
var STRUCT_ORIGIN = /* @__PURE__ */ Symbol.for("stave:struct");
function withStructBatch(fn) {
  const doc = getActiveDoc();
  let out2;
  doc.transact(() => {
    out2 = fn();
  }, STRUCT_ORIGIN);
  return out2;
}
var active = null;
function ensureUndoManager() {
  if (active) return active.um;
  const doc = getActiveDoc();
  const files = doc.getMap("files");
  const fileOrder = doc.getMap("fileOrder");
  const subfolderOrder = doc.getMap("subfolderOrder");
  const um = new Y4__namespace.UndoManager([files, fileOrder, subfolderOrder], {
    trackedOrigins: /* @__PURE__ */ new Set([STRUCT_ORIGIN]),
    captureTimeout: 300
  });
  for (const inner of files.values()) {
    if (inner instanceof Y4__namespace.Map) um.addToScope(inner);
  }
  const filesObserver = (event) => {
    for (const [key, change] of event.changes.keys) {
      if (change.action === "add" || change.action === "update") {
        const val = files.get(key);
        if (val instanceof Y4__namespace.Map) um.addToScope(val);
      }
    }
  };
  files.observe(filesObserver);
  const listeners2 = /* @__PURE__ */ new Set();
  const notify2 = () => {
    for (const l of listeners2) l();
  };
  const onStackItemAdded = () => notify2();
  const onStackItemPopped = () => notify2();
  const onStackCleared = () => notify2();
  um.on("stack-item-added", onStackItemAdded);
  um.on("stack-item-popped", onStackItemPopped);
  um.on("stack-cleared", onStackCleared);
  active = {
    um,
    listeners: listeners2,
    cleanup: () => {
      um.off("stack-item-added", onStackItemAdded);
      um.off("stack-item-popped", onStackItemPopped);
      um.off("stack-cleared", onStackCleared);
      files.unobserve(filesObserver);
      um.destroy();
    }
  };
  return um;
}
function resetUndoManager() {
  if (active) {
    active.cleanup();
    active = null;
  }
}
function undo() {
  const um = ensureUndoManager();
  const result = um.undo();
  return result !== null;
}
function redo() {
  const um = ensureUndoManager();
  const result = um.redo();
  return result !== null;
}
function canUndo() {
  const um = ensureUndoManager();
  return um.undoStack.length > 0;
}
function canRedo() {
  const um = ensureUndoManager();
  return um.redoStack.length > 0;
}
function subscribeToUndoState(cb) {
  ensureUndoManager();
  const listeners2 = active.listeners;
  listeners2.add(cb);
  return () => {
    listeners2.delete(cb);
  };
}

// src/workspace/WorkspaceFile.ts
var cachedSnapshots = /* @__PURE__ */ new Map();
var subscribersByFile = /* @__PURE__ */ new Map();
var textObservers = /* @__PURE__ */ new Map();
function rebuildSnapshot(id) {
  const filesMap = getFilesMap();
  const fileMap = filesMap.get(id);
  if (!fileMap) {
    cachedSnapshots.delete(id);
    return;
  }
  const ytext = fileMap.get("content");
  cachedSnapshots.set(id, {
    id: fileMap.get("id"),
    path: fileMap.get("path"),
    content: ytext.toString(),
    language: fileMap.get("language"),
    meta: fileMap.get("meta")
  });
}
function wireTextObserver(id, ytext) {
  unwireTextObserver(id);
  const handler = () => {
    rebuildSnapshot(id);
    notify(id);
  };
  ytext.observe(handler);
  textObservers.set(id, { ytext, handler });
}
function unwireTextObserver(id) {
  const entry = textObservers.get(id);
  if (entry) {
    entry.ytext.unobserve(entry.handler);
    textObservers.delete(id);
  }
}
var folderOrderObserverWired = false;
var folderOrderSubscribers = /* @__PURE__ */ new Set();
function notifyFolderOrder() {
  const snapshot = Array.from(folderOrderSubscribers);
  for (const cb of snapshot) cb();
}
function getFolderOrderMap() {
  return ensureDoc().getMap("fileOrder");
}
function getSubfolderOrderMap() {
  return ensureDoc().getMap("subfolderOrder");
}
function getChildOrderMap() {
  return ensureDoc().getMap("childOrder");
}
function ensureFolderOrderObserver() {
  if (folderOrderObserverWired) return;
  const map = getFolderOrderMap();
  const submap = getSubfolderOrderMap();
  const childmap = getChildOrderMap();
  map.observeDeep(() => notifyFolderOrder());
  submap.observeDeep(() => notifyFolderOrder());
  childmap.observeDeep(() => notifyFolderOrder());
  folderOrderObserverWired = true;
}
var wiredFilesMap = null;
function ensureFilesMapObserver() {
  const filesMap = getFilesMap();
  if (wiredFilesMap === filesMap) return;
  filesMap.observeDeep((events) => {
    let anyStructuralChange = false;
    for (const event of events) {
      if (event.target === filesMap) {
        const mapEvent = event;
        for (const [key, change] of mapEvent.changes.keys) {
          if (change.action === "add" || change.action === "update") {
            const fileMap = filesMap.get(key);
            const ytext = fileMap.get("content");
            rebuildSnapshot(key);
            wireTextObserver(key, ytext);
            notify(key);
            anyStructuralChange = true;
          } else if (change.action === "delete") {
            unwireTextObserver(key);
            cachedSnapshots.delete(key);
            notify(key);
            anyStructuralChange = true;
          }
        }
        continue;
      }
      if (event.target instanceof Y4__namespace.Text) continue;
      const path = event.path;
      const ownerId = path.length > 0 ? String(path[0]) : null;
      if (!ownerId) continue;
      if (filesMap.has(ownerId)) {
        rebuildSnapshot(ownerId);
        notify(ownerId);
        anyStructuralChange = true;
      }
    }
    if (anyStructuralChange) notifyFileList();
  });
  wiredFilesMap = filesMap;
}
function createWorkspaceFile(id, path, content, language, meta) {
  ensureDoc();
  ensureFilesMapObserver();
  const filesMap = getFilesMap();
  const doc = ensureDoc();
  doc.transact(() => {
    const fileMap = new Y4__namespace.Map();
    fileMap.set("id", id);
    fileMap.set("path", path);
    fileMap.set("language", language);
    if (meta !== void 0) fileMap.set("meta", meta);
    const ytext = new Y4__namespace.Text();
    ytext.insert(0, content);
    fileMap.set("content", ytext);
    filesMap.set(id, fileMap);
  }, STRUCT_ORIGIN);
  return cachedSnapshots.get(id) ?? { id, path, content, language, meta };
}
function seedWorkspaceFile(id, path, content, language, meta) {
  ensureDoc();
  ensureFilesMapObserver();
  const filesMap = getFilesMap();
  const existing = filesMap.get(id);
  if (existing) {
    if (!cachedSnapshots.has(id)) {
      rebuildSnapshot(id);
    }
    const ytext = existing.get("content");
    if (!textObservers.has(id)) {
      wireTextObserver(id, ytext);
    }
    return cachedSnapshots.get(id);
  }
  return createWorkspaceFile(id, path, content, language, meta);
}
function getFile(id) {
  return cachedSnapshots.get(id);
}
function setContent(id, newContent) {
  const filesMap = getFilesMap();
  const fileMap = filesMap.get(id);
  if (!fileMap) return;
  const ytext = fileMap.get("content");
  const currentContent = ytext.toString();
  if (currentContent === newContent) return;
  const doc = ensureDoc();
  doc.transact(() => {
    ytext.delete(0, ytext.length);
    ytext.insert(0, newContent);
  });
}
function subscribe(id, cb) {
  let set = subscribersByFile.get(id);
  if (!set) {
    set = /* @__PURE__ */ new Set();
    subscribersByFile.set(id, set);
  }
  set.add(cb);
  return () => {
    const current = subscribersByFile.get(id);
    if (!current) return;
    current.delete(cb);
    if (current.size === 0) {
      subscribersByFile.delete(id);
    }
  };
}
var fileListSubscribers = /* @__PURE__ */ new Set();
function notifyFileList() {
  const snapshot = Array.from(fileListSubscribers);
  for (const cb of snapshot) cb();
}
function subscribeToFileList(cb) {
  fileListSubscribers.add(cb);
  return () => {
    fileListSubscribers.delete(cb);
  };
}
function listWorkspaceFiles() {
  ensureDoc();
  ensureFilesMapObserver();
  const filesMap = getFilesMap();
  for (const id of filesMap.keys()) {
    if (!cachedSnapshots.has(id)) {
      rebuildSnapshot(id);
      const fileMap = filesMap.get(id);
      const ytext = fileMap.get("content");
      if (!textObservers.has(id)) {
        wireTextObserver(id, ytext);
      }
    }
  }
  return Array.from(cachedSnapshots.values());
}
function deleteWorkspaceFile(id) {
  const filesMap = getFilesMap();
  if (!filesMap.has(id)) return;
  const doc = ensureDoc();
  doc.transact(() => {
    filesMap.delete(id);
  }, STRUCT_ORIGIN);
  notifyFileList();
}
function renameWorkspaceFile(id, newPath) {
  const filesMap = getFilesMap();
  const fileMap = filesMap.get(id);
  if (!fileMap) return;
  const currentPath = fileMap.get("path");
  if (currentPath === newPath) return;
  const doc = ensureDoc();
  doc.transact(() => {
    fileMap.set("path", newPath);
  }, STRUCT_ORIGIN);
  rebuildSnapshot(id);
  notify(id);
  notifyFileList();
}
function getFolderOrder(folderPath) {
  ensureDoc();
  ensureFolderOrderObserver();
  const map = getFolderOrderMap();
  const arr = map.get(folderPath);
  return arr ? arr.toArray() : [];
}
function setFolderOrder(folderPath, orderedIds) {
  ensureDoc();
  ensureFolderOrderObserver();
  const map = getFolderOrderMap();
  const doc = ensureDoc();
  doc.transact(() => {
    const next = new Y4__namespace.Array();
    next.push(orderedIds);
    map.set(folderPath, next);
  }, STRUCT_ORIGIN);
}
function subscribeToFolderOrder(cb) {
  ensureFolderOrderObserver();
  folderOrderSubscribers.add(cb);
  return () => {
    folderOrderSubscribers.delete(cb);
  };
}
function getSubfolderOrder(parentPath) {
  ensureDoc();
  ensureFolderOrderObserver();
  const map = getSubfolderOrderMap();
  const arr = map.get(parentPath);
  return arr ? arr.toArray() : [];
}
function setSubfolderOrder(parentPath, orderedNames) {
  ensureDoc();
  ensureFolderOrderObserver();
  const map = getSubfolderOrderMap();
  const doc = ensureDoc();
  doc.transact(() => {
    const next = new Y4__namespace.Array();
    next.push(orderedNames);
    map.set(parentPath, next);
  }, STRUCT_ORIGIN);
}
function getChildOrder(parentPath) {
  ensureDoc();
  ensureFolderOrderObserver();
  const map = getChildOrderMap();
  const arr = map.get(parentPath);
  return arr ? arr.toArray() : [];
}
function setChildOrder(parentPath, entries) {
  ensureDoc();
  ensureFolderOrderObserver();
  const map = getChildOrderMap();
  const doc = ensureDoc();
  doc.transact(() => {
    const next = new Y4__namespace.Array();
    next.push(entries);
    map.set(parentPath, next);
  }, STRUCT_ORIGIN);
}
function notify(id) {
  const set = subscribersByFile.get(id);
  if (!set) return;
  const snapshot = Array.from(set);
  for (const cb of snapshot) cb();
}
function resetFileStore() {
  for (const [id] of textObservers) {
    unwireTextObserver(id);
  }
  textObservers.clear();
  cachedSnapshots.clear();
  subscribersByFile.clear();
  wiredFilesMap = null;
  folderOrderObserverWired = false;
  resetUndoManager();
  notifyFileList();
  notifyFolderOrder();
}

// src/workspace/useWorkspaceFile.ts
function useWorkspaceFile(id) {
  const subscribe3 = React.useCallback(
    (onStoreChange) => subscribe(id, onStoreChange),
    [id]
  );
  const getSnapshot = React.useCallback(() => getFile(id), [id]);
  const file = React.useSyncExternalStore(subscribe3, getSnapshot, getSnapshot);
  const setContent2 = React.useCallback(
    (content) => setContent(id, content),
    [id]
  );
  return { file, setContent: setContent2 };
}

// src/monaco/language.ts
function registerSonicPiLanguage(monaco) {
  const langs = monaco.languages.getLanguages();
  if (langs.some((l) => l.id === "sonicpi")) return;
  monaco.languages.register({ id: "sonicpi" });
  monaco.languages.setMonarchTokensProvider("sonicpi", {
    defaultToken: "",
    tokenPostfix: ".sonicpi",
    keywords: [
      "do",
      "end",
      "if",
      "else",
      "elsif",
      "unless",
      "loop",
      "while",
      "until",
      "for",
      "in",
      "begin",
      "rescue",
      "ensure",
      "true",
      "false",
      "nil",
      "and",
      "or",
      "not"
    ],
    sonicPiFunctions: [
      "live_loop",
      "play",
      "sample",
      "sleep",
      "sync",
      "cue",
      "in_thread",
      "use_synth",
      "use_bpm",
      "use_random_seed",
      "with_fx",
      "control",
      "define",
      "density",
      "puts",
      "print"
    ],
    musicFunctions: [
      "choose",
      "rrand",
      "rrand_i",
      "rand",
      "rand_i",
      "dice",
      "one_in",
      "ring",
      "knit",
      "range",
      "line",
      "spread",
      "chord",
      "scale",
      "note",
      "hz_to_midi",
      "midi_to_hz",
      "tick",
      "look"
    ],
    tokenizer: {
      root: [
        // Ruby comment
        [/#.*$/, "comment"],
        // Ruby symbols :name
        [/:\w+/, "sonicpi.symbol"],
        // Sonic Pi DSL functions
        [
          /\b(live_loop|play|sample|sleep|sync|cue|in_thread|use_synth|use_bpm|use_random_seed|with_fx|control|define|density)\b/,
          "sonicpi.function"
        ],
        // Music/math helper functions
        [
          /\b(choose|rrand|rrand_i|rand|rand_i|dice|one_in|ring|knit|range|line|spread|chord|scale|note|hz_to_midi|midi_to_hz|tick|look)\b/,
          "sonicpi.music"
        ],
        // Keywords
        [/\b(do|end|if|else|elsif|unless|loop|while|until|for|in|true|false|nil)\b/, "keyword"],
        // Note names: c3, eb4, f#2
        [/\b[a-gA-G][bs#]?\d\b/, "sonicpi.note"],
        // Numbers
        [/\b\d+(\.\d+)?\b/, "number"],
        // Strings
        [/"/, "string", "@string_double"],
        [/'/, "string", "@string_single"],
        // Keyword args (release:, amp:, rate:)
        [/\b(\w+):/, "sonicpi.kwarg"]
      ],
      string_double: [
        [/#\{/, "string.interpolation", "@interpolation"],
        [/"/, "string", "@pop"],
        [/[^"#]+/, "string"],
        [/./, "string"]
      ],
      string_single: [
        [/'/, "string", "@pop"],
        [/[^']+/, "string"]
      ],
      interpolation: [
        [/\}/, "string.interpolation", "@pop"],
        { include: "root" }
      ]
    }
  });
  monaco.languages.setLanguageConfiguration("sonicpi", {
    comments: {
      lineComment: "#"
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"]
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" }
    ]
  });
}
function registerStrudelLanguage(monaco) {
  const langs = monaco.languages.getLanguages();
  if (langs.some((l) => l.id === "strudel")) return;
  monaco.languages.register({ id: "strudel" });
  monaco.languages.setMonarchTokensProvider("strudel", {
    defaultToken: "",
    tokenPostfix: ".strudel",
    keywords: [
      "const",
      "let",
      "var",
      "await",
      "async",
      "return",
      "if",
      "else",
      "for",
      "while",
      "function",
      "class",
      "import",
      "export",
      "from"
    ],
    strudelFunctions: [
      "note",
      "s",
      "gain",
      "release",
      "sustain",
      "cutoff",
      "resonance",
      "stack",
      "mask",
      "speed",
      "room",
      "delay",
      "distort",
      "fm",
      "swing",
      "struct",
      "every",
      "sometimes",
      "jux",
      "off",
      "fast",
      "slow",
      "rev",
      "palindrome",
      "chunk",
      "iter",
      "euclid",
      "euclidRot",
      "degradeBy",
      "layer",
      "cat",
      "seq",
      "silence",
      "pure",
      "reify",
      "sub",
      "add",
      "mul",
      "div",
      "mod",
      "abs",
      "range",
      "rangex",
      "rand",
      "irand",
      "perlin",
      "sine",
      "saw",
      "square",
      "tri",
      "setcps",
      "setCps",
      "cpm",
      "hpf",
      "lpf",
      "bpf",
      "crush",
      "shape",
      "coarse",
      "begin",
      "end",
      "loop",
      "loopBegin",
      "loopEnd",
      "pan",
      "orbit",
      "color",
      "velocity",
      "amp",
      "legato",
      "accel",
      "unit",
      "cut",
      "n",
      "bank",
      "stretch",
      "nudge",
      "degrade",
      "ftype",
      "fanchor",
      "vowel"
    ],
    tokenizer: {
      root: [
        // $: pattern-start marker
        [/\$\s*:/, "strudel.pattern-start"],
        // setcps / setCps tempo
        [/\bsetcps\b|\bsetCps\b/, "strudel.tempo"],
        // Note names: c3, eb4, f#2, C#5
        [/\b[a-gA-G][b#]?\d\b/, "strudel.note"],
        // Strudel function names (must come before keywords check)
        [
          /\b(note|s|gain|release|sustain|cutoff|resonance|stack|mask|speed|room|delay|distort|fm|swing|struct|every|sometimes|jux|off|fast|slow|rev|palindrome|chunk|iter|euclid|euclidRot|degradeBy|layer|cat|seq|silence|pure|reify|range|rangex|rand|irand|perlin|cpm|hpf|lpf|bpf|crush|shape|coarse|begin|end|loop|pan|orbit|color|velocity|amp|legato|accel|unit|cut|bank|stretch|nudge|degrade|vowel)\b/,
          "strudel.function"
        ],
        // JS keywords
        [
          /\b(const|let|var|await|async|return|if|else|for|while|function|class|import|export|from)\b/,
          "keyword"
        ],
        // Line comment
        [/\/\/.*$/, "comment"],
        // Block comment
        [/\/\*/, "comment", "@block_comment"],
        // Strings (mini-notation)
        [/"/, "string", "@mini_string_double"],
        [/'/, "string", "@mini_string_single"],
        [/`/, "string", "@template_string"],
        // Numbers
        [/\b\d+(\.\d+)?\b/, "number"]
      ],
      block_comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"]
      ],
      mini_string_double: [
        [/[~*!%?@<>\[\]{}|,_]/, "strudel.mini.operator"],
        [/[a-gA-G][b#]?\d?/, "strudel.mini.note"],
        [/\d+(\.\d+)?/, "strudel.mini.number"],
        [/"/, "string", "@pop"],
        [/[^"]+/, "string"]
      ],
      mini_string_single: [
        [/[~*!%?@<>\[\]{}|,_]/, "strudel.mini.operator"],
        [/[a-gA-G][b#]?\d?/, "strudel.mini.note"],
        [/\d+(\.\d+)?/, "strudel.mini.number"],
        [/'/, "string", "@pop"],
        [/[^']+/, "string"]
      ],
      template_string: [
        [/`/, "string", "@pop"],
        [/[^`]+/, "string"]
      ]
    }
  });
  monaco.languages.setLanguageConfiguration("strudel", {
    comments: {
      lineComment: "//",
      blockComment: ["/*", "*/"]
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"]
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: "`", close: "`" }
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" }
    ]
  });
}

// src/monaco/strudelDocs.ts
var STRUDEL_DOCS = {
  note: {
    signature: "note(pattern: string)",
    description: "Play notes from a mini-notation pattern. Accepts note names (c4, eb3) or MIDI numbers.",
    example: 'note("c4 e4 g4 b4")'
  },
  s: {
    signature: "s(pattern: string)",
    description: "Select a sound or synth. Accepts sample names or synth identifiers.",
    example: 's("bd sd hh sd")'
  },
  stack: {
    signature: "stack(...patterns)",
    description: "Play multiple patterns simultaneously (vertical stack).",
    example: 'stack(note("c3 e3"), s("bd sd"))'
  },
  cat: {
    signature: "cat(...patterns)",
    description: "Concatenate patterns sequentially \u2014 each plays for one cycle then moves to the next.",
    example: 'cat(note("c4 e4"), note("g4 b4"))'
  },
  fast: {
    signature: ".fast(n)",
    description: "Speed up the pattern by factor n.",
    example: 'note("c4 e4").fast(2)'
  },
  slow: {
    signature: ".slow(n)",
    description: "Slow down the pattern by factor n.",
    example: 'note("c4 e4 g4").slow(2)'
  },
  rev: {
    signature: ".rev()",
    description: "Reverse the pattern.",
    example: 'note("c4 d4 e4 f4").rev()'
  },
  every: {
    signature: ".every(n, fn)",
    description: "Apply fn to the pattern every n cycles.",
    example: 'note("c4 e4 g4").every(4, x => x.rev())'
  },
  sometimes: {
    signature: ".sometimes(fn)",
    description: "Apply fn to events 50% of the time at random.",
    example: 'note("c4 e4 g4").sometimes(x => x.fast(2))'
  },
  degradeBy: {
    signature: ".degradeBy(amount)",
    description: "Randomly remove events. amount is 0\u20131 (0 = keep all, 1 = remove all).",
    example: 'note("c4 d4 e4 f4").degradeBy(0.3)'
  },
  gain: {
    signature: ".gain(amount)",
    description: "Set the volume. 1 is unity gain; values above 1 amplify.",
    example: 'note("c4 e4").gain(0.7)'
  },
  pan: {
    signature: ".pan(value)",
    description: "Set stereo panning. -1 is hard left, 0 is center, 1 is hard right.",
    example: 'note("c4 e4 g4").pan(sine)'
  },
  room: {
    signature: ".room(amount)",
    description: "Add reverb. 0 is dry, 1 is fully wet.",
    example: 'note("c4 e4").room(0.4)'
  },
  delay: {
    signature: ".delay(amount)",
    description: "Add delay/echo effect.",
    example: 'note("c4 e4").delay(0.3)'
  },
  jux: {
    signature: ".jux(fn)",
    description: "Apply fn to a copy of the pattern playing in the right channel, original in left.",
    example: 'note("c4 e4 g4").jux(rev)'
  },
  off: {
    signature: ".off(timeOffset, fn)",
    description: "Play an offset copy of the pattern with fn applied, layered over the original.",
    example: 'note("c4 e4 g4").off(0.25, x => x.gain(0.5))'
  },
  layer: {
    signature: ".layer(...fns)",
    description: "Apply multiple functions to copies of the pattern and stack all results.",
    example: 'note("c4 e4 g4").layer(x => x.fast(2), rev)'
  },
  struct: {
    signature: ".struct(pattern)",
    description: "Impose a rhythmic structure on the pattern from a boolean/euclid pattern.",
    example: 'note("c4").struct("t f t t f t t f")'
  },
  mask: {
    signature: ".mask(pattern)",
    description: "Filter events by a boolean pattern \u2014 only play where the mask is true.",
    example: 'note("c4 d4 e4 f4").mask("t t f t")'
  },
  euclid: {
    signature: ".euclid(steps, total)",
    description: "Euclidean rhythm: distribute steps evenly across total slots.",
    example: 's("bd").euclid(3, 8)'
  },
  iter: {
    signature: ".iter(n)",
    description: "Iterate through n rotations of the pattern over n cycles.",
    example: 'note("c4 d4 e4 f4").iter(4)'
  },
  chunk: {
    signature: ".chunk(n, fn)",
    description: "Divide pattern into n chunks, applying fn to one chunk per cycle in rotation.",
    example: 'note("c4 d4 e4 f4").chunk(4, x => x.fast(2))'
  },
  cutoff: {
    signature: ".cutoff(freq)",
    description: "Low-pass filter cutoff frequency in Hz.",
    example: 'note("c4 e4").s("sawtooth").cutoff(800)'
  },
  resonance: {
    signature: ".resonance(amount)",
    description: "Filter resonance (Q). Higher values create a more pronounced peak.",
    example: 'note("c4 e4").s("sawtooth").cutoff(sine.range(200,2000)).resonance(8)'
  },
  hpf: {
    signature: ".hpf(freq)",
    description: "High-pass filter \u2014 removes frequencies below the cutoff.",
    example: 's("amen").hpf(400)'
  },
  lpf: {
    signature: ".lpf(freq)",
    description: "Low-pass filter \u2014 alias for cutoff.",
    example: 'note("c4 e4").lpf(1200)'
  },
  release: {
    signature: ".release(seconds)",
    description: "Envelope release time in seconds.",
    example: 'note("c4 e4 g4").release(0.5)'
  },
  sustain: {
    signature: ".sustain(seconds)",
    description: "Envelope sustain duration in seconds.",
    example: 'note("c4").sustain(0.1).release(0.3)'
  },
  speed: {
    signature: ".speed(rate)",
    description: "Sample playback rate. 1 is normal, 2 is double speed (up one octave), -1 is reversed.",
    example: 's("amen").speed(0.5)'
  },
  vowel: {
    signature: ".vowel(v)",
    description: 'Vowel formant filter. Accepts "a", "e", "i", "o", "u".',
    example: 'note("c4 d4 e4").vowel("<a e i o>")'
  },
  orbit: {
    signature: ".orbit(n)",
    description: "Route to audio effect bus n. Patterns on the same orbit share effects.",
    example: 'note("c4 e4").room(0.5).orbit(1)'
  }
};
function registerStrudelHover(monaco) {
  return monaco.languages.registerHoverProvider("strudel", {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const doc = STRUDEL_DOCS[word.word];
      if (!doc) return null;
      const contents = [
        { value: `\`\`\`typescript
${doc.signature}
\`\`\`` },
        { value: doc.description },
        { value: `**Example:** \`${doc.example}\`` }
      ];
      return {
        range: new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        ),
        contents
      };
    }
  });
}

// src/monaco/strudelCompletions.ts
var NOTE_ROOTS = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];
var SHARP_ROOTS = ["c#", "d#", "f#", "g#", "a#"];
function generateNoteNames() {
  const names = [];
  for (let oct = 0; oct <= 7; oct++) {
    for (const root of NOTE_ROOTS) names.push(`${root}${oct}`);
    for (const root of SHARP_ROOTS) names.push(`${root}${oct}`);
  }
  return names;
}
var NOTE_NAMES = generateNoteNames();
function registerStrudelDotCompletions(monaco) {
  return monaco.languages.registerCompletionItemProvider("strudel", {
    triggerCharacters: ["."],
    provideCompletionItems(model, position) {
      const textBefore = model.getLineContent(position.lineNumber).substring(0, position.column - 1);
      if (!/[)\]"'`\w]\.$/.test(textBefore)) {
        return { suggestions: [] };
      }
      const word = model.getWordUntilPosition(position);
      const range2 = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };
      return {
        suggestions: Object.entries(STRUDEL_DOCS).map(([name2, doc]) => ({
          label: name2,
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: name2,
          detail: doc.signature,
          documentation: { value: `${doc.description}

**Example:** \`${doc.example}\`` },
          range: range2
        }))
      };
    }
  });
}
function registerStrudelNoteCompletions(monaco) {
  return monaco.languages.registerCompletionItemProvider("strudel", {
    triggerCharacters: ['"', "'", " "],
    provideCompletionItems(model, position) {
      const lineContent = model.getLineContent(position.lineNumber);
      const textBefore = lineContent.substring(0, position.column - 1);
      if (!/(?:^|[\s,(.])note\(["']([^"']*)$/.test(textBefore)) {
        return { suggestions: [] };
      }
      const word = model.getWordUntilPosition(position);
      const range2 = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };
      return {
        suggestions: NOTE_NAMES.map((name2) => ({
          label: name2,
          kind: monaco.languages.CompletionItemKind.Value,
          insertText: name2,
          range: range2
        }))
      };
    }
  });
}

// src/workspace/languages.ts
var hydraRegistered = false;
var p5jsRegistered = false;
function registerHydraLanguage(monaco) {
  if (hydraRegistered) return;
  const langs = monaco.languages.getLanguages();
  if (langs.some((l) => l.id === "hydra")) {
    hydraRegistered = true;
    return;
  }
  hydraRegistered = true;
  monaco.languages.register({ id: "hydra" });
  monaco.languages.setMonarchTokensProvider("hydra", {
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [
          /\b(osc|noise|shape|gradient|solid|voronoi|src|s0|s1|s2|s3|o0|o1|o2|o3)\b/,
          "keyword"
        ],
        [
          /\.(color|rotate|scale|modulate|blend|add|diff|layer|mask|luma|thresh|posterize|shift|kaleid|scroll|scrollX|scrollY|pixelate|repeat|repeatX|repeatY|out|brightness|contrast|saturate|hue|invert)\b/,
          "type"
        ],
        [
          /\b(Math|PI|sin|cos|tan|abs|floor|ceil|round|max|min|random|pow|sqrt)\b/,
          "variable"
        ],
        [/\ba\b/, "variable.predefined"],
        [/\b\d+\.?\d*\b/, "number"],
        [/"[^"]*"/, "string"],
        [/'[^']*'/, "string"],
        [/=>/, "keyword.operator"]
      ],
      comment: [
        [/\*\//, "comment", "@pop"],
        [/./, "comment"]
      ]
    }
  });
}
function registerP5JsLanguage(monaco) {
  if (p5jsRegistered) return;
  const langs = monaco.languages.getLanguages();
  if (langs.some((l) => l.id === "p5js")) {
    p5jsRegistered = true;
    return;
  }
  p5jsRegistered = true;
  monaco.languages.register({ id: "p5js" });
  monaco.languages.setMonarchTokensProvider("p5js", {
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [
          /\b(background|fill|stroke|noFill|noStroke|rect|ellipse|line|point|arc|triangle|quad|beginShape|endShape|vertex|text|textSize|textAlign|image|loadImage|createCanvas|resizeCanvas|push|pop|translate|rotate|scale)\b/,
          "keyword"
        ],
        [
          /\b(width|height|mouseX|mouseY|frameCount|millis|hapStream|analyser|scheduler)\b/,
          "variable.predefined"
        ],
        [
          /\b(let|const|var|function|for|while|if|else|return|class|new|typeof|of|in)\b/,
          "keyword"
        ],
        [/\b\d+\.?\d*\b/, "number"],
        [/"[^"]*"/, "string"],
        [/'[^']*'/, "string"],
        [/`[^`]*`/, "string"]
      ],
      comment: [
        [/\*\//, "comment", "@pop"],
        [/./, "comment"]
      ]
    }
  });
}
function ensureWorkspaceLanguages(monaco) {
  registerStrudelLanguage(monaco);
  registerSonicPiLanguage(monaco);
  registerHydraLanguage(monaco);
  registerP5JsLanguage(monaco);
  ensureStrudelProviders(monaco);
}
var strudelProvidersRegistered = false;
function ensureStrudelProviders(monaco) {
  if (strudelProvidersRegistered) return;
  if (typeof monaco.languages?.registerCompletionItemProvider !== "function" || typeof monaco.languages?.registerHoverProvider !== "function") {
    return;
  }
  strudelProvidersRegistered = true;
  registerStrudelDotCompletions(monaco);
  registerStrudelNoteCompletions(monaco);
  registerStrudelHover(monaco);
}
function toMonacoLanguage(lang) {
  switch (lang) {
    case "strudel":
      return "strudel";
    case "sonicpi":
      return "sonicpi";
    case "hydra":
      return "hydra";
    case "p5js":
      return "p5js";
    case "markdown":
      return "markdown";
  }
}

// src/workspace/WorkspaceAudioBus.ts
var payloads = /* @__PURE__ */ new Map();
var recency = [];
var pinnedSubscribers = /* @__PURE__ */ new Map();
var defaultSubscribers = /* @__PURE__ */ new Set();
var sourcesChangedListeners = /* @__PURE__ */ new Set();
function defaultPayload() {
  if (recency.length === 0) return null;
  const id = recency[recency.length - 1];
  return payloads.get(id) ?? null;
}
function payloadForRef(ref) {
  switch (ref.kind) {
    case "none":
      return null;
    case "default":
      return defaultPayload();
    case "file":
      return payloads.get(ref.fileId) ?? null;
  }
}
function payloadsEquivalent(prev, next) {
  if (!prev) return false;
  return prev.hapStream === next.hapStream && prev.analyser === next.analyser && prev.scheduler === next.scheduler && prev.inlineViz === next.inlineViz && prev.audio === next.audio;
}
function notifySourcesChanged() {
  if (sourcesChangedListeners.size === 0) return;
  const snapshot = Array.from(sourcesChangedListeners);
  for (const cb of snapshot) cb();
}
function notifyPinned(sourceId, payload) {
  const set = pinnedSubscribers.get(sourceId);
  if (!set || set.size === 0) return;
  const snapshot = Array.from(set);
  for (const cb of snapshot) cb(payload);
}
function notifyDefault() {
  if (defaultSubscribers.size === 0) return;
  const payload = defaultPayload();
  const snapshot = Array.from(defaultSubscribers);
  for (const cb of snapshot) cb(payload);
}
function publish(sourceId, payload) {
  const prev = payloads.get(sourceId);
  if (payloadsEquivalent(prev, payload)) return;
  payloads.set(sourceId, payload);
  const isNewSource = prev === void 0;
  if (isNewSource) {
    recency.push(sourceId);
  }
  notifyPinned(sourceId, payload);
  if (isNewSource || sourceId === recency[recency.length - 1]) {
    notifyDefault();
  }
  if (isNewSource) {
    notifySourcesChanged();
  }
}
function unpublish(sourceId) {
  const prev = payloads.get(sourceId);
  if (!prev) return;
  const wasMostRecent = recency[recency.length - 1] === sourceId;
  payloads.delete(sourceId);
  const idx = recency.indexOf(sourceId);
  if (idx !== -1) recency.splice(idx, 1);
  notifyPinned(sourceId, null);
  if (wasMostRecent) {
    notifyDefault();
  }
  notifySourcesChanged();
}
function subscribe2(ref, cb) {
  cb(payloadForRef(ref));
  if (ref.kind === "none") {
    return () => {
    };
  }
  if (ref.kind === "default") {
    defaultSubscribers.add(cb);
    let unsubscribed2 = false;
    return () => {
      if (unsubscribed2) return;
      unsubscribed2 = true;
      defaultSubscribers.delete(cb);
    };
  }
  const fileId = ref.fileId;
  let set = pinnedSubscribers.get(fileId);
  if (!set) {
    set = /* @__PURE__ */ new Set();
    pinnedSubscribers.set(fileId, set);
  }
  set.add(cb);
  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    const current = pinnedSubscribers.get(fileId);
    if (!current) return;
    current.delete(cb);
    if (current.size === 0) {
      pinnedSubscribers.delete(fileId);
    }
  };
}
function consume(ref) {
  return payloadForRef(ref);
}
function listSources() {
  const result = [];
  for (const sourceId of recency) {
    if (!payloads.has(sourceId)) continue;
    result.push({
      sourceId,
      label: sourceId,
      // Phase 10.2 only lists active publishers, so `playing` is always
      // true. The field exists in the surface for forward-compat with
      // Phase 10.3+ "stopped but recently active" entries.
      playing: true
    });
  }
  return result;
}
function onSourcesChanged(cb) {
  sourcesChangedListeners.add(cb);
  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    sourcesChangedListeners.delete(cb);
  };
}
var workspaceAudioBus = {
  publish,
  unpublish,
  subscribe: subscribe2,
  consume,
  listSources,
  onSourcesChanged
};
var baseStyleInjected = false;
function ensureBaseHighlightStyle() {
  if (baseStyleInjected || typeof document === "undefined") return;
  baseStyleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .strudel-active-hap {
      background: rgba(var(--accent-rgb, 139, 92, 246), 0.3);
      border-radius: 2px;
      outline: 1px solid rgba(var(--accent-rgb, 139, 92, 246), 0.5);
      box-shadow: 0 0 8px rgba(var(--accent-rgb, 139, 92, 246), 0.3);
    }
  `;
  document.head.appendChild(style);
}
var injectedColorClasses = /* @__PURE__ */ new Map();
function hashColor(color) {
  let hash = 0;
  for (let i2 = 0; i2 < color.length; i2++) {
    hash = hash * 31 + color.charCodeAt(i2) | 0;
  }
  return Math.abs(hash).toString(16);
}
function parseColorToRGB(color) {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    return { r: data[0], g: data[1], b: data[2] };
  } catch {
    return null;
  }
}
function getDecorationClassName(color) {
  const base = "strudel-active-hap";
  if (!color) return base;
  const hash = hashColor(color);
  const colorClass = `strudel-active-hap--c${hash}`;
  if (!injectedColorClasses.has(colorClass) && typeof document !== "undefined") {
    injectedColorClasses.set(colorClass, true);
    const rgb = parseColorToRGB(color);
    if (rgb) {
      const style = document.createElement("style");
      style.textContent = `
        .${colorClass} {
          background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3) !important;
          outline: 1px solid rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5) !important;
          box-shadow: 0 0 8px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3) !important;
        }
      `;
      document.head.appendChild(style);
    }
  }
  return `${base} ${colorClass}`;
}
function locToRange(model, start2, end) {
  const startPos = model.getPositionAt(start2);
  const endPos = model.getPositionAt(end);
  return {
    startLineNumber: startPos.lineNumber,
    startColumn: startPos.column,
    endLineNumber: endPos.lineNumber,
    endColumn: endPos.column
  };
}
function teardown(timeoutIds, collections) {
  for (const id of timeoutIds) {
    clearTimeout(id);
  }
  timeoutIds.length = 0;
  for (const col of collections.values()) {
    col.clear();
  }
  collections.clear();
}
function useHighlighting(editor, hapStream) {
  const timeoutIdsRef = React.useRef([]);
  const hapCollectionsRef = React.useRef(/* @__PURE__ */ new Map());
  const hapCounterRef = React.useRef(0);
  const clearAll = React.useCallback(() => {
    teardown(timeoutIdsRef.current, hapCollectionsRef.current);
  }, []);
  React.useEffect(() => {
    if (!editor || !hapStream) return;
    ensureBaseHighlightStyle();
    const handler = (event) => {
      if (!event.loc || event.loc.length === 0) return;
      const model = editor.getModel();
      if (!model) return;
      const hapKey = `hap-${hapCounterRef.current++}`;
      const showDelay = Math.max(0, event.scheduledAheadMs);
      const clearDelay = showDelay + event.audioDuration * 1e3;
      const className = getDecorationClassName(event.color);
      const showId = window.setTimeout(() => {
        const decorations = event.loc.map(({ start: start2, end }) => ({
          range: locToRange(model, start2, end),
          options: {
            className,
            stickiness: 1
            // NeverGrowsWhenTypingAtEdges
          }
        }));
        const collection = editor.createDecorationsCollection(decorations);
        hapCollectionsRef.current.set(hapKey, collection);
      }, showDelay);
      const clearId = window.setTimeout(() => {
        hapCollectionsRef.current.get(hapKey)?.clear();
        hapCollectionsRef.current.delete(hapKey);
      }, clearDelay);
      timeoutIdsRef.current.push(showId, clearId);
    };
    hapStream.on(handler);
    return () => {
      hapStream.off(handler);
      teardown(timeoutIdsRef.current, hapCollectionsRef.current);
    };
  }, [editor, hapStream]);
  return { clearAll };
}

// src/workspace/editorRegistry.ts
var editors = /* @__PURE__ */ new Map();
var monacoNs = null;
function registerMonacoNamespace(monaco) {
  if (!monacoNs) monacoNs = monaco;
}
function registerEditor(fileId, editor) {
  editors.set(fileId, editor);
}
function unregisterEditor(fileId, editor) {
  if (editors.get(fileId) === editor) editors.delete(fileId);
}
function revealLineInFile(fileId, line2) {
  const editor = editors.get(fileId);
  if (!editor) return false;
  try {
    editor.revealLineInCenter?.(line2);
    editor.setPosition?.({ lineNumber: line2, column: 1 });
    editor.focus?.();
    return true;
  } catch {
    return false;
  }
}
var DEFAULT_FONT_SIZE = 14;
var FONT_SIZE_STORAGE = "stave:editorFontSize";
var MINIMAP_STORAGE = "stave:editorMinimap";
function safeLocalStorage() {
  try {
    if (typeof window === "undefined") return null;
    if (typeof window.localStorage?.getItem !== "function") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}
function readFontSize() {
  const ls = safeLocalStorage();
  if (!ls) return DEFAULT_FONT_SIZE;
  const saved = Number(ls.getItem(FONT_SIZE_STORAGE));
  return Number.isFinite(saved) && saved >= 8 && saved <= 40 ? saved : DEFAULT_FONT_SIZE;
}
function readMinimap() {
  const ls = safeLocalStorage();
  return ls?.getItem(MINIMAP_STORAGE) === "1";
}
function writeFontSize(size) {
  safeLocalStorage()?.setItem(FONT_SIZE_STORAGE, String(size));
}
function writeMinimap(on) {
  safeLocalStorage()?.setItem(MINIMAP_STORAGE, on ? "1" : "0");
}
function applyOptionsToEditor(editor) {
  const fontSize = readFontSize();
  const minimap = readMinimap();
  editor.updateOptions?.({ fontSize, minimap: { enabled: minimap } });
}
function getEditorFontSize() {
  return readFontSize();
}
function getEditorMinimap() {
  return readMinimap();
}
function setEditorFontSize(size) {
  const clamped = Math.max(8, Math.min(40, Math.round(size)));
  writeFontSize(clamped);
  for (const ed of editors.values()) ed.updateOptions?.({ fontSize: clamped });
}
function bumpEditorFontSize(delta) {
  setEditorFontSize(readFontSize() + delta);
}
function toggleEditorMinimap() {
  const next = !readMinimap();
  writeMinimap(next);
  for (const ed of editors.values()) ed.updateOptions?.({ minimap: { enabled: next } });
}
function applyPersistedEditorOptions(editor) {
  applyOptionsToEditor(editor);
}
var THEME_STORAGE = "stave:editorTheme";
function readTheme() {
  const ls = safeLocalStorage();
  const v = ls?.getItem(THEME_STORAGE);
  return v === "light" || v === "system" ? v : v === "dark" ? "dark" : "dark";
}
function writeTheme(t) {
  safeLocalStorage()?.setItem(THEME_STORAGE, t);
}
function systemPrefersLight() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}
function resolveTheme(t) {
  if (t === "dark" || t === "light") return t;
  return systemPrefersLight() ? "light" : "dark";
}
var themeListeners = /* @__PURE__ */ new Set();
var systemMqlWired = false;
var systemMql = null;
function notifyThemeListeners(resolved) {
  for (const fn of themeListeners) {
    try {
      fn(resolved);
    } catch {
    }
  }
}
function wireSystemMqlOnce() {
  if (systemMqlWired || typeof window === "undefined" || !window.matchMedia) return;
  systemMqlWired = true;
  systemMql = window.matchMedia("(prefers-color-scheme: light)");
  const onChange = () => {
    if (readTheme() !== "system") return;
    applyResolvedTheme(resolveTheme("system"));
  };
  try {
    systemMql.addEventListener("change", onChange);
  } catch {
    systemMql.addListener?.(onChange);
  }
}
function applyResolvedTheme(resolved) {
  if (monacoNs?.editor?.setTheme) {
    monacoNs.editor.setTheme(resolved === "light" ? "stave-light" : "stave-dark");
  }
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-stave-theme", resolved);
  }
  notifyThemeListeners(resolved);
}
function getEditorTheme() {
  return readTheme();
}
function getResolvedTheme() {
  return resolveTheme(readTheme());
}
function setEditorTheme(theme) {
  writeTheme(theme);
  wireSystemMqlOnce();
  applyResolvedTheme(resolveTheme(theme));
}
function cycleEditorTheme() {
  const next = readTheme() === "dark" ? "light" : readTheme() === "light" ? "system" : "dark";
  setEditorTheme(next);
  return next;
}
function onThemeChange(fn) {
  themeListeners.add(fn);
  return () => {
    themeListeners.delete(fn);
  };
}
function applyPersistedTheme() {
  wireSystemMqlOnce();
  setEditorTheme(readTheme());
}

// src/monaco/diagnostics.ts
var MARKER_OWNER = "stave";
function parseErrorLocation(error) {
  const stack = error.stack ?? "";
  const match = stack.match(/at eval[^(]*\(.*?:(\d+):(\d+)\)/);
  if (match) {
    return { line: parseInt(match[1], 10), col: parseInt(match[2], 10) };
  }
  return null;
}
function setEvalError(monaco, model, error) {
  const loc = parseErrorLocation(error);
  const lineNumber = loc?.line ?? 1;
  const startColumn = loc?.col ?? 1;
  const endLineNumber = loc ? loc.line : model.getLineCount();
  const endColumn = loc ? model.getLineMaxColumn(loc.line) : model.getLineMaxColumn(model.getLineCount());
  monaco.editor.setModelMarkers(model, MARKER_OWNER, [
    {
      severity: monaco.MarkerSeverity.Error,
      message: error.message,
      startLineNumber: lineNumber,
      startColumn,
      endLineNumber,
      endColumn
    }
  ]);
}
function clearEvalErrors(monaco, model) {
  monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
}

// src/visualizers/namedVizRegistry.ts
var registry = /* @__PURE__ */ new Map();
var listeners = /* @__PURE__ */ new Set();
function registerNamedViz(name2, descriptor) {
  const existing = registry.get(name2);
  if (existing === descriptor) return;
  registry.set(name2, descriptor);
  notifyListeners();
}
function unregisterNamedViz(name2) {
  if (!registry.has(name2)) return;
  registry.delete(name2);
  notifyListeners();
}
function getNamedViz(name2) {
  return registry.get(name2);
}
function listNamedVizNames() {
  return Array.from(registry.keys());
}
function listNamedVizEntries() {
  return Array.from(registry.entries());
}
function onNamedVizChanged(cb) {
  listeners.add(cb);
  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    listeners.delete(cb);
  };
}
function notifyListeners() {
  if (listeners.size === 0) return;
  const snapshot = Array.from(listeners);
  for (const cb of snapshot) {
    try {
      cb();
    } catch {
    }
  }
}

// src/visualizers/resolveDescriptor.ts
function resolveDescriptor(vizId, descriptors) {
  const named = getNamedViz(vizId);
  if (named) return named;
  const exact = descriptors.find((d) => d.id === vizId);
  if (exact) return exact;
  const { defaultRenderer } = getVizConfig();
  const withDefault = `${vizId}:${defaultRenderer}`;
  const defaultMatch = descriptors.find((d) => d.id === withDefault);
  if (defaultMatch) return defaultMatch;
  const prefix = vizId + ":";
  return descriptors.find((d) => d.id.startsWith(prefix));
}

// src/engine/BufferedScheduler.ts
var BufferedScheduler = class {
  constructor(hapStream, audioCtx, maxAge = 10) {
    this.buffer = [];
    this.head = 0;
    /** Last event per instrument — for same-instrument overlap clipping */
    this.lastByInstrument = /* @__PURE__ */ new Map();
    this.hapStream = hapStream;
    this.audioCtx = audioCtx;
    this.maxAge = maxAge;
    this.handler = (event) => {
      const begin = event.audioTime;
      const end = event.audioTime + event.audioDuration;
      const instrument = event.s ?? "_default";
      const prev = this.lastByInstrument.get(instrument);
      if (prev && prev.end > begin) {
        prev.end = begin;
        prev.endClipped = begin;
      }
      const irEvent = {
        begin,
        end,
        endClipped: end,
        note: event.midiNote,
        freq: typeof event.midiNote === "number" ? 440 * Math.pow(2, (event.midiNote - 69) / 12) : null,
        s: event.s,
        gain: Math.min(1, Math.max(0, event.gain ?? 1)),
        velocity: Math.min(1, Math.max(0, event.velocity ?? 1)),
        color: event.color,
        loc: event.loc ?? void 0
      };
      this.buffer.push(irEvent);
      this.lastByInstrument.set(instrument, irEvent);
      const cutoff = this.audioCtx.currentTime - this.maxAge;
      while (this.head < this.buffer.length && this.buffer[this.head].end < cutoff) {
        const old = this.buffer[this.head];
        const key = old.s ?? "_default";
        if (this.lastByInstrument.get(key) === old) {
          this.lastByInstrument.delete(key);
        }
        this.head++;
      }
      if (this.head > this.buffer.length / 2 && this.head > 100) {
        this.buffer = this.buffer.slice(this.head);
        this.head = 0;
      }
    };
    hapStream.on(this.handler);
  }
  now() {
    return this.audioCtx.currentTime;
  }
  query(begin, end) {
    const result = [];
    for (let i2 = this.head; i2 < this.buffer.length; i2++) {
      const h = this.buffer[i2];
      if (h.begin < end && h.end > begin) result.push(h);
    }
    return result;
  }
  clear() {
    this.buffer.length = 0;
    this.head = 0;
    this.lastByInstrument.clear();
  }
  dispose() {
    this.hapStream.off(this.handler);
    this.buffer.length = 0;
    this.head = 0;
    this.lastByInstrument.clear();
  }
};

// src/visualizers/vizPreset.ts
var DB_NAME = "stave-viz-presets";
var DB_VERSION = 1;
var STORE_NAME = "presets";
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(db, mode) {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}
function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
var BUNDLED_PREFIX = "__bundled_";
function sanitizePresetName(name2) {
  const slug = name2.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "untitled";
}
function bundledPresetId(name2, renderer) {
  return `${BUNDLED_PREFIX}${sanitizePresetName(name2)}_${renderer}__`;
}
function isBundledPresetId(id) {
  return id.startsWith(BUNDLED_PREFIX);
}
function generateUniquePresetId(name2, renderer, existingIds) {
  const slug = sanitizePresetName(name2);
  const used = new Set(existingIds);
  let n = 1;
  let id = `${slug}_${renderer}_v${n}`;
  while (used.has(id)) {
    n++;
    id = `${slug}_${renderer}_v${n}`;
  }
  return id;
}
var VizPresetStore = {
  async getAll() {
    const db = await openDb();
    return wrap(tx(db, "readonly").getAll());
  },
  async get(id) {
    const db = await openDb();
    return wrap(tx(db, "readonly").get(id));
  },
  async put(preset) {
    const db = await openDb();
    await wrap(tx(db, "readwrite").put(preset));
  },
  async delete(id) {
    const db = await openDb();
    await wrap(tx(db, "readwrite").delete(id));
  }
};

// src/visualizers/viewZones.ts
var DEFAULT_NATIVE = { w: 1200, h: 600 };
var MAX_ZONE_HEIGHT = 600;
var MIN_ZONE_HEIGHT = 80;
function nativeSizeFor(preset) {
  const s = preset?.nativeSize;
  if (s && s.w > 0 && s.h > 0) return { w: s.w, h: s.h };
  return DEFAULT_NATIVE;
}
function computeLayout(contentW, native, crop) {
  const cropW = Math.max(0.01, crop.w);
  const cropH = Math.max(0.01, crop.h);
  const scale2 = contentW / (cropW * native.w);
  let zoneH = cropH * native.h * scale2;
  if (zoneH > MAX_ZONE_HEIGHT) {
    const clamped = MAX_ZONE_HEIGHT / (cropH * native.h);
    return {
      zoneH: MAX_ZONE_HEIGHT,
      scale: clamped,
      tx: -crop.x * native.w * clamped,
      ty: -crop.y * native.h * clamped
    };
  }
  if (zoneH < MIN_ZONE_HEIGHT) zoneH = MIN_ZONE_HEIGHT;
  return {
    zoneH,
    scale: scale2,
    tx: -crop.x * native.w * scale2,
    ty: -crop.y * native.h * scale2
  };
}
function applyLayout(container, canvas, layout) {
  container.style.height = `${layout.zoneH ?? container.style.height}`;
  let wrapper = container.querySelector("[data-viz-canvas-wrap]");
  if (!wrapper && canvas) {
    wrapper = document.createElement("div");
    wrapper.setAttribute("data-viz-canvas-wrap", "");
    wrapper.style.cssText = `position:absolute;top:0;left:0;transform-origin:0 0;`;
    canvas.parentElement?.insertBefore(wrapper, canvas);
    wrapper.appendChild(canvas);
  }
  if (wrapper) {
    wrapper.style.transform = `translate(${layout.tx}px, ${layout.ty}px) scale(${layout.scale})`;
  }
}
function createFloatingActionBar(editorDom) {
  const bar = document.createElement("div");
  bar.setAttribute("data-viz-actions", "");
  bar.style.cssText = `
    position:absolute;z-index:100;
    display:flex;gap:4px;
    opacity:0;transition:opacity 0.15s;
    pointer-events:none;
  `;
  const btnCss = `
    background:var(--bg-elevated,#1e1e38);
    border:1px solid var(--border-strong,#3a3a5a);
    border-radius:3px;padding:2px 6px;
    color:var(--text-primary,#e8e8f0);
    font-size:11px;cursor:pointer;
    font-family:system-ui,sans-serif;
    pointer-events:auto;
  `;
  const blockMonaco = (el) => {
    el.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
    el.addEventListener("mouseup", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
    el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
    el.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
  };
  const editBtn = document.createElement("button");
  editBtn.textContent = "\u270E";
  editBtn.title = "Edit viz file";
  editBtn.style.cssText = btnCss;
  blockMonaco(editBtn);
  bar.appendChild(editBtn);
  const cropBtn = document.createElement("button");
  cropBtn.textContent = "\u2702";
  cropBtn.title = "Crop inline region";
  cropBtn.style.cssText = btnCss;
  blockMonaco(cropBtn);
  bar.appendChild(cropBtn);
  const guard = editorDom.querySelector(".overflow-guard") || editorDom;
  guard.appendChild(bar);
  return bar;
}
var FULL_CROP = { x: 0, y: 0, w: 1, h: 1 };
function addInlineViewZones(editor, components, vizDescriptors, actions) {
  const vizRequests = components.inlineViz?.vizRequests;
  if (!vizRequests || vizRequests.size === 0) {
    return { cleanup: () => {
    }, pause: () => {
    }, resume: () => {
    } };
  }
  const renderers = [];
  const bufferedSchedulers = [];
  const zoneEntries = [];
  const audioCtx = components.audio?.audioCtx;
  editor.changeViewZones((accessor) => {
    for (const [trackKey, { vizId, afterLine }] of vizRequests) {
      const descriptor = resolveDescriptor(vizId, vizDescriptors);
      if (!descriptor) {
        console.warn(`[stave] Unknown viz "${vizId}". Available: ${vizDescriptors.map((d) => d.id).join(", ")}`);
        continue;
      }
      let trackScheduler = components.queryable?.trackSchedulers.get(trackKey) ?? null;
      const trackStream = components.inlineViz?.trackStreams?.get(trackKey);
      if (!trackScheduler && trackStream && audioCtx) {
        const buffered = new BufferedScheduler(trackStream, audioCtx);
        bufferedSchedulers.push(buffered);
        trackScheduler = buffered;
      }
      const trackAnalyser = components.audio?.trackAnalysers?.get(trackKey);
      const zoneAudio = trackAnalyser && audioCtx ? { analyser: trackAnalyser, audioCtx, trackAnalysers: components.audio?.trackAnalysers } : components.audio;
      const zoneComponents = {
        ...components,
        ...trackStream ? { streaming: { hapStream: trackStream } } : {},
        audio: zoneAudio,
        queryable: {
          scheduler: trackScheduler,
          trackSchedulers: components.queryable?.trackSchedulers ?? /* @__PURE__ */ new Map()
        }
      };
      const native = DEFAULT_NATIVE;
      const crop = FULL_CROP;
      const contentW = editor.getLayoutInfo().contentWidth || 400;
      const layout = computeLayout(contentW, native, crop);
      const container = document.createElement("div");
      container.setAttribute("data-viz-zone", "");
      container.style.cssText = `overflow:hidden;height:${layout.zoneH}px;position:relative;`;
      const zoneId = accessor.addZone({
        afterLineNumber: afterLine,
        heightInPx: layout.zoneH,
        domNode: container,
        suppressMouseDown: true
      });
      const renderer = typeof descriptor.factory === "function" ? descriptor.factory() : descriptor.factory;
      try {
        renderer.mount(container, zoneComponents, { w: native.w, h: native.h }, console.error);
      } catch (e) {
        console.error("[stave] viz mount failed:", e);
      }
      renderers.push(renderer);
      const canvas = container.querySelector("canvas");
      applyLayout(container, canvas, layout);
      requestAnimationFrame(() => {
        applyLayout(container, container.querySelector("canvas"), layout);
      });
      zoneEntries.push({
        zoneId,
        afterLine,
        container,
        canvas,
        vizId,
        presetId: null,
        native,
        crop
      });
    }
  });
  const normalize = (s) => s.toLowerCase().replace(/[\s\-_]/g, "");
  void (async () => {
    try {
      const presets = await VizPresetStore.getAll();
      editor.changeViewZones((accessor) => {
        for (const entry of zoneEntries) {
          const normViz = normalize(entry.vizId);
          const preset = presets.find((p) => normalize(p.name) === normViz) ?? null;
          if (!preset) continue;
          entry.presetId = preset.id;
          entry.native = nativeSizeFor(preset);
          entry.crop = preset.cropRegion ?? FULL_CROP;
          const contentW = editor.getLayoutInfo().contentWidth || 400;
          const layout = computeLayout(contentW, entry.native, entry.crop);
          entry.container.style.height = `${layout.zoneH}px`;
          accessor.layoutZone(entry.zoneId);
          applyLayout(entry.container, entry.container.querySelector("canvas"), layout);
        }
      });
      for (const entry of zoneEntries) {
        const contentW = editor.getLayoutInfo().contentWidth || 400;
        const layout = computeLayout(contentW, entry.native, entry.crop);
        entry.container.style.height = `${layout.zoneH}px`;
        applyLayout(entry.container, entry.container.querySelector("canvas"), layout);
      }
    } catch {
    }
  })();
  const layoutChangeDisposable = editor.onDidLayoutChange?.(() => {
    editor.changeViewZones((accessor) => {
      for (const entry of zoneEntries) {
        const contentW = editor.getLayoutInfo().contentWidth || 400;
        const layout = computeLayout(contentW, entry.native, entry.crop);
        entry.container.style.height = `${layout.zoneH}px`;
        accessor.layoutZone(entry.zoneId);
        applyLayout(entry.container, entry.container.querySelector("canvas"), layout);
      }
    });
  });
  const editorDom = editor.getDomNode?.();
  let floatingBar = null;
  let mouseMoveDisposable = null;
  if (editorDom && actions && (actions.onEdit || actions.onCrop)) {
    floatingBar = createFloatingActionBar(editorDom);
    const editBtn = floatingBar.children[0];
    const cropBtn = floatingBar.children[1];
    editBtn.onclick = (e) => {
      e.stopPropagation();
      const vizId = floatingBar?.getAttribute("data-viz-id");
      if (vizId && actions.onEdit) actions.onEdit(vizId);
    };
    cropBtn.onclick = (e) => {
      e.stopPropagation();
      const vizId = floatingBar?.getAttribute("data-viz-id");
      const presetId = floatingBar?.getAttribute("data-preset-id") || null;
      if (vizId && actions.onCrop) actions.onCrop(vizId, presetId);
    };
    mouseMoveDisposable = editor.onMouseMove?.((ev) => {
      const mouseY = ev.event.posy;
      const mouseX = ev.event.posx;
      let found = null;
      for (const entry of zoneEntries) {
        const rect = entry.container.getBoundingClientRect();
        if (mouseY >= rect.top && mouseY <= rect.bottom && mouseX >= rect.left && mouseX <= rect.right) {
          found = entry;
          break;
        }
      }
      if (found && floatingBar) {
        const rect = found.container.getBoundingClientRect();
        const guardRect = (editorDom.querySelector(".overflow-guard") || editorDom).getBoundingClientRect();
        floatingBar.style.top = `${rect.top - guardRect.top + 4}px`;
        floatingBar.style.left = `${rect.right - guardRect.left - 68}px`;
        floatingBar.style.opacity = "1";
        floatingBar.style.pointerEvents = "auto";
        floatingBar.setAttribute("data-viz-id", found.vizId);
        floatingBar.setAttribute("data-preset-id", found.presetId || "");
      } else if (floatingBar) {
        floatingBar.style.opacity = "0";
        floatingBar.style.pointerEvents = "none";
      }
    }) ?? null;
  }
  const mouseLeaveHandler = () => {
    if (floatingBar) {
      floatingBar.style.opacity = "0";
      floatingBar.style.pointerEvents = "none";
    }
  };
  editorDom?.addEventListener("mouseleave", mouseLeaveHandler);
  return {
    cleanup() {
      mouseMoveDisposable?.dispose?.();
      layoutChangeDisposable?.dispose?.();
      editorDom?.removeEventListener("mouseleave", mouseLeaveHandler);
      floatingBar?.remove();
      renderers.forEach((r) => r.destroy());
      bufferedSchedulers.forEach((s) => s.dispose());
      editor.changeViewZones((accessor) => {
        zoneEntries.forEach((e) => accessor.removeZone(e.zoneId));
      });
    },
    pause() {
      renderers.forEach((r) => r.pause());
    },
    resume() {
      renderers.forEach((r) => r.resume());
    }
  };
}
function monacoThemeNameFor(theme) {
  return theme === "light" ? "stave-light" : "stave-dark";
}
var MonacoEditor = MonacoEditorRaw__default.default;
var MONACO_OPTIONS = {
  fontSize: 13,
  lineHeight: 22,
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  fontLigatures: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: "on",
  automaticLayout: true,
  padding: { top: 8, bottom: 8 },
  scrollbar: {
    vertical: "auto",
    horizontal: "auto",
    useShadows: false
  },
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: false,
  renderLineHighlight: "line",
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on"
};
function EditorView({
  fileId,
  theme = "dark",
  chromeSlot,
  onMount,
  error,
  onPlay,
  onStop,
  onEditViz,
  onCropViz
}) {
  const { file, setContent: setContent2 } = useWorkspaceFile(fileId);
  const containerRef = React.useRef(null);
  const editorRef = React.useRef(null);
  const monacoRef = React.useRef(null);
  const viewZoneHandleRef = React.useRef(null);
  const lastPayloadRef = React.useRef(null);
  const [hapStream, setHapStream] = React.useState(null);
  React.useEffect(() => {
    if (!containerRef.current) return;
    applyTheme(containerRef.current, theme);
  }, [theme]);
  React.useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco?.editor?.setTheme) return;
    monaco.editor.setTheme(monacoThemeNameFor(theme));
  }, [theme]);
  React.useEffect(() => {
    if (!fileId) return;
    const unsub = workspaceAudioBus.subscribe(
      { kind: "file", fileId },
      (payload) => {
        setHapStream(payload?.hapStream ?? null);
        lastPayloadRef.current = payload;
        if (payload?.inlineViz?.vizRequests?.size && editorRef.current) {
          viewZoneHandleRef.current?.cleanup();
          viewZoneHandleRef.current = addInlineViewZones(
            editorRef.current,
            payload.engineComponents ?? payload,
            DEFAULT_VIZ_DESCRIPTORS,
            { onEdit: onEditViz, onCrop: onCropViz }
          );
          viewZoneHandleRef.current?.resume();
        } else if (payload === null) {
          viewZoneHandleRef.current?.pause();
        }
      }
    );
    return () => {
      unsub();
      lastPayloadRef.current = null;
      viewZoneHandleRef.current?.cleanup();
      viewZoneHandleRef.current = null;
    };
  }, [fileId]);
  React.useEffect(() => {
    if (!fileId) return;
    const unsub = onNamedVizChanged(() => {
      const payload = lastPayloadRef.current;
      if (!payload?.inlineViz?.vizRequests?.size || !editorRef.current) return;
      viewZoneHandleRef.current?.cleanup();
      viewZoneHandleRef.current = addInlineViewZones(
        editorRef.current,
        payload.engineComponents ?? payload,
        DEFAULT_VIZ_DESCRIPTORS,
        { onEdit: onEditViz, onCrop: onCropViz }
      );
      viewZoneHandleRef.current?.resume();
    });
    return unsub;
  }, [fileId]);
  useHighlighting(editorRef.current, hapStream);
  React.useEffect(() => {
    return () => {
      if (editorRef.current) unregisterEditor(fileId, editorRef.current);
    };
  }, [fileId]);
  React.useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel?.();
    if (!model) return;
    if (error) {
      setEvalError(monaco, model, error);
    } else {
      clearEvalErrors(monaco, model);
    }
  }, [error]);
  const onPlayRef = React.useRef(onPlay);
  onPlayRef.current = onPlay;
  const onStopRef = React.useRef(onStop);
  onStopRef.current = onStop;
  const handleMonacoMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerEditor(fileId, editor);
    registerMonacoNamespace(monaco);
    applyPersistedEditorOptions(editor);
    ensureWorkspaceLanguages(monaco);
    if (monaco.editor?.defineTheme && monaco.editor?.setTheme) {
      defineStrudelMonacoTheme(monaco);
      monaco.editor.setTheme(monacoThemeNameFor(theme));
    }
    if (monaco.KeyMod && monaco.KeyCode && editor.addAction) {
      editor.addAction({
        id: "stave.play",
        label: "Play / Stop",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => onPlayRef.current?.()
      });
      editor.addAction({
        id: "stave.stop",
        label: "Stop",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period],
        run: () => onStopRef.current?.()
      });
    }
    onMount?.(editor, monaco);
  };
  const handleChange = (value) => {
    if (value === void 0) return;
    setContent2(value);
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      ref: containerRef,
      "data-workspace-view": "editor",
      "data-file-id": fileId,
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        background: "var(--background)",
        color: "var(--foreground)"
      },
      children: [
        chromeSlot ? /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            "data-workspace-view-slot": "chrome",
            style: { flexShrink: 0 },
            children: chromeSlot
          }
        ) : null,
        /* @__PURE__ */ jsxRuntime.jsx("div", { style: { flex: 1, minHeight: 0, position: "relative" }, children: file ? /* @__PURE__ */ jsxRuntime.jsx(
          MonacoEditor,
          {
            height: "100%",
            language: toMonacoLanguage(file.language),
            value: file.content,
            onChange: handleChange,
            onMount: handleMonacoMount,
            options: MONACO_OPTIONS
          }
        ) : /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            "data-workspace-view-state": "loading",
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--foreground-muted)",
              fontSize: 12
            },
            children: "Loading\u2026"
          }
        ) })
      ]
    }
  );
}
function payloadKey(ref, payload) {
  if (payload === null) return "none";
  if (ref.kind === "file") return `file:${ref.fileId}`;
  if (ref.kind === "default") {
    const sources = workspaceAudioBus.listSources();
    if (sources.length === 0) return "none";
    return `default:${sources[sources.length - 1].sourceId}`;
  }
  return "none";
}
function sourceRefKey(ref) {
  if (ref.kind === "file") return `ref:file:${ref.fileId}`;
  if (ref.kind === "none") return "ref:none";
  return "ref:default";
}
function PreviewView({
  fileId,
  provider,
  sourceRef,
  onSourceRefChange,
  theme = "dark",
  hidden = false,
  paused = false
}) {
  const { file } = useWorkspaceFile(fileId);
  const containerRef = React.useRef(null);
  const [audioPayload, setAudioPayload] = React.useState(null);
  const [reloadTick, setReloadTick] = React.useState(0);
  const [, forceSourcesRerender] = React.useState(0);
  const catchUpNeededRef = React.useRef(false);
  React.useEffect(() => {
    if (!containerRef.current) return;
    applyTheme(containerRef.current, theme);
  }, [theme]);
  React.useEffect(() => {
    const unsubscribe = workspaceAudioBus.subscribe(sourceRef, (payload) => {
      setAudioPayload(payload);
    });
    return unsubscribe;
  }, [sourceRef]);
  React.useEffect(() => {
    const unsubscribe = workspaceAudioBus.onSourcesChanged(() => {
      forceSourcesRerender((n) => n + 1);
    });
    return unsubscribe;
  }, []);
  const effectivelyHidden = hidden && !provider.keepRunningWhenHidden;
  React.useEffect(() => {
    if (!file) return;
    if (provider.reload === "manual") return;
    if (effectivelyHidden) {
      catchUpNeededRef.current = true;
      return;
    }
    if (provider.reload === "instant") {
      setReloadTick((n) => n + 1);
      return;
    }
    const ms = provider.debounceMs ?? 0;
    const handle2 = setTimeout(() => {
      setReloadTick((n) => n + 1);
    }, ms);
    return () => {
      clearTimeout(handle2);
    };
  }, [
    file?.content,
    provider.reload,
    provider.debounceMs,
    effectivelyHidden,
    file
  ]);
  const prevEffectivelyHiddenRef = React.useRef(effectivelyHidden);
  React.useEffect(() => {
    const wasHidden = prevEffectivelyHiddenRef.current;
    prevEffectivelyHiddenRef.current = effectivelyHidden;
    if (wasHidden && !effectivelyHidden && catchUpNeededRef.current) {
      catchUpNeededRef.current = false;
      setReloadTick((n) => n + 1);
    }
  }, [effectivelyHidden]);
  const handleSourceChange = React.useCallback(
    (e) => {
      const value = e.target.value;
      if (value === "default") {
        onSourceRefChange({ kind: "default" });
        return;
      }
      if (value === "none") {
        onSourceRefChange({ kind: "none" });
        return;
      }
      const colonIdx = value.indexOf(":");
      if (colonIdx !== -1 && value.slice(0, colonIdx) === "file") {
        onSourceRefChange({
          kind: "file",
          fileId: value.slice(colonIdx + 1)
        });
      }
    },
    [onSourceRefChange]
  );
  const selectorValue = sourceRef.kind === "default" ? "default" : sourceRef.kind === "none" ? "none" : `file:${sourceRef.fileId}`;
  const providerNode = React__default.default.useMemo(() => {
    if (!file) return null;
    return provider.render({
      file,
      audioSource: audioPayload,
      hidden: effectivelyHidden,
      paused
    });
  }, [file, provider, audioPayload, effectivelyHidden, paused, reloadTick]);
  const providerKey = `${sourceRefKey(sourceRef)}:${payloadKey(sourceRef, audioPayload)}:${reloadTick}`;
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      ref: containerRef,
      "data-workspace-view": "preview",
      "data-file-id": fileId,
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        background: "var(--background)",
        color: "var(--foreground)"
      },
      children: [
        /* @__PURE__ */ jsxRuntime.jsxs(
          "div",
          {
            "data-workspace-view-slot": "preview-chrome",
            style: {
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              flexShrink: 0,
              borderBottom: "1px solid var(--border)",
              background: "var(--surface)",
              fontSize: 11,
              color: "var(--foreground-muted)"
            },
            children: [
              /* @__PURE__ */ jsxRuntime.jsx("label", { htmlFor: `preview-source-${fileId}`, children: "Source:" }),
              /* @__PURE__ */ jsxRuntime.jsxs(
                "select",
                {
                  id: `preview-source-${fileId}`,
                  "data-testid": `preview-source-select-${fileId}`,
                  value: selectorValue,
                  onChange: handleSourceChange,
                  style: {
                    background: "var(--surface-elevated)",
                    color: "var(--foreground)",
                    border: "1px solid var(--border)",
                    borderRadius: 3,
                    padding: "2px 4px",
                    fontSize: 11
                  },
                  children: [
                    /* @__PURE__ */ jsxRuntime.jsx("option", { value: "default", children: "default (follow most recent)" }),
                    /* @__PURE__ */ jsxRuntime.jsx("option", { value: "none", children: "none (demo mode)" }),
                    workspaceAudioBus.listSources().map((source) => /* @__PURE__ */ jsxRuntime.jsxs("option", { value: `file:${source.sourceId}`, children: [
                      source.playing ? "\u25CF " : "\u25CB ",
                      source.label
                    ] }, source.sourceId))
                  ]
                }
              ),
              audioPayload === null ? /* @__PURE__ */ jsxRuntime.jsx(
                "span",
                {
                  "data-testid": `preview-demo-badge-${fileId}`,
                  style: {
                    marginLeft: "auto",
                    padding: "1px 4px",
                    borderRadius: 2,
                    background: "var(--accent-dim)",
                    color: "var(--accent)",
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: 0.3
                  },
                  children: "demo"
                }
              ) : null
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx("div", { style: { flex: 1, minHeight: 0, position: "relative" }, children: file ? /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            "data-testid": `preview-provider-mount-${fileId}`,
            "data-provider-key": providerKey,
            style: { width: "100%", height: "100%" },
            children: providerNode
          },
          providerKey
        ) : /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            "data-workspace-view-state": "loading",
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--foreground-muted)",
              fontSize: 12
            },
            children: "Loading\u2026"
          }
        ) })
      ]
    }
  );
}

// src/workspace/commands/CommandRegistry.ts
var commandRegistry = /* @__PURE__ */ new Map();
function registerCommand(cmd) {
  commandRegistry.set(cmd.id, cmd);
}
function executeCommand(id, ctx) {
  const cmd = commandRegistry.get(id);
  if (!cmd) return;
  cmd.execute(ctx);
}
var warnedCommands = /* @__PURE__ */ new Set();
function warnOnceDisabled(commandId, language) {
  if (warnedCommands.has(commandId)) return;
  warnedCommands.add(commandId);
  console.warn(
    `${commandId} not available for .${language} files`
  );
}
var __nextTabSeq = 0;
function generateTabId(prefix) {
  __nextTabSeq += 1;
  return `${prefix}-${__nextTabSeq}-${Math.random().toString(36).slice(2, 7)}`;
}
function getLanguageFromTab(tab) {
  const file = getFile(tab.fileId);
  if (file) return file.language;
  const dot = tab.fileId.lastIndexOf(".");
  if (dot === -1) return void 0;
  const ext = tab.fileId.slice(dot + 1);
  switch (ext) {
    case "hydra":
      return "hydra";
    case "p5":
      return "p5js";
    case "md":
      return "markdown";
    case "strudel":
      return "strudel";
    case "sonicpi":
      return "sonicpi";
    default:
      return ext;
  }
}
function registerBuiltinCommands() {
  registerCommand({
    id: "workspace.openPreviewToSide",
    label: "Open Preview to the Side",
    keybinding: "Cmd+K V",
    execute(ctx) {
      const { activeTab, activeGroupId, shell, getPreviewProvider } = ctx;
      if (!activeTab || !activeGroupId) return;
      if (activeTab.kind === "preview") return;
      const language = getLanguageFromTab(activeTab);
      if (!language) return;
      const provider = getPreviewProvider(language);
      if (!provider) {
        warnOnceDisabled("workspace.openPreviewToSide", language);
        return;
      }
      const newTab = {
        kind: "preview",
        id: generateTabId("preview"),
        fileId: activeTab.fileId,
        sourceRef: { kind: "default" }
      };
      shell.splitGroupWithTab(activeGroupId, "right", newTab);
    }
  });
  registerCommand({
    id: "workspace.toggleBackgroundPreview",
    label: "Toggle Background Preview",
    keybinding: "Cmd+K B",
    execute(ctx) {
      const { activeTab, activeGroupId, activeGroup, shell, getPreviewProvider } = ctx;
      if (!activeTab || !activeGroupId || !activeGroup) return;
      if (activeTab.kind !== "editor") return;
      const language = getLanguageFromTab(activeTab);
      if (!language) return;
      const provider = getPreviewProvider(language);
      if (!provider) {
        warnOnceDisabled("workspace.toggleBackgroundPreview", language);
        return;
      }
      const bgTabId = `bg-${activeTab.fileId}`;
      if (activeGroup.backgroundTabId === bgTabId) {
        shell.updateGroupBackground(activeGroupId, null);
      } else {
        shell.updateGroupBackground(activeGroupId, bgTabId);
      }
    }
  });
  registerCommand({
    id: "workspace.openPreviewInWindow",
    label: "Open Preview in New Window",
    keybinding: "Cmd+K W",
    execute(ctx) {
      const { activeTab, shell, getPreviewProvider } = ctx;
      if (!activeTab) return;
      if (activeTab.kind !== "editor") return;
      const language = getLanguageFromTab(activeTab);
      if (!language) return;
      const provider = getPreviewProvider(language);
      if (!provider) {
        warnOnceDisabled("workspace.openPreviewInWindow", language);
        return;
      }
      shell.openPopoutPreview?.(activeTab.fileId);
    }
  });
}
registerBuiltinCommands();

// src/workspace/commands/useKeyboardCommands.ts
var CHORD_TIMEOUT_MS = 1e3;
var CHORD_MAP = {
  v: "workspace.openPreviewToSide",
  b: "workspace.toggleBackgroundPreview",
  w: "workspace.openPreviewInWindow"
};
function useKeyboardCommands(opts) {
  const optsRef = React.useRef(opts);
  optsRef.current = opts;
  React.useEffect(() => {
    let chordPending = false;
    let chordTimer = null;
    function clearChord() {
      chordPending = false;
      if (chordTimer !== null) {
        clearTimeout(chordTimer);
        chordTimer = null;
      }
    }
    function handler(e) {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key.toLowerCase() === "k" && !chordPending) {
        e.preventDefault();
        chordPending = true;
        chordTimer = setTimeout(() => {
          chordPending = false;
          chordTimer = null;
        }, CHORD_TIMEOUT_MS);
        return;
      }
      if (chordPending) {
        const secondKey = e.key.toLowerCase();
        const commandId = CHORD_MAP[secondKey];
        clearChord();
        if (commandId) {
          e.preventDefault();
          const o = optsRef.current;
          const ctx = {
            activeTab: o.getActiveTab(),
            activeGroupId: o.getActiveGroupId(),
            activeGroup: o.getActiveGroup(),
            shell: o.shellActions,
            getPreviewProvider: o.getPreviewProvider
          };
          executeCommand(commandId, ctx);
        }
        return;
      }
    }
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearChord();
    };
  }, []);
}

// src/workspace/preview/registry.ts
var byExtension = /* @__PURE__ */ new Map();
var byLanguage = /* @__PURE__ */ new Map();
function normalizeExtension(ext) {
  if (!ext) return void 0;
  return ext.startsWith(".") ? ext : `.${ext}`;
}
function extensionToLanguage(ext) {
  switch (ext) {
    case ".hydra":
      return "hydra";
    case ".p5":
      return "p5js";
    case ".md":
      return "markdown";
    default:
      return void 0;
  }
}
function registerPreviewProvider(provider) {
  for (const rawExt of provider.extensions) {
    const ext = normalizeExtension(rawExt);
    if (!ext) continue;
    byExtension.set(ext, provider);
    const lang = extensionToLanguage(ext);
    if (lang) byLanguage.set(lang, provider);
  }
}
function getPreviewProviderForExtension(extension) {
  const key = normalizeExtension(extension);
  if (!key) return void 0;
  return byExtension.get(key);
}
function getPreviewProviderForLanguage(language) {
  return byLanguage.get(language);
}
var previewProviderRegistry = byExtension;

// src/workspace/groupLayout.ts
function findGroupCoords(layout, groupId) {
  for (let c = 0; c < layout.length; c++) {
    const column = layout[c];
    const r = column.indexOf(groupId);
    if (r !== -1) return [c, r];
  }
  return null;
}
function allGroupIds(layout) {
  const out2 = [];
  for (const col of layout) {
    for (const id of col) out2.push(id);
  }
  return out2;
}
function insertGroup(layout, targetId, direction, newId) {
  if (direction === "center") return layout;
  const coords = findGroupCoords(layout, targetId);
  if (!coords) return layout;
  const [c, r] = coords;
  if (direction === "west" || direction === "east") {
    const newCol = [newId];
    const insertAt2 = direction === "west" ? c : c + 1;
    return [
      ...layout.slice(0, insertAt2),
      newCol,
      ...layout.slice(insertAt2)
    ];
  }
  const targetColumn = layout[c];
  const insertAt = direction === "north" ? r : r + 1;
  const nextColumn = [
    ...targetColumn.slice(0, insertAt),
    newId,
    ...targetColumn.slice(insertAt)
  ];
  return layout.map((col, i2) => i2 === c ? nextColumn : col);
}
function insertEdgeGroup(layout, position, newId) {
  const newCol = [newId];
  return position === "start" ? [newCol, ...layout] : [...layout, newCol];
}
function removeGroup(layout, groupId) {
  const coords = findGroupCoords(layout, groupId);
  if (!coords) return layout;
  const [c] = coords;
  const nextColumn = layout[c].filter((id) => id !== groupId);
  if (nextColumn.length === 0) {
    return layout.filter((_, i2) => i2 !== c);
  }
  return layout.map((col, i2) => i2 === c ? nextColumn : col);
}

// src/workspace/playbackCoordinator.ts
var registry2 = /* @__PURE__ */ new Map();
var changeListeners = /* @__PURE__ */ new Set();
var currentlyPlaying = null;
function registerPlaybackSource(sourceId, stop2, label) {
  registry2.set(sourceId, { stop: stop2, label });
  return () => {
    const entry = registry2.get(sourceId);
    if (entry?.stop === stop2) {
      registry2.delete(sourceId);
      if (currentlyPlaying === sourceId) {
        currentlyPlaying = null;
        fireChange();
      }
    }
  };
}
function notifyPlaybackStarted(sourceId) {
  if (currentlyPlaying === sourceId) return;
  for (const [id, src] of registry2) {
    if (id === sourceId) continue;
    try {
      src.stop();
    } catch (err2) {
      console.warn(
        `[playbackCoordinator] stop() threw for source "${id}" (${src.label ?? "unlabeled"}):`,
        err2
      );
    }
  }
  currentlyPlaying = sourceId;
  fireChange();
}
function notifyPlaybackStopped(sourceId) {
  if (currentlyPlaying !== sourceId) return;
  currentlyPlaying = null;
  fireChange();
}
function fireChange() {
  if (changeListeners.size === 0) return;
  const snapshot = Array.from(changeListeners);
  for (const cb of snapshot) {
    try {
      cb(currentlyPlaying);
    } catch {
    }
  }
}

// src/workspace/sampleSound.ts
var SAMPLE_SOUND_SOURCE_ID = "__sample__";
var SAMPLE_SOUND_LABEL = "Sample sound (test audio)";
var SAMPLE_PATTERN_CYCLE_SECONDS = 2;
var SAMPLE_PATTERN_NOTE_DURATION = 0.5;
var SAMPLE_PATTERN_NOTES = [57, 60, 64, 67];
var SampleSoundScheduler = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  now() {
    return this.ctx.currentTime;
  }
  query(begin, end) {
    if (end <= begin) return [];
    const events = [];
    const firstCycle = Math.floor(begin / SAMPLE_PATTERN_CYCLE_SECONDS);
    const lastCycle = Math.floor(end / SAMPLE_PATTERN_CYCLE_SECONDS);
    for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
      const cycleStart = cycle * SAMPLE_PATTERN_CYCLE_SECONDS;
      for (let i2 = 0; i2 < SAMPLE_PATTERN_NOTES.length; i2++) {
        const noteBegin = cycleStart + i2 * SAMPLE_PATTERN_NOTE_DURATION;
        const noteEnd = noteBegin + SAMPLE_PATTERN_NOTE_DURATION;
        if (noteEnd <= begin || noteBegin >= end) continue;
        const midi = SAMPLE_PATTERN_NOTES[i2];
        events.push({
          begin: noteBegin,
          end: noteEnd,
          endClipped: noteEnd,
          note: midi,
          // freq = 440 * 2^((midi - 69) / 12). Precompute because
          // the renderer may prefer freq over note (e.g., pitch-axis
          // visualizations).
          freq: 440 * Math.pow(2, (midi - 69) / 12),
          s: SAMPLE_SOUND_SOURCE_ID,
          type: "synth",
          gain: 1,
          velocity: 1,
          color: null,
          trackId: SAMPLE_SOUND_SOURCE_ID
        });
      }
    }
    return events;
  }
};
var state = null;
function startSampleSound() {
  if (state) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 110;
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 80;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  const outGain = ctx.createGain();
  outGain.gain.value = 0.05;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  osc.connect(outGain);
  outGain.connect(ctx.destination);
  osc.connect(analyser);
  osc.start();
  lfo.start();
  const scheduler = new SampleSoundScheduler(ctx);
  const hapStream = new HapStream();
  state = { ctx, osc, lfo, lfoGain, outGain, analyser, scheduler, hapStream };
  const payload = {
    analyser,
    scheduler,
    hapStream,
    audio: {
      analyser,
      audioCtx: ctx
    }
  };
  workspaceAudioBus.publish(SAMPLE_SOUND_SOURCE_ID, payload);
  notifyPlaybackStarted(SAMPLE_SOUND_SOURCE_ID);
}
function stopSampleSound() {
  if (!state) return;
  try {
    state.osc.stop();
    state.lfo.stop();
  } catch {
  }
  try {
    state.osc.disconnect();
    state.lfo.disconnect();
    state.lfoGain.disconnect();
    state.outGain.disconnect();
    state.analyser.disconnect();
  } catch {
  }
  state.hapStream.dispose();
  workspaceAudioBus.unpublish(SAMPLE_SOUND_SOURCE_ID);
  try {
    void state.ctx.close();
  } catch {
  }
  state = null;
  notifyPlaybackStopped(SAMPLE_SOUND_SOURCE_ID);
}
function isSampleSoundPlaying() {
  return state !== null;
}
registerPlaybackSource(
  SAMPLE_SOUND_SOURCE_ID,
  stopSampleSound,
  SAMPLE_SOUND_LABEL
);

// src/workspace/drumPattern.ts
var DRUM_PATTERN_SOURCE_ID = "__example_drums__";
var DRUM_PATTERN_LABEL = "Example: drum pattern";
var BAR_SECONDS = 2;
var HIT_DURATION = 0.1;
var DRUM_PATTERN = [
  { s: "bd", midi: 36, beatOffsets: [0, 0.5, 1, 1.5] },
  { s: "sd", midi: 38, beatOffsets: [0.5, 1.5] },
  {
    s: "hh",
    midi: 42,
    beatOffsets: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]
  },
  { s: "oh", midi: 46, beatOffsets: [1.75] }
];
var DrumPatternScheduler = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  now() {
    return this.ctx.currentTime;
  }
  query(begin, end) {
    if (end <= begin) return [];
    const events = [];
    const firstBar = Math.floor(begin / BAR_SECONDS);
    const lastBar = Math.floor(end / BAR_SECONDS);
    for (let bar = firstBar; bar <= lastBar; bar++) {
      const barStart = bar * BAR_SECONDS;
      for (const hit of DRUM_PATTERN) {
        for (const offset of hit.beatOffsets) {
          const noteBegin = barStart + offset;
          const noteEnd = noteBegin + HIT_DURATION;
          if (noteEnd <= begin || noteBegin >= end) continue;
          events.push({
            begin: noteBegin,
            end: noteEnd,
            endClipped: noteEnd,
            note: hit.midi,
            freq: 440 * Math.pow(2, (hit.midi - 69) / 12),
            s: hit.s,
            type: "sample",
            gain: 1,
            velocity: 1,
            color: null,
            trackId: hit.s
          });
        }
      }
    }
    return events;
  }
};
var state2 = null;
var starting = false;
async function renderDrumLoopBuffer() {
  const sampleRate = 44100;
  const durationSeconds = 2;
  const offline = new OfflineAudioContext(
    1,
    sampleRate * durationSeconds,
    sampleRate
  );
  const kickTimes = [0, 0.5, 1, 1.5];
  for (const t of kickTimes) {
    const osc = offline.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    const gain = offline.createGain();
    gain.gain.setValueAtTime(1e-3, t);
    gain.gain.linearRampToValueAtTime(0.9, t + 5e-3);
    gain.gain.exponentialRampToValueAtTime(1e-3, t + 0.15);
    osc.connect(gain).connect(offline.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }
  const snareTimes = [0.5, 1.5];
  for (const t of snareTimes) {
    const noiseBuf = offline.createBuffer(
      1,
      Math.floor(sampleRate * 0.12),
      sampleRate
    );
    const noiseData = noiseBuf.getChannelData(0);
    for (let i2 = 0; i2 < noiseData.length; i2++) {
      noiseData[i2] = Math.random() * 2 - 1;
    }
    const noise = offline.createBufferSource();
    noise.buffer = noiseBuf;
    const bp = offline.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2e3;
    bp.Q.value = 0.8;
    const noiseGain = offline.createGain();
    noiseGain.gain.setValueAtTime(1e-3, t);
    noiseGain.gain.linearRampToValueAtTime(0.5, t + 2e-3);
    noiseGain.gain.exponentialRampToValueAtTime(1e-3, t + 0.1);
    noise.connect(bp).connect(noiseGain).connect(offline.destination);
    noise.start(t);
    const tone = offline.createOscillator();
    tone.type = "triangle";
    tone.frequency.value = 200;
    const toneGain = offline.createGain();
    toneGain.gain.setValueAtTime(1e-3, t);
    toneGain.gain.linearRampToValueAtTime(0.25, t + 2e-3);
    toneGain.gain.exponentialRampToValueAtTime(1e-3, t + 0.08);
    tone.connect(toneGain).connect(offline.destination);
    tone.start(t);
    tone.stop(t + 0.1);
  }
  const closedHatTimes = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5];
  for (const t of closedHatTimes) {
    const noiseBuf = offline.createBuffer(
      1,
      Math.floor(sampleRate * 0.05),
      sampleRate
    );
    const noiseData = noiseBuf.getChannelData(0);
    for (let i2 = 0; i2 < noiseData.length; i2++) {
      noiseData[i2] = Math.random() * 2 - 1;
    }
    const noise = offline.createBufferSource();
    noise.buffer = noiseBuf;
    const hp = offline.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7e3;
    const g = offline.createGain();
    g.gain.setValueAtTime(1e-3, t);
    g.gain.linearRampToValueAtTime(0.15, t + 1e-3);
    g.gain.exponentialRampToValueAtTime(1e-3, t + 0.03);
    noise.connect(hp).connect(g).connect(offline.destination);
    noise.start(t);
  }
  const openHatTime = 1.75;
  {
    const noiseBuf = offline.createBuffer(
      1,
      Math.floor(sampleRate * 0.22),
      sampleRate
    );
    const noiseData = noiseBuf.getChannelData(0);
    for (let i2 = 0; i2 < noiseData.length; i2++) {
      noiseData[i2] = Math.random() * 2 - 1;
    }
    const noise = offline.createBufferSource();
    noise.buffer = noiseBuf;
    const hp = offline.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7e3;
    const g = offline.createGain();
    g.gain.setValueAtTime(1e-3, openHatTime);
    g.gain.linearRampToValueAtTime(0.18, openHatTime + 2e-3);
    g.gain.exponentialRampToValueAtTime(1e-3, openHatTime + 0.2);
    noise.connect(hp).connect(g).connect(offline.destination);
    noise.start(openHatTime);
  }
  return offline.startRendering();
}
async function startDrumPattern() {
  if (state2 || starting) return;
  starting = true;
  try {
    const ctx = new AudioContext();
    const buffer = await renderDrumLoopBuffer();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.4;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);
    source.start();
    const scheduler = new DrumPatternScheduler(ctx);
    const hapStream = new HapStream();
    state2 = { ctx, source, gain, analyser, scheduler, hapStream };
    const payload = {
      analyser,
      scheduler,
      hapStream,
      audio: { analyser, audioCtx: ctx }
    };
    workspaceAudioBus.publish(DRUM_PATTERN_SOURCE_ID, payload);
    notifyPlaybackStarted(DRUM_PATTERN_SOURCE_ID);
  } finally {
    starting = false;
  }
}
function stopDrumPattern() {
  if (!state2) return;
  try {
    state2.source.stop();
  } catch {
  }
  try {
    state2.source.disconnect();
    state2.gain.disconnect();
    state2.analyser.disconnect();
  } catch {
  }
  state2.hapStream.dispose();
  workspaceAudioBus.unpublish(DRUM_PATTERN_SOURCE_ID);
  try {
    void state2.ctx.close();
  } catch {
  }
  state2 = null;
  notifyPlaybackStopped(DRUM_PATTERN_SOURCE_ID);
}
function isDrumPatternPlaying() {
  return state2 !== null || starting;
}
registerPlaybackSource(
  DRUM_PATTERN_SOURCE_ID,
  stopDrumPattern,
  DRUM_PATTERN_LABEL
);

// src/workspace/chordProgression.ts
var CHORD_PROGRESSION_SOURCE_ID = "__example_chords__";
var CHORD_PROGRESSION_LABEL = "Example: chord progression (I-vi-IV-V)";
var CHORD_DURATION = 2;
var CYCLE_SECONDS = 8;
var CHORD_PROGRESSION = [
  { root: "C", notes: [60, 64, 67] },
  { root: "Am", notes: [57, 60, 64] },
  { root: "F", notes: [53, 57, 60] },
  { root: "G", notes: [55, 59, 62] }
];
var ChordProgressionScheduler = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  now() {
    return this.ctx.currentTime;
  }
  query(begin, end) {
    if (end <= begin) return [];
    const events = [];
    const firstCycle = Math.floor(begin / CYCLE_SECONDS);
    const lastCycle = Math.floor(end / CYCLE_SECONDS);
    for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
      const cycleStart = cycle * CYCLE_SECONDS;
      for (let i2 = 0; i2 < CHORD_PROGRESSION.length; i2++) {
        const chord2 = CHORD_PROGRESSION[i2];
        const chordBegin = cycleStart + i2 * CHORD_DURATION;
        const chordEnd = chordBegin + CHORD_DURATION;
        if (chordEnd <= begin || chordBegin >= end) continue;
        for (const midi of chord2.notes) {
          events.push({
            begin: chordBegin,
            end: chordEnd,
            endClipped: chordEnd,
            note: midi,
            freq: 440 * Math.pow(2, (midi - 69) / 12),
            s: `chord-${chord2.root}`,
            type: "synth",
            gain: 1,
            velocity: 1,
            color: null,
            trackId: `chord-${chord2.root}`
          });
        }
      }
    }
    return events;
  }
};
var state3 = null;
var starting2 = false;
async function renderChordLoopBuffer() {
  const sampleRate = 44100;
  const durationSeconds = 8;
  const offline = new OfflineAudioContext(
    1,
    sampleRate * durationSeconds,
    sampleRate
  );
  const chordDuration = 2;
  const attack = 0.02;
  const release = 0.05;
  const sustainLevel = 0.06;
  for (let i2 = 0; i2 < CHORD_PROGRESSION.length; i2++) {
    const chord2 = CHORD_PROGRESSION[i2];
    const chordStart = i2 * chordDuration;
    const chordEnd = chordStart + chordDuration;
    for (const midi of chord2.notes) {
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const osc = offline.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const g = offline.createGain();
      g.gain.setValueAtTime(1e-4, chordStart);
      g.gain.linearRampToValueAtTime(sustainLevel, chordStart + attack);
      g.gain.setValueAtTime(sustainLevel, chordEnd - release);
      g.gain.linearRampToValueAtTime(1e-4, chordEnd);
      osc.connect(g).connect(offline.destination);
      osc.start(chordStart);
      osc.stop(chordEnd + 0.01);
    }
  }
  return offline.startRendering();
}
async function startChordProgression() {
  if (state3 || starting2) return;
  starting2 = true;
  try {
    const ctx = new AudioContext();
    const buffer = await renderChordLoopBuffer();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);
    source.start();
    const scheduler = new ChordProgressionScheduler(ctx);
    const hapStream = new HapStream();
    state3 = { ctx, source, gain, analyser, scheduler, hapStream };
    const payload = {
      analyser,
      scheduler,
      hapStream,
      audio: { analyser, audioCtx: ctx }
    };
    workspaceAudioBus.publish(CHORD_PROGRESSION_SOURCE_ID, payload);
    notifyPlaybackStarted(CHORD_PROGRESSION_SOURCE_ID);
  } finally {
    starting2 = false;
  }
}
function stopChordProgression() {
  if (!state3) return;
  try {
    state3.source.stop();
  } catch {
  }
  try {
    state3.source.disconnect();
    state3.gain.disconnect();
    state3.analyser.disconnect();
  } catch {
  }
  state3.hapStream.dispose();
  workspaceAudioBus.unpublish(CHORD_PROGRESSION_SOURCE_ID);
  try {
    void state3.ctx.close();
  } catch {
  }
  state3 = null;
  notifyPlaybackStopped(CHORD_PROGRESSION_SOURCE_ID);
}
function isChordProgressionPlaying() {
  return state3 !== null || starting2;
}
registerPlaybackSource(
  CHORD_PROGRESSION_SOURCE_ID,
  stopChordProgression,
  CHORD_PROGRESSION_LABEL
);

// src/workspace/builtinExampleSources.ts
var BUILTIN_EXAMPLE_SOURCES = [
  {
    sourceId: SAMPLE_SOUND_SOURCE_ID,
    label: SAMPLE_SOUND_LABEL,
    startIfIdle: () => {
      if (!isSampleSoundPlaying()) startSampleSound();
    },
    stopIfRunning: () => {
      if (isSampleSoundPlaying()) stopSampleSound();
    }
  },
  {
    sourceId: DRUM_PATTERN_SOURCE_ID,
    label: DRUM_PATTERN_LABEL,
    startIfIdle: () => {
      if (!isDrumPatternPlaying()) startDrumPattern();
    },
    stopIfRunning: () => {
      if (isDrumPatternPlaying()) stopDrumPattern();
    }
  },
  {
    sourceId: CHORD_PROGRESSION_SOURCE_ID,
    label: CHORD_PROGRESSION_LABEL,
    startIfIdle: () => {
      if (!isChordProgressionPlaying()) startChordProgression();
    },
    stopIfRunning: () => {
      if (isChordProgressionPlaying()) stopChordProgression();
    }
  }
];
var BUILTIN_SOURCE_IDS = new Set(
  BUILTIN_EXAMPLE_SOURCES.map((s) => s.sourceId)
);
function findBuiltinExampleSource(sourceId) {
  return BUILTIN_EXAMPLE_SOURCES.find((s) => s.sourceId === sourceId);
}
var tabbarScrollStyleInjected = false;
function ensureTabbarScrollStyle() {
  if (tabbarScrollStyleInjected) return;
  if (typeof document === "undefined") return;
  const el = document.createElement("style");
  el.setAttribute("data-stave-style", "tabbar-scroll");
  el.textContent = "[data-workspace-group-tabbar]::-webkit-scrollbar{display:none;width:0;height:0}";
  document.head.appendChild(el);
  tabbarScrollStyleInjected = true;
}
function assertNever(value) {
  throw new Error(
    `WorkspaceShell: unhandled tab kind in dispatch: ${JSON.stringify(value)}`
  );
}
var __nextGroupSeq = 0;
function generateGroupId() {
  __nextGroupSeq += 1;
  return `group-${__nextGroupSeq}-${Math.random().toString(36).slice(2, 7)}`;
}
var DRAG_MIME = "application/workspace-tab";
function createInitialGroupState(initialTabs) {
  const id = generateGroupId();
  const group = {
    id,
    tabs: initialTabs,
    activeTabId: initialTabs.length > 0 ? initialTabs[0].id : null
  };
  const groups = /* @__PURE__ */ new Map();
  groups.set(id, group);
  return { groups, layout: [[id]], activeGroupId: id };
}
function tabFileName(tab) {
  const file = getFile(tab.fileId);
  if (!file) return tab.fileId;
  const parts2 = file.path.split("/");
  return parts2[parts2.length - 1];
}
var WorkspaceShell = React.forwardRef(function WorkspaceShell2({
  initialTabs = [],
  theme = "dark",
  height = "100%",
  onActiveTabChange,
  onTabClose,
  previewProviderFor,
  chromeForTab,
  editorExtrasForTab,
  onSaveFile,
  onTabContextMenu,
  onEditViz,
  onCropViz
}, forwardedRef) {
  const shellRootRef = React.useRef(null);
  const initialState = React.useRef(createInitialGroupState(initialTabs));
  const [groups, setGroups] = React.useState(
    () => initialState.current.groups
  );
  const [layout, setLayout] = React.useState(
    () => initialState.current.layout
  );
  const [activeGroupId, setActiveGroupId] = React.useState(
    () => initialState.current.activeGroupId
  );
  const [dragOverTarget, setDragOverTarget] = React.useState(null);
  const [dragOverEdge, setDragOverEdge] = React.useState(
    null
  );
  const [tabDragInProgress, setTabDragInProgress] = React.useState(false);
  const [pausedPreviews, setPausedPreviews] = React.useState(
    () => /* @__PURE__ */ new Set()
  );
  React.useEffect(() => {
    if (!shellRootRef.current) return;
    applyTheme(shellRootRef.current, theme);
  }, [theme]);
  React.useEffect(() => {
    ensureTabbarScrollStyle();
  }, []);
  const activeTab = React.useMemo(() => {
    const group = groups.get(activeGroupId);
    if (!group || group.activeTabId === null) return null;
    return group.tabs.find((t) => t.id === group.activeTabId) ?? null;
  }, [groups, activeGroupId]);
  const prevActiveTabRef = React.useRef(void 0);
  React.useEffect(() => {
    if (prevActiveTabRef.current !== activeTab) {
      prevActiveTabRef.current = activeTab;
      onActiveTabChange?.(activeTab);
    }
  }, [activeTab, onActiveTabChange]);
  const updateGroup = React.useCallback(
    (groupId, patch) => {
      setGroups((prev) => {
        const existing = prev.get(groupId);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(groupId, patch(existing));
        return next;
      });
    },
    []
  );
  const handleTabClick = React.useCallback(
    (groupId, tabId) => {
      updateGroup(groupId, (g) => ({ ...g, activeTabId: tabId }));
      setActiveGroupId(groupId);
    },
    [updateGroup]
  );
  const handleTabClose = React.useCallback(
    (groupId, tabId) => {
      let closedTab = null;
      const existing = groups.get(groupId);
      const wasLastTab = existing !== void 0 && existing.tabs.length === 1;
      const canCollapseGroup = wasLastTab && groups.size > 1;
      setGroups((prev) => {
        const cur = prev.get(groupId);
        if (!cur) return prev;
        const idx = cur.tabs.findIndex((t) => t.id === tabId);
        if (idx === -1) return prev;
        closedTab = cur.tabs[idx];
        const nextTabs = cur.tabs.filter((t) => t.id !== tabId);
        let nextActive = cur.activeTabId;
        if (cur.activeTabId === tabId) {
          if (nextTabs.length === 0) {
            nextActive = null;
          } else if (idx < nextTabs.length) {
            nextActive = nextTabs[idx].id;
          } else {
            nextActive = nextTabs[nextTabs.length - 1].id;
          }
        }
        const next = new Map(prev);
        if (canCollapseGroup) {
          next.delete(groupId);
        } else {
          next.set(groupId, {
            ...cur,
            tabs: nextTabs,
            activeTabId: nextActive
          });
        }
        return next;
      });
      if (canCollapseGroup) {
        setLayout((prev) => removeGroup(prev, groupId));
        setActiveGroupId((prev) => {
          if (prev !== groupId) return prev;
          const remaining = allGroupIds(removeGroup(layout, groupId));
          return remaining[0] ?? prev;
        });
      }
      if (closedTab) {
        const maybePreview = closedTab;
        if (maybePreview.kind === "preview") {
          const fileId = maybePreview.fileId;
          setPausedPreviews((prev) => {
            if (!prev.has(fileId)) return prev;
            const next = new Set(prev);
            next.delete(fileId);
            return next;
          });
          if (maybePreview.sourceRef.kind === "file") {
            const builtin = findBuiltinExampleSource(
              maybePreview.sourceRef.fileId
            );
            if (builtin) builtin.stopIfRunning();
          }
        }
        onTabClose?.(closedTab);
      }
    },
    [groups, layout, onTabClose]
  );
  const handleSplit = React.useCallback(
    (groupId, direction = "east") => {
      const newId = generateGroupId();
      setGroups((prev) => {
        const next = new Map(prev);
        next.set(newId, { id: newId, tabs: [], activeTabId: null });
        return next;
      });
      setLayout((prev) => insertGroup(prev, groupId, direction, newId));
    },
    []
  );
  const findNeighborGroupId = React.useCallback(
    (closingId) => {
      for (const id of allGroupIds(layout)) {
        if (id !== closingId) return id;
      }
      return null;
    },
    [layout]
  );
  const handleCloseGroup = React.useCallback(
    (groupId) => {
      const neighborId = findNeighborGroupId(groupId);
      if (!neighborId) return;
      setGroups((prev) => {
        const closing = prev.get(groupId);
        const neighbor = prev.get(neighborId);
        if (!closing || !neighbor) return prev;
        closing.tabs;
        const mergedTabs = [...neighbor.tabs, ...closing.tabs];
        const mergedActive = neighbor.activeTabId ?? (mergedTabs.length > 0 ? mergedTabs[0].id : null);
        const next = new Map(prev);
        next.delete(groupId);
        next.set(neighborId, {
          ...neighbor,
          tabs: mergedTabs,
          activeTabId: mergedActive
        });
        return next;
      });
      setLayout((prev) => removeGroup(prev, groupId));
      if (activeGroupId === groupId) {
        setActiveGroupId(neighborId);
      }
    },
    [findNeighborGroupId, activeGroupId]
  );
  const splitGroupWithTab = React.useCallback(
    (originGroupId, _direction, newTab) => {
      const newId = generateGroupId();
      setGroups((prev) => {
        const next = new Map(prev);
        next.set(newId, {
          id: newId,
          tabs: [newTab],
          activeTabId: newTab.id
        });
        return next;
      });
      setLayout((prev) => insertGroup(prev, originGroupId, "east", newId));
    },
    []
  );
  const moveTabToNewQuadrant = React.useCallback(
    (sourceGroupId, tabId, targetGroupId, direction) => {
      const source = groups.get(sourceGroupId);
      if (!source) return;
      const movingTab = source.tabs.find((t) => t.id === tabId);
      if (!movingTab) return;
      if (!findGroupCoords(layout, targetGroupId)) return;
      if (sourceGroupId === targetGroupId && source.tabs.length === 1) {
        return;
      }
      const sourceWillCollapse = source.tabs.length === 1;
      const newId = generateGroupId();
      setGroups((prev) => {
        const next = new Map(prev);
        const srcTabs = source.tabs.filter((t) => t.id !== tabId);
        const srcActive = source.activeTabId === tabId ? srcTabs[0]?.id ?? null : source.activeTabId;
        if (srcTabs.length === 0) {
          next.delete(sourceGroupId);
        } else {
          next.set(sourceGroupId, {
            ...source,
            tabs: srcTabs,
            activeTabId: srcActive
          });
        }
        next.set(newId, {
          id: newId,
          tabs: [movingTab],
          activeTabId: movingTab.id
        });
        return next;
      });
      setLayout((prev) => {
        const afterRemove = sourceWillCollapse && sourceGroupId !== targetGroupId ? removeGroup(prev, sourceGroupId) : prev;
        return insertGroup(afterRemove, targetGroupId, direction, newId);
      });
      setActiveGroupId(newId);
    },
    [groups, layout]
  );
  const moveTabToNewEdgeGroup = React.useCallback(
    (sourceGroupId, tabId, position) => {
      const source = groups.get(sourceGroupId);
      if (!source) return;
      const movingTab = source.tabs.find((t) => t.id === tabId);
      if (!movingTab) return;
      const newId = generateGroupId();
      setGroups((prev) => {
        const next = new Map(prev);
        const srcTabs = source.tabs.filter((t) => t.id !== tabId);
        const srcActive = source.activeTabId === tabId ? srcTabs[0]?.id ?? null : source.activeTabId;
        if (srcTabs.length === 0) {
          next.delete(sourceGroupId);
        } else {
          next.set(sourceGroupId, {
            ...source,
            tabs: srcTabs,
            activeTabId: srcActive
          });
        }
        next.set(newId, {
          id: newId,
          tabs: [movingTab],
          activeTabId: movingTab.id
        });
        return next;
      });
      setLayout((prev) => {
        const afterRemove = source.tabs.length === 1 ? removeGroup(prev, sourceGroupId) : prev;
        return insertEdgeGroup(afterRemove, position, newId);
      });
      setActiveGroupId(newId);
    },
    [groups]
  );
  const updateGroupBackground = React.useCallback(
    (groupId, backgroundTabId) => {
      updateGroup(groupId, (g) => ({
        ...g,
        backgroundTabId: backgroundTabId ?? void 0
      }));
    },
    [updateGroup]
  );
  const closeTabById = React.useCallback(
    (tabId) => {
      let ownerGroupId = null;
      for (const [gid, g] of groups.entries()) {
        if (g.tabs.some((t) => t.id === tabId)) {
          ownerGroupId = gid;
          break;
        }
      }
      if (!ownerGroupId) return;
      handleTabClose(ownerGroupId, tabId);
      const owner = groups.get(ownerGroupId);
      const wasLastTab = owner ? owner.tabs.length === 1 : false;
      const willCollapse = wasLastTab && groups.size > 1;
      if (willCollapse) {
        setGroups((prev) => {
          if (prev.size <= 1) return prev;
          const next = new Map(prev);
          next.delete(ownerGroupId);
          return next;
        });
        setLayout((prev) => removeGroup(prev, ownerGroupId));
        setActiveGroupId((prev) => {
          if (prev !== ownerGroupId) return prev;
          const remaining = allGroupIds(
            removeGroup(layout, ownerGroupId)
          );
          return remaining[0] ?? prev;
        });
      }
    },
    [groups, layout, handleTabClose]
  );
  const findTabByFileId = React.useCallback(
    (fileId, kind) => {
      for (const [gid, g] of groups.entries()) {
        for (const t of g.tabs) {
          if (t.kind === kind && t.fileId === fileId) {
            return { groupId: gid, tabId: t.id };
          }
        }
      }
      return null;
    },
    [groups]
  );
  const findGroupWithAnyPreview = React.useCallback(() => {
    for (const [gid, g] of groups.entries()) {
      if (g.tabs.some((t) => t.kind === "preview")) return gid;
    }
    return null;
  }, [groups]);
  const shellActionsRef = React.useRef(null);
  const shellActions = React.useMemo(
    () => ({
      addTab: (groupId, tab) => {
        updateGroup(groupId, (g) => ({
          ...g,
          tabs: [...g.tabs, tab],
          activeTabId: tab.id
        }));
      },
      splitGroupWithTab,
      updateGroupBackground,
      closeTab: closeTabById,
      findTabByFileId
    }),
    [splitGroupWithTab, updateGroupBackground, updateGroup, closeTabById, findTabByFileId]
  );
  shellActionsRef.current = shellActions;
  const getActiveTab = React.useCallback(() => activeTab, [activeTab]);
  const getActiveGroupId = React.useCallback(() => activeGroupId, [activeGroupId]);
  const getActiveGroup = React.useCallback(() => {
    return groups.get(activeGroupId) ?? null;
  }, [groups, activeGroupId]);
  const getPreviewProviderForCommand = React.useCallback(
    (language) => {
      const fromRegistry = getPreviewProviderForLanguage(language);
      if (fromRegistry) return fromRegistry;
      if (previewProviderFor) {
        const currentTab = activeTab;
        const fileId = currentTab?.fileId ?? "";
        return previewProviderFor({
          kind: "preview",
          id: "__cmd-lookup__",
          fileId,
          sourceRef: { kind: "default" }
        });
      }
      return void 0;
    },
    [previewProviderFor, activeTab]
  );
  useKeyboardCommands({
    getActiveTab,
    getActiveGroupId,
    getActiveGroup,
    shellActions,
    getPreviewProvider: getPreviewProviderForCommand
  });
  const handleEdgeDrop = React.useCallback(
    (e, position) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverEdge(null);
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      moveTabToNewEdgeGroup(payload.sourceGroupId, payload.tabId, position);
    },
    [moveTabToNewEdgeGroup]
  );
  const handleEdgeDragOver = React.useCallback(
    (e, position) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragOverEdge !== position) setDragOverEdge(position);
    },
    [dragOverEdge]
  );
  const handleEdgeDragLeave = React.useCallback(() => {
    setDragOverEdge(null);
  }, []);
  const onSaveFileRef = React.useRef(onSaveFile);
  onSaveFileRef.current = onSaveFile;
  React.useEffect(() => {
    const handler = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== "s" && e.key !== "S") return;
      const current = onSaveFileRef.current;
      if (!current) return;
      const tab = activeTab;
      if (!tab || tab.kind !== "editor") return;
      e.preventDefault();
      current(tab);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTab]);
  const handleTabDragStart = React.useCallback(
    (e, groupId, tab) => {
      const payload = { sourceGroupId: groupId, tabId: tab.id };
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "move";
      setTabDragInProgress(true);
    },
    []
  );
  React.useEffect(() => {
    const onDragEnd = () => {
      setTabDragInProgress(false);
      setDragOverEdge(null);
      setDragOverTarget(null);
    };
    window.addEventListener("dragend", onDragEnd);
    window.addEventListener("drop", onDragEnd);
    return () => {
      window.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("drop", onDragEnd);
    };
  }, []);
  const computeQuadrant = React.useCallback(
    (e, el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return "center";
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      if (Number.isNaN(x) || Number.isNaN(y)) return "center";
      if (x >= 0.3 && x <= 0.7 && y >= 0.3 && y <= 0.7) {
        return "center";
      }
      const distWest = x;
      const distEast = 1 - x;
      const distNorth = y;
      const distSouth = 1 - y;
      const min = Math.min(distWest, distEast, distNorth, distSouth);
      if (min === distWest) return "west";
      if (min === distEast) return "east";
      if (min === distNorth) return "north";
      return "south";
    },
    []
  );
  const handleDropOnGroup = React.useCallback(
    (e, targetGroupId) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverTarget(null);
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      const { sourceGroupId, tabId } = payload;
      const direction = computeQuadrant(e, e.currentTarget);
      if (sourceGroupId === targetGroupId && direction === "center") {
        setGroups((prev) => {
          const g = prev.get(targetGroupId);
          if (!g) return prev;
          const tab = g.tabs.find((t) => t.id === tabId);
          if (!tab) return prev;
          const next = new Map(prev);
          next.set(targetGroupId, { ...g, activeTabId: tabId });
          return next;
        });
        setActiveGroupId(targetGroupId);
        return;
      }
      if (direction === "center") {
        setGroups((prev) => {
          const source = prev.get(sourceGroupId);
          const target = prev.get(targetGroupId);
          if (!source || !target) return prev;
          const movingTab = source.tabs.find((t) => t.id === tabId);
          if (!movingTab) return prev;
          const sourceTabs = source.tabs.filter((t) => t.id !== tabId);
          let sourceActive = source.activeTabId;
          if (source.activeTabId === tabId) {
            sourceActive = sourceTabs.length > 0 ? sourceTabs[0].id : null;
          }
          const next = new Map(prev);
          if (sourceTabs.length === 0 && prev.size > 1) {
            next.delete(sourceGroupId);
          } else {
            next.set(sourceGroupId, {
              ...source,
              tabs: sourceTabs,
              activeTabId: sourceActive
            });
          }
          next.set(targetGroupId, {
            ...target,
            tabs: [...target.tabs, movingTab],
            activeTabId: tabId
          });
          return next;
        });
        setLayout((prev) => {
          const source = groups.get(sourceGroupId);
          if (!source || source.tabs.length !== 1) return prev;
          return removeGroup(prev, sourceGroupId);
        });
        setActiveGroupId(targetGroupId);
        return;
      }
      moveTabToNewQuadrant(sourceGroupId, tabId, targetGroupId, direction);
    },
    [computeQuadrant, groups, moveTabToNewQuadrant]
  );
  const renderTabContent = React.useCallback(
    (tab, groupId, isActive) => {
      switch (tab.kind) {
        case "editor": {
          let chromeSlot = chromeForTab?.(tab) ?? void 0;
          if (!chromeSlot && previewProviderFor) {
            const previewTab = { ...tab, kind: "preview", sourceRef: { kind: "default" } };
            const provider = previewProviderFor(previewTab);
            if (provider?.renderEditorChrome) {
              const file = getFile(tab.fileId);
              if (file) {
                const existingPreview = findTabByFileId(tab.fileId, "preview");
                chromeSlot = provider.renderEditorChrome({
                  file,
                  previewOpen: existingPreview !== null,
                  previewPaused: pausedPreviews.has(tab.fileId),
                  onTogglePausePreview: () => {
                    const wasPaused = pausedPreviews.has(tab.fileId);
                    setPausedPreviews((prev) => {
                      const next = new Set(prev);
                      if (next.has(tab.fileId)) next.delete(tab.fileId);
                      else next.add(tab.fileId);
                      return next;
                    });
                    const previewTabLoc = shellActionsRef.current.findTabByFileId(
                      tab.fileId,
                      "preview"
                    );
                    if (previewTabLoc) {
                      const previewTabObj = groups.get(previewTabLoc.groupId)?.tabs.find((t) => t.id === previewTabLoc.tabId);
                      if (previewTabObj && previewTabObj.kind === "preview" && previewTabObj.sourceRef.kind === "file") {
                        const builtin = findBuiltinExampleSource(
                          previewTabObj.sourceRef.fileId
                        );
                        if (builtin) {
                          if (wasPaused) {
                            builtin.startIfIdle();
                          } else {
                            builtin.stopIfRunning();
                          }
                        }
                      }
                    }
                  },
                  onChangePreviewSource: (nextRef) => {
                    const current = shellActionsRef.current.findTabByFileId(
                      tab.fileId,
                      "preview"
                    );
                    if (!current) return;
                    updateGroup(current.groupId, (g) => ({
                      ...g,
                      tabs: g.tabs.map(
                        (t) => t.id === current.tabId && t.kind === "preview" ? { ...t, sourceRef: nextRef } : t
                      )
                    }));
                  },
                  onOpenPreview: (selectedSourceRef) => {
                    const current = shellActionsRef.current.findTabByFileId(
                      tab.fileId,
                      "preview"
                    );
                    if (current) {
                      return;
                    }
                    const sourceRef = selectedSourceRef ?? { kind: "default" };
                    const existingPreviewGroup = findGroupWithAnyPreview();
                    if (existingPreviewGroup) {
                      const newTab2 = {
                        kind: "preview",
                        id: `preview-${tab.fileId}-${Date.now()}`,
                        fileId: tab.fileId,
                        sourceRef
                      };
                      shellActionsRef.current.addTab(
                        existingPreviewGroup,
                        newTab2
                      );
                      return;
                    }
                    const newTab = {
                      kind: "preview",
                      id: `preview-${tab.fileId}-${Date.now()}`,
                      fileId: tab.fileId,
                      sourceRef
                    };
                    shellActionsRef.current.splitGroupWithTab(
                      groupId,
                      "right",
                      newTab
                    );
                  },
                  onToggleBackground: () => {
                    executeCommand("workspace.toggleBackgroundPreview", {
                      activeTab: tab,
                      activeGroupId: groupId,
                      activeGroup: groups.get(groupId) ?? null,
                      shell: shellActionsRef.current,
                      getPreviewProvider: (lang) => {
                        const pTab = { kind: "preview", id: "", fileId: "", sourceRef: { kind: "default" } };
                        return previewProviderFor?.({ ...pTab, fileId: tab.fileId }) ?? void 0;
                      }
                    });
                  },
                  onSave: () => {
                    onSaveFileRef.current?.(tab);
                  }
                  // hotReload / onToggleHotReload are optional on the
                  // PreviewEditorChromeContext interface. Phase 10.2 ships
                  // a provider-level reload policy (always-on for viz);
                  // per-tab toggle is a follow-up phase.
                });
              }
            }
          }
          const extras = editorExtrasForTab?.(tab);
          return /* @__PURE__ */ jsxRuntime.jsx(
            EditorView,
            {
              fileId: tab.fileId,
              chromeSlot,
              theme,
              onPlay: extras?.onPlay,
              onStop: extras?.onStop,
              error: extras?.error,
              onEditViz,
              onCropViz
            },
            tab.id
          );
        }
        case "preview": {
          const provider = previewProviderFor?.(tab);
          if (!provider) {
            return /* @__PURE__ */ jsxRuntime.jsx(
              "div",
              {
                "data-testid": `preview-no-provider-${tab.id}`,
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--foreground-muted)",
                  fontSize: 12
                },
                children: "No preview provider registered for this file type."
              }
            );
          }
          return /* @__PURE__ */ jsxRuntime.jsx(
            PreviewView,
            {
              fileId: tab.fileId,
              provider,
              sourceRef: tab.sourceRef,
              theme,
              hidden: false,
              paused: pausedPreviews.has(tab.fileId),
              onSourceRefChange: (nextRef) => {
                updateGroup(groupId, (g) => ({
                  ...g,
                  tabs: g.tabs.map(
                    (t) => t.id === tab.id && t.kind === "preview" ? { ...t, sourceRef: nextRef } : t
                  )
                }));
              }
            },
            tab.id
          );
        }
        default:
          return assertNever(tab);
      }
    },
    // Issue #2 fix: `groups` and `findTabByFileId` must be in the dep
    // array so `previewOpen` stays fresh after a preview tab is added.
    // Without them, renderTabContent holds a stale closure over the
    // old groups map, findTabByFileId always returns null, and the
    // chrome's Play button never flips to Stop. editorExtrasForTab and
    // findGroupWithAnyPreview are also added because they were silently
    // missing before.
    //
    // `pausedPreviews` must ALSO be a dep — without it, a second-click
    // Stop → Play transition can't refresh the chrome. The first click
    // (Preview → Stop) happens to work because `groups` changes (a
    // preview tab is added), invalidating the callback. The second
    // click only changes `pausedPreviews`, and without this dep the
    // callback returns a cached function that reads a stale
    // `pausedPreviews.has(fileId) === false` via its closure. The
    // regression test in WorkspaceShell.test.tsx covers this exact
    // path and fails without `pausedPreviews` in the deps.
    [
      chromeForTab,
      previewProviderFor,
      theme,
      updateGroup,
      groups,
      pausedPreviews,
      findTabByFileId,
      findGroupWithAnyPreview,
      editorExtrasForTab
    ]
  );
  const renderGroup = React.useCallback(
    (group) => {
      const activeTabObj = group.tabs.find((t) => t.id === group.activeTabId);
      const isShellActiveGroup = activeGroupId === group.id;
      const canClose = groups.size > 1;
      const isDragOver = dragOverTarget?.groupId === group.id;
      return /* @__PURE__ */ jsxRuntime.jsxs(
        "div",
        {
          "data-workspace-group": group.id,
          "data-active-group": isShellActiveGroup ? "true" : "false",
          onDragOver: (e) => {
            if (e.dataTransfer.types.includes(DRAG_MIME)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const direction = computeQuadrant(e, e.currentTarget);
              if (dragOverTarget?.groupId !== group.id || dragOverTarget.direction !== direction) {
                setDragOverTarget({ groupId: group.id, direction });
              }
            }
          },
          onDragLeave: (e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setDragOverTarget(
                (t) => t?.groupId === group.id ? null : t
              );
            }
          },
          onDrop: (e) => handleDropOnGroup(e, group.id),
          onMouseDown: () => {
            if (activeGroupId !== group.id) {
              setActiveGroupId(group.id);
            }
          },
          style: {
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%",
            background: "var(--background)",
            outline: isDragOver ? "2px solid var(--accent, #75baff)" : "none",
            outlineOffset: -2
          },
          children: [
            /* @__PURE__ */ jsxRuntime.jsxs(
              "div",
              {
                "data-workspace-group-tabbar": group.id,
                style: {
                  display: "flex",
                  alignItems: "center",
                  background: "var(--surface)",
                  borderBottom: "1px solid var(--border)",
                  height: 30,
                  flexShrink: 0,
                  overflowX: "auto",
                  overflowY: "hidden",
                  // Hide the scrollbar visually (Firefox + legacy IE).
                  // Webkit uses the injected CSS rule in tabbarScrollStyle below.
                  scrollbarWidth: "none",
                  msOverflowStyle: "none"
                },
                children: [
                  group.tabs.map((tab) => {
                    const isActive = tab.id === group.activeTabId;
                    const isPreview = tab.kind === "editor" && tab.preview === true;
                    return /* @__PURE__ */ jsxRuntime.jsxs(
                      "div",
                      {
                        "data-workspace-tab": tab.id,
                        "data-tab-kind": tab.kind,
                        "data-tab-active": isActive ? "true" : "false",
                        "data-tab-preview": isPreview ? "true" : "false",
                        draggable: true,
                        onDragStart: (e) => handleTabDragStart(e, group.id, tab),
                        onClick: () => handleTabClick(group.id, tab.id),
                        onContextMenu: (e) => {
                          if (!onTabContextMenu) return;
                          e.preventDefault();
                          e.stopPropagation();
                          onTabContextMenu(tab, e.clientX, e.clientY);
                        },
                        onDoubleClick: () => {
                          if (isPreview) {
                            setGroups((prev) => {
                              const g = prev.get(group.id);
                              if (!g) return prev;
                              const nextTabs = g.tabs.map(
                                (t) => t.id === tab.id && t.kind === "editor" ? { ...t, preview: false } : t
                              );
                              const nx = new Map(prev);
                              nx.set(group.id, { ...g, tabs: nextTabs });
                              return nx;
                            });
                          }
                        },
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                          padding: "0 8px",
                          height: "100%",
                          cursor: "grab",
                          background: isActive ? "var(--background)" : "transparent",
                          borderRight: "1px solid var(--border)",
                          color: isActive ? "var(--foreground)" : "var(--foreground-muted)",
                          fontSize: 11,
                          fontStyle: isPreview ? "italic" : "normal",
                          whiteSpace: "nowrap",
                          userSelect: "none"
                        },
                        children: [
                          /* @__PURE__ */ jsxRuntime.jsx("span", { style: { fontSize: 9, opacity: 0.5 }, children: tab.kind === "editor" ? "\u25A1" : "\u25CE" }),
                          /* @__PURE__ */ jsxRuntime.jsx("span", { children: tabFileName(tab) }),
                          /* @__PURE__ */ jsxRuntime.jsx(
                            "button",
                            {
                              "data-testid": `tab-close-${tab.id}`,
                              onClick: (e) => {
                                e.stopPropagation();
                                handleTabClose(group.id, tab.id);
                              },
                              style: closeBtnStyle,
                              children: "\xD7"
                            }
                          )
                        ]
                      },
                      tab.id
                    );
                  }),
                  /* @__PURE__ */ jsxRuntime.jsx("div", { style: { flex: 1 } }),
                  /* @__PURE__ */ jsxRuntime.jsxs(
                    "div",
                    {
                      style: {
                        display: "flex",
                        gap: 1,
                        padding: "0 4px",
                        flexShrink: 0
                      },
                      children: [
                        /* @__PURE__ */ jsxRuntime.jsx(
                          "button",
                          {
                            "data-testid": `group-split-${group.id}`,
                            onClick: () => handleSplit(group.id, "east"),
                            title: "Split right (\u2318\\\\)",
                            style: actionBtnStyle,
                            children: "\u2502"
                          }
                        ),
                        /* @__PURE__ */ jsxRuntime.jsx(
                          "button",
                          {
                            "data-testid": `group-split-down-${group.id}`,
                            onClick: () => handleSplit(group.id, "south"),
                            title: "Split down (\u2318\u21E7\\\\)",
                            style: actionBtnStyle,
                            children: "\u2500"
                          }
                        ),
                        canClose && /* @__PURE__ */ jsxRuntime.jsx(
                          "button",
                          {
                            "data-testid": `group-close-${group.id}`,
                            onClick: () => handleCloseGroup(group.id),
                            title: "Close group",
                            style: actionBtnStyle,
                            children: "\xD7"
                          }
                        )
                      ]
                    }
                  )
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsxs(
              "div",
              {
                "data-workspace-group-content": group.id,
                style: { flex: 1, minHeight: 0, position: "relative" },
                children: [
                  group.backgroundTabId && activeTabObj?.kind === "editor" && (() => {
                    const bgProvider = previewProviderFor?.({
                      kind: "preview",
                      id: group.backgroundTabId,
                      fileId: activeTabObj.fileId,
                      sourceRef: { kind: "default" }
                    });
                    if (!bgProvider) return null;
                    return /* @__PURE__ */ jsxRuntime.jsx(
                      "div",
                      {
                        "data-workspace-background": group.id,
                        style: {
                          position: "absolute",
                          inset: 0,
                          zIndex: 0,
                          opacity: 0.4,
                          pointerEvents: "none"
                        },
                        children: /* @__PURE__ */ jsxRuntime.jsx(
                          PreviewView,
                          {
                            fileId: activeTabObj.fileId,
                            provider: bgProvider,
                            sourceRef: { kind: "default" },
                            theme,
                            hidden: false,
                            onSourceRefChange: () => {
                            }
                          }
                        )
                      }
                    );
                  })(),
                  activeTabObj ? /* @__PURE__ */ jsxRuntime.jsx("div", { style: { position: "relative", zIndex: 1, height: "100%" }, children: renderTabContent(activeTabObj, group.id, isShellActiveGroup) }) : /* @__PURE__ */ jsxRuntime.jsx(
                    "div",
                    {
                      "data-testid": `group-empty-${group.id}`,
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        color: "var(--foreground-muted)",
                        fontSize: 12
                      },
                      children: "Drop a tab here"
                    }
                  )
                ]
              }
            )
          ]
        }
      );
    },
    [
      activeGroupId,
      groups,
      dragOverTarget,
      computeQuadrant,
      handleDropOnGroup,
      handleTabClick,
      handleTabClose,
      handleTabDragStart,
      handleSplit,
      handleCloseGroup,
      renderTabContent
    ]
  );
  const totalGroupCount = React.useMemo(
    () => allGroupIds(layout).length,
    [layout]
  );
  const previewTabIds = React.useMemo(() => {
    const out2 = [];
    for (const g of groups.values()) {
      for (const t of g.tabs) {
        if (t.kind === "editor" && t.preview === true) {
          out2.push({ tabId: t.id, fileId: t.fileId });
        }
      }
    }
    return out2;
  }, [groups]);
  React.useEffect(() => {
    const unsubs = previewTabIds.map(
      ({ tabId, fileId }) => subscribe(fileId, () => {
        setGroups((prev) => {
          let changed = false;
          const next = new Map(prev);
          for (const [gid, g] of prev) {
            const nextTabs = g.tabs.map((t) => {
              if (t.id !== tabId) return t;
              if (t.kind !== "editor" || !t.preview) return t;
              changed = true;
              return { ...t, preview: false };
            });
            if (changed) next.set(gid, { ...g, tabs: nextTabs });
          }
          return changed ? next : prev;
        });
      })
    );
    return () => {
      for (const u of unsubs) u();
    };
  }, [previewTabIds]);
  React.useImperativeHandle(
    forwardedRef,
    () => ({
      openOrFocusFile: (fileId, options) => {
        const preview = options?.preview === true;
        let foundGroupId = null;
        let foundTabId = null;
        for (const [gid, group] of groups) {
          const hit = group.tabs.find(
            (t) => t.kind === "editor" && t.fileId === fileId
          );
          if (hit) {
            foundGroupId = gid;
            foundTabId = hit.id;
            break;
          }
        }
        if (foundGroupId && foundTabId) {
          const targetGid = foundGroupId;
          const targetTid = foundTabId;
          setGroups((prev) => {
            const existing = prev.get(targetGid);
            if (!existing) return prev;
            const next = new Map(prev);
            const nextTabs = existing.tabs.map((t) => {
              if (t.id !== targetTid) return t;
              if (t.kind !== "editor") return t;
              if (!preview && t.preview) return { ...t, preview: false };
              return t;
            });
            next.set(targetGid, {
              ...existing,
              tabs: nextTabs,
              activeTabId: targetTid
            });
            return next;
          });
          setActiveGroupId(targetGid);
          return;
        }
        if (preview) {
          const existing = groups.get(activeGroupId);
          const slot = existing?.tabs.find(
            (t) => t.kind === "editor" && t.preview === true
          );
          if (existing && slot) {
            const slotId = slot.id;
            setGroups((prev) => {
              const g = prev.get(activeGroupId);
              if (!g) return prev;
              const nextTabs = g.tabs.map(
                (t) => t.id === slotId && t.kind === "editor" ? { ...t, fileId, preview: true } : t
              );
              const nx = new Map(prev);
              nx.set(activeGroupId, { ...g, tabs: nextTabs, activeTabId: slotId });
              return nx;
            });
            return;
          }
        }
        const newTab = {
          kind: "editor",
          id: `tab-${fileId}-${Date.now()}`,
          fileId,
          ...preview ? { preview: true } : {}
        };
        setGroups((prev) => {
          const existing = prev.get(activeGroupId);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(activeGroupId, {
            ...existing,
            tabs: [...existing.tabs, newTab],
            activeTabId: newTab.id
          });
          return next;
        });
      },
      promoteTab: (tabId) => {
        setGroups((prev) => {
          let changed = false;
          const next = /* @__PURE__ */ new Map();
          for (const [gid, g] of prev) {
            const nextTabs = g.tabs.map((t) => {
              if (t.id !== tabId) return t;
              if (t.kind !== "editor" || !t.preview) return t;
              changed = true;
              return { ...t, preview: false };
            });
            next.set(gid, changed ? { ...g, tabs: nextTabs } : g);
          }
          return changed ? next : prev;
        });
      },
      closeTabsForFile: (fileId) => {
        const targets = [];
        for (const g of groups.values()) {
          for (const t of g.tabs) {
            if ((t.kind === "editor" || t.kind === "preview") && t.fileId === fileId) {
              targets.push(t.id);
            }
          }
        }
        for (const tid of targets) closeTabById(tid);
      },
      closeOtherTabs: (tabId) => {
        let ownerGroup = null;
        for (const g of groups.values()) {
          if (g.tabs.some((t) => t.id === tabId)) {
            ownerGroup = g;
            break;
          }
        }
        if (!ownerGroup) return;
        const victims = ownerGroup.tabs.filter((t) => t.id !== tabId).map((t) => t.id);
        for (const tid of victims) closeTabById(tid);
      },
      closeAllTabsInGroup: (tabId) => {
        let ownerGroup = null;
        for (const g of groups.values()) {
          if (g.tabs.some((t) => t.id === tabId)) {
            ownerGroup = g;
            break;
          }
        }
        if (!ownerGroup) return;
        const victims = ownerGroup.tabs.map((t) => t.id);
        for (const tid of victims) closeTabById(tid);
      },
      splitActiveGroup: (direction = "east") => {
        if (!activeGroupId) return;
        handleSplit(activeGroupId, direction);
      }
    }),
    [groups, activeGroupId, closeTabById, handleSplit]
  );
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      ref: shellRootRef,
      "data-workspace-shell": "root",
      style: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height,
        background: "var(--background)",
        color: "var(--foreground)",
        position: "relative"
      },
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            "data-workspace-edge-drop": "start",
            onDragOver: (e) => handleEdgeDragOver(e, "start"),
            onDragLeave: handleEdgeDragLeave,
            onDrop: (e) => handleEdgeDrop(e, "start"),
            style: {
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 24,
              zIndex: 10,
              pointerEvents: tabDragInProgress ? "auto" : "none",
              background: dragOverEdge === "start" ? "rgba(139,92,246,0.18)" : "transparent",
              borderLeft: dragOverEdge === "start" ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "background 80ms ease, border-color 80ms ease"
            }
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            "data-workspace-edge-drop": "end",
            onDragOver: (e) => handleEdgeDragOver(e, "end"),
            onDragLeave: handleEdgeDragLeave,
            onDrop: (e) => handleEdgeDrop(e, "end"),
            style: {
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 24,
              zIndex: 10,
              pointerEvents: tabDragInProgress ? "auto" : "none",
              background: dragOverEdge === "end" ? "rgba(139,92,246,0.18)" : "transparent",
              borderRight: dragOverEdge === "end" ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "background 80ms ease, border-color 80ms ease"
            }
          }
        ),
        totalGroupCount === 0 ? /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            "data-testid": "workspace-shell-empty",
            style: {
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--foreground-muted)",
              fontSize: 12
            },
            children: "Drop a tab here"
          }
        ) : layout.length === 1 && layout[0].length === 1 ? (() => {
          const g = groups.get(layout[0][0]);
          return g ? renderGroup(g) : null;
        })() : /* @__PURE__ */ jsxRuntime.jsx(SplitPane, { direction: "horizontal", children: layout.map((column, colIdx) => {
          if (column.length === 1) {
            const g = groups.get(column[0]);
            return /* @__PURE__ */ jsxRuntime.jsx(React__default.default.Fragment, { children: g ? renderGroup(g) : null }, `col-${colIdx}-${column[0]}`);
          }
          return /* @__PURE__ */ jsxRuntime.jsx(
            SplitPane,
            {
              direction: "vertical",
              children: column.map((gid) => {
                const g = groups.get(gid);
                return /* @__PURE__ */ jsxRuntime.jsx(React__default.default.Fragment, { children: g ? renderGroup(g) : null }, gid);
              })
            },
            `col-${colIdx}-${column.join("+")}`
          );
        }) }),
        tabDragInProgress && dragOverTarget && /* @__PURE__ */ jsxRuntime.jsx(
          QuadrantGuideOverlay,
          {
            target: dragOverTarget,
            shellRootRef
          }
        )
      ]
    }
  );
});
function QuadrantGuideOverlay({
  target,
  shellRootRef
}) {
  const shell = shellRootRef.current;
  if (!shell) return null;
  const groupEl = shell.querySelector(
    `[data-workspace-group="${target.groupId}"]`
  );
  if (!groupEl) return null;
  const shellRect = shell.getBoundingClientRect();
  const groupRect = groupEl.getBoundingClientRect();
  const relLeft = groupRect.left - shellRect.left;
  const relTop = groupRect.top - shellRect.top;
  const w = groupRect.width;
  const h = groupRect.height;
  let x = relLeft;
  let y = relTop;
  let width = w;
  let height = h;
  switch (target.direction) {
    case "west":
      width = w / 2;
      break;
    case "east":
      x = relLeft + w / 2;
      width = w / 2;
      break;
    case "north":
      height = h / 2;
      break;
    case "south":
      y = relTop + h / 2;
      height = h / 2;
      break;
  }
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      "data-workspace-guide-overlay": target.direction,
      style: {
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        zIndex: 20,
        pointerEvents: "none",
        background: "rgba(139,92,246,0.2)",
        border: "2px solid var(--accent)",
        borderRadius: 2,
        transition: "left 60ms ease, top 60ms ease, width 60ms ease, height 60ms ease"
      }
    }
  );
}
var closeBtnStyle = {
  background: "none",
  border: "none",
  color: "var(--foreground-muted)",
  cursor: "pointer",
  fontSize: 11,
  padding: "0 2px",
  lineHeight: 1
};
var actionBtnStyle = {
  background: "none",
  border: "none",
  color: "var(--foreground-muted)",
  cursor: "pointer",
  fontSize: 11,
  padding: "2px 4px",
  lineHeight: 1,
  borderRadius: 2
};

// src/workspace/runtime/LiveCodingRuntime.ts
var LIVE_MODE_DEBOUNCE_MS = 500;
function extractBpmFromCode(code) {
  const fractionMatch = code.match(
    /setcps\s*\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)/
  );
  if (fractionMatch) {
    const numerator = parseFloat(fractionMatch[1]);
    const denominator = parseFloat(fractionMatch[2]);
    if (denominator > 0 && Number.isFinite(numerator)) {
      return Math.round(numerator / denominator * 60);
    }
  }
  const scalarMatch = code.match(/setcps\s*\(\s*([\d.]+)\s*\)/);
  if (scalarMatch) {
    const cps = parseFloat(scalarMatch[1]);
    if (Number.isFinite(cps)) {
      return Math.round(cps * 60);
    }
  }
  return void 0;
}
var LiveCodingRuntime = class {
  constructor(fileId, engine, getFileContent, subscribeToFile = null) {
    this.bufferedSchedulerRef = null;
    this.isInitialized = false;
    this.isDisposed = false;
    this.currentBpm = void 0;
    this.isPlayingState = false;
    this.errorListeners = /* @__PURE__ */ new Set();
    this.playingChangedListeners = /* @__PURE__ */ new Set();
    /**
     * Unregister callback from the playback coordinator. Called in
     * `dispose()` to remove this runtime from the registry so its
     * stop callback can't be invoked after the runtime has been torn
     * down. Set in the constructor so every instance participates in
     * single-source playback coordination from birth.
     */
    this.unregisterFromPlaybackCoordinator = () => {
    };
    // Live mode (autoRefresh) state.
    //
    // The subscription is lazily installed the first time `setAutoRefresh(true)`
    // is called AND the runtime is playing. Every subsequent reconcile
    // (play/stop/setAutoRefresh/dispose) maintains the invariant
    //
    //     (autoRefreshEnabled && isPlayingState && subscribeToFile) <=>
    //     (autoRefreshUnsub !== null)
    //
    // so the subscription lifetime is driven by three independent signals
    // without leaking between sessions or firing after dispose. The debounce
    // timeout is tracked separately so setAutoRefresh(false) / stop() can
    // cancel an in-flight pending re-play.
    this.autoRefreshEnabled = false;
    this.autoRefreshUnsub = null;
    this.autoRefreshTimeout = null;
    this.autoRefreshChangedListeners = /* @__PURE__ */ new Set();
    this.fileId = fileId;
    this.engine = engine;
    this.getFileContent = getFileContent;
    this.subscribeToFile = subscribeToFile;
    engine.setRuntimeErrorHandler((err2) => {
      this.fireOnError(err2);
    });
    this.unregisterFromPlaybackCoordinator = registerPlaybackSource(
      fileId,
      () => this.stop(),
      `LiveCodingRuntime:${fileId}`
    );
  }
  async init() {
    if (this.isInitialized) return;
    if (this.isDisposed) {
      throw new Error("LiveCodingRuntime: cannot init after dispose");
    }
    await this.engine.init();
    this.isInitialized = true;
  }
  /**
   * The nine-step play lifecycle (PK1). See class JSDoc above.
   *
   * Returns the evaluate error if any (also fires `onError` listeners).
   * The bus is left untouched on error — no publish, no unpublish.
   */
  async play() {
    if (this.isDisposed) {
      const err2 = new Error("LiveCodingRuntime: cannot play after dispose");
      this.fireOnError(err2);
      return { error: err2 };
    }
    try {
      if (!this.isInitialized) {
        await this.engine.init();
        this.isInitialized = true;
      }
    } catch (err2) {
      const error = err2 instanceof Error ? err2 : new Error(String(err2));
      this.fireOnError(error);
      return { error };
    }
    const code = this.getFileContent();
    let evalResult;
    try {
      evalResult = await this.engine.evaluate(code);
    } catch (err2) {
      const error = err2 instanceof Error ? err2 : new Error(String(err2));
      this.fireOnError(error);
      return { error };
    }
    if (evalResult.error) {
      this.fireOnError(evalResult.error);
      return { error: evalResult.error };
    }
    const components = this.engine.components;
    const streaming = components.streaming;
    const audio = components.audio;
    const queryable = components.queryable;
    const inlineViz = components.inlineViz;
    let scheduler = queryable?.scheduler ?? null;
    if (!scheduler && streaming && audio) {
      if (!this.bufferedSchedulerRef) {
        this.bufferedSchedulerRef = new BufferedScheduler(
          streaming.hapStream,
          audio.audioCtx
        );
      }
      scheduler = this.bufferedSchedulerRef;
    }
    const payload = {
      hapStream: streaming?.hapStream,
      analyser: audio?.analyser,
      scheduler: scheduler ?? void 0,
      inlineViz,
      audio,
      // Pass through the full engine components in their original nested
      // shape. addInlineViewZones reads queryable.trackSchedulers,
      // audio.trackAnalysers, inlineViz.trackStreams — the flat fields
      // above don't carry per-track data.
      engineComponents: this.engine.components
    };
    workspaceAudioBus.publish(this.fileId, payload);
    try {
      this.engine.play();
    } catch (err2) {
      workspaceAudioBus.unpublish(this.fileId);
      const error = err2 instanceof Error ? err2 : new Error(String(err2));
      this.fireOnError(error);
      return { error };
    }
    this.currentBpm = extractBpmFromCode(code);
    this.isPlayingState = true;
    this.firePlayingChanged(true);
    notifyPlaybackStarted(this.fileId);
    this.reconcileAutoRefresh();
    return { error: null };
  }
  stop() {
    if (this.isDisposed) return;
    if (!this.isPlayingState) {
      workspaceAudioBus.unpublish(this.fileId);
      return;
    }
    try {
      this.engine.stop();
    } finally {
      workspaceAudioBus.unpublish(this.fileId);
      this.isPlayingState = false;
      this.firePlayingChanged(false);
      notifyPlaybackStopped(this.fileId);
      this.reconcileAutoRefresh();
    }
  }
  dispose() {
    if (this.isDisposed) return;
    try {
      this.stop();
    } catch {
    }
    this.autoRefreshEnabled = false;
    this.reconcileAutoRefresh();
    this.bufferedSchedulerRef?.dispose();
    this.bufferedSchedulerRef = null;
    try {
      this.engine.dispose();
    } catch {
    }
    this.isDisposed = true;
    this.errorListeners.clear();
    this.playingChangedListeners.clear();
    this.autoRefreshChangedListeners.clear();
    try {
      this.unregisterFromPlaybackCoordinator();
    } catch {
    }
  }
  // -------------------------------------------------------------------------
  // Live mode (autoRefresh) — setters, getters, listener, reconciliation.
  // -------------------------------------------------------------------------
  /**
   * Enable or disable live mode for this runtime.
   *
   * When enabled AND the runtime is currently playing AND a
   * `subscribeToFile` function was provided at construction time, the
   * runtime installs a subscription on the workspace file that
   * debounce-triggers `play()` (which re-evaluates the current content)
   * on every content change.
   *
   * When disabled or stopped, the subscription is torn down and any
   * pending debounce timeout is cleared — so toggling OFF mid-burst is
   * immediate, not "finish the pending re-play first."
   *
   * Idempotent — calling with the already-set value is a no-op and does
   * not fire the `onAutoRefreshChanged` listeners. Never throws; disposed
   * runtimes silently ignore the call.
   */
  setAutoRefresh(enabled) {
    if (this.isDisposed) return;
    if (this.autoRefreshEnabled === enabled) return;
    this.autoRefreshEnabled = enabled;
    this.reconcileAutoRefresh();
    this.fireAutoRefreshChanged(enabled);
  }
  /** Current live-mode state. */
  isAutoRefreshEnabled() {
    return this.autoRefreshEnabled;
  }
  /**
   * Subscribe to live-mode state changes. Fires after `setAutoRefresh`
   * mutations, with the new enabled value. Returns an idempotent
   * unsubscribe. Used by the chrome to re-render the live-mode toggle
   * without having to poll.
   */
  onAutoRefreshChanged(cb) {
    this.autoRefreshChangedListeners.add(cb);
    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.autoRefreshChangedListeners.delete(cb);
    };
  }
  /**
   * Install or tear down the file-content subscription so that its
   * presence matches `(autoRefreshEnabled && isPlayingState &&
   * subscribeToFile !== null)`. Called from `setAutoRefresh`, `play`,
   * `stop`, and `dispose`.
   *
   * Installing the subscription is idempotent — calling reconcile while
   * already subscribed is a no-op. Tearing down is likewise idempotent.
   */
  reconcileAutoRefresh() {
    const shouldBeActive = this.autoRefreshEnabled && this.isPlayingState && this.subscribeToFile !== null && !this.isDisposed;
    if (shouldBeActive && !this.autoRefreshUnsub) {
      this.autoRefreshUnsub = this.subscribeToFile(
        () => this.onLiveModeContentChanged()
      );
      return;
    }
    if (!shouldBeActive && this.autoRefreshUnsub) {
      const unsub = this.autoRefreshUnsub;
      this.autoRefreshUnsub = null;
      try {
        unsub();
      } catch {
      }
      if (this.autoRefreshTimeout) {
        clearTimeout(this.autoRefreshTimeout);
        this.autoRefreshTimeout = null;
      }
    }
  }
  /**
   * Debounced re-evaluate trigger. Called by the file subscription
   * callback on every content change. Cancels any pending timeout and
   * schedules a new one; when it fires, checks the invariants once more
   * (dispose/stop/toggle-off may have happened mid-debounce) and calls
   * `play()` to re-evaluate and re-schedule.
   */
  onLiveModeContentChanged() {
    if (this.autoRefreshTimeout) clearTimeout(this.autoRefreshTimeout);
    this.autoRefreshTimeout = setTimeout(() => {
      this.autoRefreshTimeout = null;
      if (this.isDisposed) return;
      if (!this.autoRefreshEnabled) return;
      if (!this.isPlayingState) return;
      void this.play();
    }, LIVE_MODE_DEBOUNCE_MS);
  }
  fireAutoRefreshChanged(enabled) {
    if (this.autoRefreshChangedListeners.size === 0) return;
    const snapshot = Array.from(this.autoRefreshChangedListeners);
    for (const cb of snapshot) {
      try {
        cb(enabled);
      } catch {
      }
    }
  }
  onError(cb) {
    this.errorListeners.add(cb);
    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.errorListeners.delete(cb);
    };
  }
  onPlayingChanged(cb) {
    this.playingChangedListeners.add(cb);
    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.playingChangedListeners.delete(cb);
    };
  }
  getBpm() {
    return this.currentBpm;
  }
  // -------------------------------------------------------------------------
  // Internal listener dispatchers — snapshot-then-iterate so a listener
  // that unsubscribes itself during the callback doesn't break the loop.
  // -------------------------------------------------------------------------
  fireOnError(err2) {
    if (this.errorListeners.size === 0) return;
    const snapshot = Array.from(this.errorListeners);
    for (const cb of snapshot) {
      try {
        cb(err2);
      } catch {
      }
    }
  }
  firePlayingChanged(playing) {
    if (this.playingChangedListeners.size === 0) return;
    const snapshot = Array.from(this.playingChangedListeners);
    for (const cb of snapshot) {
      try {
        cb(playing);
      } catch {
      }
    }
  }
};

// src/workspace/runtime/registry.ts
var byExtension2 = /* @__PURE__ */ new Map();
var byLanguage2 = /* @__PURE__ */ new Map();
function normalizeExtension2(ext) {
  if (!ext) return void 0;
  return ext.startsWith(".") ? ext : `.${ext}`;
}
function registerRuntimeProvider(provider) {
  for (const rawExt of provider.extensions) {
    const ext = normalizeExtension2(rawExt);
    if (ext) byExtension2.set(ext, provider);
  }
  byLanguage2.set(provider.language, provider);
}
function getRuntimeProviderForExtension(extension) {
  const key = normalizeExtension2(extension);
  if (!key) return void 0;
  return byExtension2.get(key);
}
function getRuntimeProviderForLanguage(language) {
  return byLanguage2.get(language);
}
var liveCodingRuntimeRegistry = byExtension2;
var DEFAULT_CODE = `// Welcome to Stave`;
var FILE_ID = "__livecoding_editor__";
function LiveCodingEditor({
  engine,
  code: controlledCode,
  defaultCode,
  onChange,
  autoPlay = false,
  onPlay,
  onStop,
  onError,
  theme = "dark",
  height = 320,
  vizHeight: _vizHeight = 200,
  showToolbar: _showToolbar = true,
  showVizPicker: _showVizPicker,
  readOnly: _readOnly = false,
  activeHighlight: _activeHighlight = true,
  visualizer: _visualizer = "off",
  vizDescriptors: _vizDescriptors = DEFAULT_VIZ_DESCRIPTORS,
  toolbarExtra,
  onPostEvaluate,
  soundNames: _soundNames,
  bpm: bpmProp,
  isExporting: _isExportingProp = false,
  onExport: _onExportProp,
  engineRef: engineRefProp,
  language: _language
}) {
  const isControlled = controlledCode !== void 0;
  const initialCode = controlledCode ?? defaultCode ?? DEFAULT_CODE;
  const runtimeRef = React.useRef(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [bpm, setBpm] = React.useState(bpmProp);
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const fileIdRef = React.useRef(FILE_ID);
  const [seeded, setSeeded] = React.useState(false);
  React.useEffect(() => {
    seedWorkspaceFile(
      fileIdRef.current,
      "pattern.strudel",
      initialCode,
      "strudel"
    );
    setSeeded(true);
  }, []);
  React.useEffect(() => {
    if (!seeded) return;
    const rt = new LiveCodingRuntime(
      fileIdRef.current,
      engine,
      () => getFile(fileIdRef.current)?.content ?? "",
      // Pass the workspace-file subscriber so the runtime can install
      // its own content-change subscription for live mode. Lazy — only
      // fires after setAutoRefresh(true).
      (cb) => subscribe(fileIdRef.current, cb)
    );
    runtimeRef.current = rt;
    if (engineRefProp) engineRefProp.current = engine;
    const unsubError = rt.onError((err2) => {
      setError(err2);
      onError?.(err2);
    });
    const unsubPlaying = rt.onPlayingChanged((playing) => {
      setIsPlaying(playing);
      if (playing) {
        onPlay?.();
        setBpm(rt.getBpm());
        onPostEvaluate?.(engine);
      } else {
        onStop?.();
      }
    });
    const unsubAutoRefresh = rt.onAutoRefreshChanged(setAutoRefresh);
    return () => {
      unsubError();
      unsubPlaying();
      unsubAutoRefresh();
      rt.dispose();
      runtimeRef.current = null;
    };
  }, [seeded, engine]);
  const autoPlayedRef = React.useRef(false);
  React.useEffect(() => {
    if (!autoPlay || !runtimeRef.current || autoPlayedRef.current) return;
    autoPlayedRef.current = true;
    runtimeRef.current.play();
  }, [autoPlay, seeded]);
  React.useEffect(() => {
    if (!isControlled || !seeded) return;
    const file = getFile(fileIdRef.current);
    if (file && controlledCode !== file.content) {
      setContent(fileIdRef.current, controlledCode);
    }
  }, [controlledCode, isControlled, seeded]);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  React.useEffect(() => {
    if (!seeded) return;
    return subscribe(fileIdRef.current, () => {
      const file = getFile(fileIdRef.current);
      if (file) onChangeRef.current?.(file.content);
    });
  }, [seeded]);
  const handlePlay = React.useCallback(() => {
    setError(null);
    runtimeRef.current?.play();
  }, []);
  const handleStop = React.useCallback(() => {
    runtimeRef.current?.stop();
  }, []);
  const handleToggleAutoRefresh = React.useCallback(() => {
    const rt = runtimeRef.current;
    if (!rt) return;
    rt.setAutoRefresh(!rt.isAutoRefreshEnabled());
  }, []);
  const chromeForTab = React.useCallback(
    (tab) => {
      if (tab.kind !== "editor") return void 0;
      const rt = runtimeRef.current;
      if (!rt) return void 0;
      const provider = getRuntimeProviderForLanguage("strudel");
      if (!provider) return void 0;
      const ctx = {
        runtime: rt,
        file: getFile(fileIdRef.current),
        isPlaying,
        error,
        bpm: bpmProp ?? bpm,
        onPlay: handlePlay,
        onStop: handleStop,
        chromeExtras: toolbarExtra,
        autoRefresh,
        onToggleAutoRefresh: handleToggleAutoRefresh
      };
      return provider.renderChrome(ctx);
    },
    [isPlaying, error, bpm, bpmProp, handlePlay, handleStop, toolbarExtra, autoRefresh, handleToggleAutoRefresh]
  );
  const editorExtrasForTab = React.useCallback(
    () => ({
      onPlay: handlePlay,
      onStop: handleStop,
      error
    }),
    [handlePlay, handleStop, error]
  );
  const initialTabs = [
    { kind: "editor", id: "editor-main", fileId: fileIdRef.current }
  ];
  if (!seeded) return null;
  return /* @__PURE__ */ jsxRuntime.jsx(
    WorkspaceShell,
    {
      initialTabs,
      theme,
      height,
      chromeForTab,
      editorExtrasForTab
    }
  );
}
var DEFAULT_CODE2 = `// Welcome to Stave
setcps(120/240)
$: note("c3 e3 g3 b3").s("sine").gain(0.7)`;
var DEFAULT_EXPORT_DURATION = 8;
function StrudelEditor({
  code: controlledCode,
  defaultCode = DEFAULT_CODE2,
  onChange,
  autoPlay = false,
  onPlay,
  onStop,
  onError,
  theme = "dark",
  height = 320,
  vizHeight = 200,
  showToolbar = true,
  showVizPicker,
  readOnly = false,
  activeHighlight = true,
  visualizer = "off",
  vizDescriptors = DEFAULT_VIZ_DESCRIPTORS,
  onExport,
  engineRef: engineRefProp
}) {
  const engineRef = React.useRef(null);
  const [bpm, setBpm] = React.useState(120);
  const [soundNames, setSoundNames] = React.useState([]);
  const [isExporting, setIsExporting] = React.useState(false);
  function getEngine() {
    if (!engineRef.current) {
      engineRef.current = new StrudelEngine();
      if (engineRefProp) engineRefProp.current = engineRef.current;
    }
    return engineRef.current;
  }
  React.useEffect(() => {
    if (engineRefProp) {
      engineRefProp.current = engineRef.current;
    }
  });
  React.useEffect(() => {
    return () => {
      engineRef.current?.dispose();
    };
  }, []);
  const codeRef = React.useRef(controlledCode ?? defaultCode);
  codeRef.current = controlledCode ?? defaultCode;
  const handlePostEvaluate = React.useCallback((engine2) => {
    const code = codeRef.current;
    const cpsMatch = code.match(/setcps\s*\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)/);
    if (cpsMatch) {
      const numerator = parseFloat(cpsMatch[1]);
      const denominator = parseFloat(cpsMatch[2]);
      if (denominator > 0) setBpm(Math.round(numerator / denominator * 60));
    }
    const strudelEngine = engine2;
    if (soundNames.length === 0) {
      setSoundNames(strudelEngine.getSoundNames());
    }
  }, [soundNames]);
  const handleExport = React.useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const engine2 = getEngine();
      await engine2.init();
      const blob = await engine2.renderOffline(codeRef.current, DEFAULT_EXPORT_DURATION);
      if (onExport) {
        await onExport(blob);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pattern.wav";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err2) {
      const e = err2;
      onError?.(e);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, onExport, onError]);
  const toolbarExtra = /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
    bpm !== void 0 && /* @__PURE__ */ jsxRuntime.jsxs(
      "span",
      {
        style: {
          color: "var(--text-secondary, rgba(255,255,255,0.5))",
          fontSize: 11,
          fontFamily: "inherit",
          marginRight: 6
        },
        children: [
          bpm,
          " BPM"
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx(
      "button",
      {
        onClick: handleExport,
        disabled: isExporting,
        title: "Export audio",
        style: {
          background: "none",
          border: "1px solid var(--border, rgba(255,255,255,0.1))",
          borderRadius: 4,
          color: isExporting ? "var(--text-secondary, rgba(255,255,255,0.3))" : "var(--text-secondary, rgba(255,255,255,0.5))",
          cursor: isExporting ? "wait" : "pointer",
          padding: "3px 7px",
          fontSize: 11,
          fontFamily: "inherit",
          marginRight: 2
        },
        children: isExporting ? "Exporting..." : "Export"
      }
    )
  ] });
  const engine = getEngine();
  return /* @__PURE__ */ jsxRuntime.jsx(
    LiveCodingEditor,
    {
      engine,
      code: controlledCode,
      defaultCode,
      onChange,
      autoPlay,
      onPlay,
      onStop,
      onError,
      theme,
      height,
      vizHeight,
      showToolbar,
      showVizPicker,
      readOnly,
      activeHighlight,
      visualizer,
      vizDescriptors,
      toolbarExtra,
      onPostEvaluate: handlePostEvaluate,
      soundNames
    }
  );
}

// src/engine/DemoEngine.ts
var DemoEngine = class {
  constructor() {
    this.audioCtx = null;
    this.analyserNode = null;
    this.hapStream = new HapStream();
    this.oscillator = null;
    this.gainNode = null;
    this.initialized = false;
    this.playing = false;
    this.runtimeErrorHandler = null;
    this.currentVizRequests = /* @__PURE__ */ new Map();
    this.schedulerInterval = null;
    this.noteSequence = [];
    this.noteIndex = 0;
    this.cyclePos = 0;
  }
  async init() {
    if (this.initialized) return;
    this.audioCtx = new AudioContext();
    await this.audioCtx.resume();
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.analyserNode.smoothingTimeConstant = 0.8;
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.value = 0.3;
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioCtx.destination);
    this.initialized = true;
  }
  async evaluate(code) {
    if (!this.initialized) {
      return { error: new Error("DemoEngine not initialized \u2014 call init() first") };
    }
    try {
      const noteMatch = code.match(/note:\s*(.+)/i);
      if (noteMatch) {
        this.noteSequence = noteMatch[1].trim().split(/\s+/);
      } else {
        this.noteSequence = ["c4"];
      }
      this.currentVizRequests.clear();
      const vizMatch = code.match(/viz:\s*(\w+)/i);
      if (vizMatch) {
        const lines = code.split("\n");
        const noteLine = lines.findIndex((l) => /note:/i.test(l));
        this.currentVizRequests.set("demo", {
          vizId: vizMatch[1],
          afterLine: noteLine >= 0 ? noteLine + 1 : lines.length
        });
      }
      this.noteIndex = 0;
      this.cyclePos = 0;
      return {};
    } catch (err2) {
      const error = err2 instanceof Error ? err2 : new Error(String(err2));
      return { error };
    }
  }
  play() {
    if (!this.audioCtx || !this.gainNode || this.noteSequence.length === 0) return;
    if (this.playing) return;
    this.oscillator = this.audioCtx.createOscillator();
    this.oscillator.type = "sine";
    this.oscillator.frequency.value = this.noteToFreq(this.noteSequence[0]);
    this.oscillator.connect(this.gainNode);
    this.oscillator.start();
    this.playing = true;
    this.schedulerInterval = setInterval(() => {
      try {
        if (!this.oscillator || !this.audioCtx) return;
        this.noteIndex = (this.noteIndex + 1) % this.noteSequence.length;
        const noteName = this.noteSequence[this.noteIndex];
        this.oscillator.frequency.value = this.noteToFreq(noteName);
        this.cyclePos += 0.25;
        const now = this.audioCtx.currentTime;
        const event = {
          audioTime: now,
          audioDuration: 0.5,
          scheduledAheadMs: 0,
          midiNote: null,
          s: "demo",
          color: null,
          loc: null
        };
        this.hapStream.emitEvent(event);
      } catch (err2) {
        const error = err2 instanceof Error ? err2 : new Error(String(err2));
        this.runtimeErrorHandler?.(error);
      }
    }, 500);
  }
  stop() {
    if (this.schedulerInterval != null) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch {
      }
      this.oscillator = null;
    }
    this.playing = false;
  }
  dispose() {
    if (this.playing) this.stop();
    this.hapStream.dispose();
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {
      });
      this.audioCtx = null;
    }
    this.initialized = false;
    this.noteSequence = [];
    this.currentVizRequests.clear();
  }
  setRuntimeErrorHandler(handler) {
    this.runtimeErrorHandler = handler;
  }
  get components() {
    const bag = {
      streaming: { hapStream: this.hapStream }
    };
    if (this.analyserNode && this.audioCtx) {
      bag.audio = { analyser: this.analyserNode, audioCtx: this.audioCtx };
    }
    if (this.currentVizRequests.size > 0) {
      bag.inlineViz = { vizRequests: this.currentVizRequests };
    }
    return bag;
  }
  noteToFreq(note2) {
    const NOTES = {
      c4: 261.63,
      d4: 293.66,
      e4: 329.63,
      f4: 349.23,
      g4: 392,
      a4: 440,
      b4: 493.88,
      c5: 523.25,
      d5: 587.33,
      e5: 659.25
    };
    return NOTES[note2.toLowerCase()] ?? 440;
  }
};

// ../../../sonicPiWeb/src/engine/MinHeap.ts
var MinHeap = class {
  constructor(keyFn) {
    this.data = [];
    this.keyFn = keyFn;
  }
  get size() {
    return this.data.length;
  }
  peek() {
    return this.data[0];
  }
  push(item) {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }
  pop() {
    if (this.data.length === 0) return void 0;
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }
  clear() {
    this.data.length = 0;
  }
  bubbleUp(i2) {
    while (i2 > 0) {
      const parent = i2 - 1 >> 1;
      if (this.keyFn(this.data[i2]) >= this.keyFn(this.data[parent])) break;
      [this.data[i2], this.data[parent]] = [this.data[parent], this.data[i2]];
      i2 = parent;
    }
  }
  sinkDown(i2) {
    const n = this.data.length;
    while (true) {
      let smallest = i2;
      const left = 2 * i2 + 1;
      const right = 2 * i2 + 2;
      if (left < n && this.keyFn(this.data[left]) < this.keyFn(this.data[smallest])) {
        smallest = left;
      }
      if (right < n && this.keyFn(this.data[right]) < this.keyFn(this.data[smallest])) {
        smallest = right;
      }
      if (smallest === i2) break;
      [this.data[i2], this.data[smallest]] = [this.data[smallest], this.data[i2]];
      i2 = smallest;
    }
  }
};

// ../../../sonicPiWeb/src/engine/VirtualTimeScheduler.ts
function cueGlobMatch(pattern, name2) {
  if (pattern === name2) return true;
  if (!pattern.includes("*") && !pattern.includes("?")) return false;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("^" + escaped.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
  return re.test(name2);
}
var DEFAULT_SCHED_AHEAD_TIME = 0.3;
var DEFAULT_TICK_INTERVAL_MS = 25;
var HEAP_TIEBREAK_EPSILON = 1e-12;
var VirtualTimeScheduler = class {
  constructor(options = {}) {
    this.tasks = /* @__PURE__ */ new Map();
    this.tickTimer = null;
    this.eventHandlers = [];
    this.loopErrorHandler = null;
    /** Monotonic counter for deterministic ordering of same-time entries */
    this.insertionOrder = 0;
    /** Map from `${time}:${taskId}` to insertion order for stable sorting */
    // entryOrder Map removed — insertion order stored directly on SleepEntry (#75)
    this._running = false;
    /** Cue state: last cue per name with virtual time and args */
    this.cueMap = /* @__PURE__ */ new Map();
    /** Tasks waiting for a cue */
    this.syncWaiters = /* @__PURE__ */ new Map();
    this.getAudioTime = options.getAudioTime ?? (() => 0);
    this.schedAheadTime = options.schedAheadTime ?? DEFAULT_SCHED_AHEAD_TIME;
    this.tickInterval = options.tickInterval ?? DEFAULT_TICK_INTERVAL_MS;
    this.queue = new MinHeap((entry) => {
      return entry.time + entry.order * HEAP_TIEBREAK_EPSILON;
    });
  }
  get running() {
    return this._running;
  }
  // ---------------------------------------------------------------------------
  // Task registration
  // ---------------------------------------------------------------------------
  /**
   * Register a named live_loop and immediately start its async chain.
   * The loop suspends at an initial sleep(0) — it won't execute until tick().
   */
  registerLoop(name2, asyncFn, options) {
    const existing = this.tasks.get(name2);
    if (existing && existing.running) {
      existing.asyncFn = asyncFn;
      return;
    }
    const task = {
      id: name2,
      virtualTime: this.getAudioTime(),
      bpm: options?.bpm ?? 60,
      density: 1,
      currentSynth: options?.synth ?? "beep",
      outBus: options?.outBus ?? 0,
      asyncFn,
      running: true
    };
    this.tasks.set(name2, task);
    this.runLoop(task);
  }
  getTask(taskId) {
    return this.tasks.get(taskId);
  }
  /** Get names of all currently running loops. */
  getRunningLoopNames() {
    const names = [];
    for (const [name2, task] of this.tasks) {
      if (task.running) names.push(name2);
    }
    return names;
  }
  /** Stop a named loop from outside. Returns true if the loop was running. */
  stopLoop(name2) {
    const task = this.tasks.get(name2);
    if (!task || !task.running) return false;
    task.running = false;
    return true;
  }
  /**
   * Hot-swap a running loop's function.
   * Preserves virtualTime, bpm, density, random state (SV6).
   * The new function takes effect on the next loop iteration.
   */
  hotSwap(loopName, newFn) {
    const task = this.tasks.get(loopName);
    if (!task || !task.running) return false;
    task.asyncFn = newFn;
    return true;
  }
  /**
   * Re-evaluate: given a new set of loop names and functions,
   * hot-swap loops that persist, stop removed loops, start new ones.
   */
  reEvaluate(loops, options) {
    const previousFns = /* @__PURE__ */ new Map();
    const newlyStarted = [];
    try {
      for (const [name2, fn] of loops) {
        const existing = this.tasks.get(name2);
        if (existing && existing.running) {
          previousFns.set(name2, existing.asyncFn);
          existing.asyncFn = fn;
        } else {
          this.registerLoop(name2, fn, options);
          newlyStarted.push(name2);
        }
      }
      for (const [name2, task] of this.tasks) {
        if (!loops.has(name2) && task.running) {
          task.running = false;
        }
      }
    } catch (err2) {
      for (const [name2, prevFn] of previousFns) {
        const task = this.tasks.get(name2);
        if (task) task.asyncFn = prevFn;
      }
      for (const name2 of newlyStarted) {
        const task = this.tasks.get(name2);
        if (task) task.running = false;
      }
      throw err2;
    }
  }
  // ---------------------------------------------------------------------------
  // sleep — the core primitive
  // ---------------------------------------------------------------------------
  /**
   * Schedule a sleep for the given task.
   * Returns a Promise that ONLY tick() can resolve (SV2).
   *
   * Virtual time advances immediately on call (SV1).
   */
  scheduleSleep(taskId, beats) {
    const task = this.tasks.get(taskId);
    if (!task) return Promise.reject(new Error(`Unknown task: ${taskId}`));
    const seconds = beats / task.bpm * 60;
    const wakeTime = task.virtualTime + seconds;
    task.virtualTime = wakeTime;
    return new Promise((resolve) => {
      const order = this.insertionOrder++;
      this.queue.push({ time: wakeTime, taskId, resolve, order });
    });
  }
  // ---------------------------------------------------------------------------
  // Event dispatch
  // ---------------------------------------------------------------------------
  onEvent(handler) {
    this.eventHandlers.push(handler);
  }
  /** Register a handler called when a loop throws a runtime error. */
  onLoopError(handler) {
    this.loopErrorHandler = handler;
  }
  emitEvent(event) {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }
  // ---------------------------------------------------------------------------
  // sync/cue — inter-task synchronization
  // ---------------------------------------------------------------------------
  /**
   * Broadcast a cue event. Any tasks waiting via waitForSync
   * are woken and inherit the cuer's virtual time (SV5).
   *
   * `taskId` may identify a real scheduler task (normal DSL cue from inside
   * a live_loop) OR a synthetic external source (e.g. `'__midi__'` from the
   * MIDI bridge, `'__osc__'` from incoming OSC — #151). When the task does
   * not exist, fall back to the current audio time so external sources still
   * wake sync waiters instead of silently returning.
   */
  fireCue(name2, taskId, args2 = []) {
    const task = this.tasks.get(taskId);
    const cueVirtualTime = task?.virtualTime ?? this.getAudioTime();
    this.cueMap.set(name2, { time: cueVirtualTime, args: args2 });
    this.emitEvent({
      type: "cue",
      taskId,
      virtualTime: cueVirtualTime,
      audioTime: this.getAudioTime(),
      params: { name: name2, args: args2 }
    });
    for (const [pattern, waiters] of this.syncWaiters) {
      if (waiters.length === 0) continue;
      if (!cueGlobMatch(pattern, name2)) continue;
      for (const waiter of waiters) {
        const waiterTask = this.tasks.get(waiter.taskId);
        if (waiterTask) {
          waiterTask.virtualTime = cueVirtualTime;
        }
        waiter.resolve(args2);
      }
      this.syncWaiters.delete(pattern);
    }
  }
  /**
   * Wait for a cue. The calling task suspends until fireCue(name) is called.
   * On resume, the task inherits the cue's virtual time (SV5).
   */
  waitForSync(name2, taskId) {
    return new Promise((resolve) => {
      const waiters = this.syncWaiters.get(name2) ?? [];
      waiters.push({ taskId, resolve });
      this.syncWaiters.set(name2, waiters);
    });
  }
  // ---------------------------------------------------------------------------
  // Tick — the scheduler heartbeat
  // ---------------------------------------------------------------------------
  /**
   * Resolve all sleep entries up to targetTime.
   * Entries are resolved in deterministic order (time, then insertion order).
   *
   * With 10ms tick interval + 300ms schedAheadTime (#71), events are resolved
   * more frequently (100Hz vs 40Hz) and have 3x more runway before their
   * target audio time, reducing the impact of microtask processing delays.
   */
  tick(targetTime) {
    const target = targetTime ?? this.getAudioTime() + this.schedAheadTime;
    while (this.queue.peek() && this.queue.peek().time <= target) {
      const entry = this.queue.pop();
      entry.resolve();
    }
  }
  // ---------------------------------------------------------------------------
  // Start / Stop
  // ---------------------------------------------------------------------------
  /** Start the tick timer. Loops are already running (suspended at sleep). */
  start() {
    if (this._running) return;
    this._running = true;
    this.tickTimer = setInterval(() => this.tick(), this.tickInterval);
  }
  /** Pause the tick timer without stopping tasks. Used during hot-swap. */
  pauseTick() {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
  /** Resume the tick timer after a pause. */
  resumeTick() {
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
    if (!this._running) {
      this.tickTimer = null;
      return;
    }
    this.tickTimer = setInterval(() => this.tick(), this.tickInterval);
  }
  stop() {
    this._running = false;
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    for (const task of this.tasks.values()) {
      task.running = false;
    }
  }
  dispose() {
    this.stop();
    this.tasks.clear();
    this.queue.clear();
    this.eventHandlers.length = 0;
    this.cueMap.clear();
    this.syncWaiters.clear();
  }
  // ---------------------------------------------------------------------------
  // Internal: loop execution
  // ---------------------------------------------------------------------------
  async runLoop(task) {
    await this.scheduleSleep(task.id, 0);
    const MAX_NOSLEEP_ITERATIONS = 1024;
    let noSleepCount = 0;
    while (task.running) {
      this.fireCue(task.id, task.id);
      const vtBefore = task.virtualTime;
      try {
        await task.asyncFn();
      } catch (err2) {
        if (err2 instanceof Error && err2.name === "StopSignal") {
          task.running = false;
          break;
        }
        if (err2 instanceof Error && err2.name === "InfiniteLoopError") {
          task.running = false;
          if (this.loopErrorHandler) {
            this.loopErrorHandler(task.id, err2);
          } else {
            console.error(`[SonicPi] Error in loop "${task.id}":`, err2);
          }
          break;
        }
        const error = err2 instanceof Error ? err2 : new Error(String(err2));
        if (this.loopErrorHandler) {
          this.loopErrorHandler(task.id, error);
        } else {
          console.error(`[SonicPi] Error in loop "${task.id}":`, error);
        }
        if (task.running) {
          await this.scheduleSleep(task.id, 1);
        }
      }
      if (task.virtualTime === vtBefore) {
        noSleepCount++;
        if (noSleepCount >= MAX_NOSLEEP_ITERATIONS) {
          const err2 = new Error("Infinite loop detected \u2014 did you forget a sleep?");
          err2.name = "InfiniteLoopError";
          task.running = false;
          if (this.loopErrorHandler) {
            this.loopErrorHandler(task.id, err2);
          } else {
            console.error(`[SonicPi] Error in loop "${task.id}":`, err2);
          }
          break;
        }
      } else {
        noSleepCount = 0;
      }
    }
  }
};

// ../../../sonicPiWeb/src/engine/SeededRandom.ts
var N = 624;
var M = 397;
var MATRIX_A = 2567483615;
var UPPER_MASK = 2147483648;
var LOWER_MASK = 2147483647;
var SeededRandom = class _SeededRandom {
  constructor(seed = 0) {
    this.mt = new Int32Array(N);
    this.mti = N + 1;
    this.initGenrand(seed >>> 0);
  }
  /** Initialize the state array with a seed. */
  initGenrand(s) {
    this.mt[0] = s >>> 0;
    for (this.mti = 1; this.mti < N; this.mti++) {
      const prev = this.mt[this.mti - 1];
      this.mt[this.mti] = Math.imul(1812433253, prev ^ prev >>> 30) + this.mti >>> 0;
    }
  }
  /** Generate the next 32-bit unsigned integer. */
  genrandInt32() {
    let y;
    const mag01 = [0, MATRIX_A];
    if (this.mti >= N) {
      let kk;
      for (kk = 0; kk < N - M; kk++) {
        y = this.mt[kk] & UPPER_MASK | this.mt[kk + 1] & LOWER_MASK;
        this.mt[kk] = this.mt[kk + M] ^ y >>> 1 ^ mag01[y & 1];
      }
      for (; kk < N - 1; kk++) {
        y = this.mt[kk] & UPPER_MASK | this.mt[kk + 1] & LOWER_MASK;
        this.mt[kk] = this.mt[kk + (M - N)] ^ y >>> 1 ^ mag01[y & 1];
      }
      y = this.mt[N - 1] & UPPER_MASK | this.mt[0] & LOWER_MASK;
      this.mt[N - 1] = this.mt[M - 1] ^ y >>> 1 ^ mag01[y & 1];
      this.mti = 0;
    }
    y = this.mt[this.mti++];
    y ^= y >>> 11;
    y ^= y << 7 & 2636928640;
    y ^= y << 15 & 4022730752;
    y ^= y >>> 18;
    return y >>> 0;
  }
  /** Return a float in [0, 1). Matches Ruby's Random#rand. */
  next() {
    const a = this.genrandInt32() >>> 5;
    const b = this.genrandInt32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }
  /** Random float in [min, max]. */
  rrand(min, max) {
    return min + this.next() * (max - min);
  }
  /** Random int in [min, max]. */
  rrand_i(min, max) {
    return Math.floor(this.rrand(min, max + 1));
  }
  /** Random element from array. */
  choose(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Random integer in [1, sides]. */
  dice(sides) {
    return Math.floor(this.next() * sides) + 1;
  }
  /** Reset seed. */
  reset(seed) {
    this.initGenrand(seed >>> 0);
  }
  /** Clone current state. */
  clone() {
    const r = new _SeededRandom();
    r.mt.set(this.mt);
    r.mti = this.mti;
    return r;
  }
  /** Snapshot state for save/restore (used by with_random_seed). */
  getState() {
    return { mt: new Uint32Array(this.mt), mti: this.mti };
  }
  /** Restore state from snapshot. */
  setState(state4) {
    this.mt.set(state4.mt);
    this.mti = state4.mti;
  }
  /** Return next value without advancing state. */
  peek() {
    const clone = this.clone();
    return clone.next();
  }
};

// ../../../sonicPiWeb/src/engine/NoteToFreq.ts
var SEMITONES_PER_OCTAVE = 12;
var A4_MIDI = 69;
var A4_FREQ_HZ = 440;
var MIDDLE_C_MIDI = 60;
var DEFAULT_OCTAVE = 4;
var NOTE_NAMES2 = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11
};
function noteToMidi2(note2) {
  if (typeof note2 === "number") return note2;
  const str = note2.toLowerCase().trim();
  const num = Number(str);
  if (!isNaN(num)) return num;
  const match = str.match(/^([a-g])(s|b|#)?(\d+)?$/);
  if (!match) return MIDDLE_C_MIDI;
  const [, letter, accidental, octaveStr] = match;
  const base = NOTE_NAMES2[letter];
  const octave = octaveStr !== void 0 ? parseInt(octaveStr) : DEFAULT_OCTAVE;
  let midi = (octave + 1) * SEMITONES_PER_OCTAVE + base;
  if (accidental === "s" || accidental === "#") midi += 1;
  if (accidental === "b") midi -= 1;
  return midi;
}
function midiToFreq5(midi) {
  return A4_FREQ_HZ * Math.pow(2, (midi - A4_MIDI) / SEMITONES_PER_OCTAVE);
}
function hzToMidi(freq) {
  return SEMITONES_PER_OCTAVE * Math.log2(freq / A4_FREQ_HZ) + A4_MIDI;
}
function noteToFreq2(note2) {
  return midiToFreq5(noteToMidi2(note2));
}

// ../../../sonicPiWeb/src/engine/Ring.ts
var Ring = class _Ring {
  constructor(items) {
    this._tick = 0;
    this.items = [...items];
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === "string") {
          const n = Number(prop);
          if (!isNaN(n) && String(n) === prop) {
            return target.at(n);
          }
        }
        return Reflect.get(target, prop, receiver);
      }
    });
  }
  get length() {
    return this.items.length;
  }
  /** Access by index (wraps). */
  at(index) {
    const len = this.items.length;
    return this.items[(index % len + len) % len];
  }
  /** Auto-incrementing access. */
  tick() {
    return this.at(this._tick++);
  }
  /** Reset tick counter. */
  resetTick() {
    this._tick = 0;
  }
  /** Random element (uses Math.random — for seeded, use ctx.choose). */
  choose() {
    return this.items[Math.floor(Math.random() * this.items.length)];
  }
  /** Read tick without advancing. */
  look() {
    return this.at(this._tick);
  }
  /** Reverse the ring. */
  reverse() {
    return new _Ring([...this.items].reverse());
  }
  /** Shuffle the ring (Fisher-Yates). */
  shuffle() {
    const arr = [...this.items];
    for (let i2 = arr.length - 1; i2 > 0; i2--) {
      const j = Math.floor(Math.random() * (i2 + 1));
      [arr[i2], arr[j]] = [arr[j], arr[i2]];
    }
    return new _Ring(arr);
  }
  /** Pick n random elements. */
  pick(n) {
    const result = [];
    for (let i2 = 0; i2 < n; i2++) {
      result.push(this.items[Math.floor(Math.random() * this.items.length)]);
    }
    return new _Ring(result);
  }
  /** First n elements. */
  take(n) {
    return new _Ring(this.items.slice(0, n));
  }
  /** Drop first n elements. */
  drop(n) {
    return new _Ring(this.items.slice(n));
  }
  /** Stretch: repeat each element n times. */
  stretch(n) {
    const result = [];
    for (const item of this.items) {
      for (let i2 = 0; i2 < n; i2++) result.push(item);
    }
    return new _Ring(result);
  }
  /** Rotate the ring by n positions. Positive = left, negative = right. */
  rotate(n = 1) {
    if (this.items.length === 0) return new _Ring([]);
    const len = this.items.length;
    const offset = (n % len + len) % len;
    return new _Ring([...this.items.slice(offset), ...this.items.slice(0, offset)]);
  }
  /** Mirror: [1,2,3] → [1,2,3,2,1] */
  mirror() {
    const mid = this.items.slice(1, -1).reverse();
    return new _Ring([...this.items, ...mid]);
  }
  /** First element. */
  first() {
    return this.items[0];
  }
  /** Last element. */
  last() {
    return this.items[this.items.length - 1];
  }
  /** All elements except the last. */
  butlast() {
    return new _Ring(this.items.slice(0, -1));
  }
  /** Concatenate with another ring or array. */
  concat(other) {
    const otherItems = other instanceof _Ring ? other.toArray() : other;
    return new _Ring([...this.items, ...otherItems]);
  }
  /** Reflect: like mirror but no middle duplication for even-length. */
  reflect() {
    return new _Ring([...this.items, ...[...this.items].reverse()]);
  }
  /** Last n elements. */
  take_last(n) {
    return new _Ring(this.items.slice(-n));
  }
  /** Remove last n elements. */
  drop_last(n) {
    return new _Ring(this.items.slice(0, -n));
  }
  /** Sort elements (ascending). */
  sort() {
    return new _Ring([...this.items].sort((a, b) => a - b));
  }
  /** Multiply all elements by n (numeric rings only). */
  scale(n) {
    return new _Ring(this.items.map((v) => v * n));
  }
  /** Repeat the ring n times. */
  repeat(n) {
    const result = [];
    for (let i2 = 0; i2 < n; i2++) result.push(...this.items);
    return new _Ring(result);
  }
  /** Convert to plain array. */
  toArray() {
    return [...this.items];
  }
  [Symbol.iterator]() {
    return this.items[Symbol.iterator]();
  }
};
function ring(...values) {
  return new Ring(values);
}
function knit(...args2) {
  const result = [];
  for (let i2 = 0; i2 < args2.length - 1; i2 += 2) {
    const value = args2[i2];
    const count = args2[i2 + 1];
    for (let j = 0; j < count; j++) result.push(value);
  }
  return new Ring(result);
}
function range(start2, end, stepOrOpts = 1) {
  const step = typeof stepOrOpts === "number" ? stepOrOpts : stepOrOpts.step ?? 1;
  const result = [];
  const maxSize = 1e4;
  if (step > 0) {
    for (let i2 = start2; i2 < end && result.length < maxSize; i2 += step) result.push(i2);
  } else if (step < 0) {
    for (let i2 = start2; i2 > end && result.length < maxSize; i2 += step) result.push(i2);
  }
  if (result.length >= maxSize) {
    console.warn("[SonicPi] range() capped at 10000 elements");
  }
  return new Ring(result);
}
function line(start2, finish, stepsOrOpts = 4) {
  const steps = typeof stepsOrOpts === "number" ? stepsOrOpts : stepsOrOpts.steps ?? 4;
  const result = [];
  for (let i2 = 0; i2 < steps; i2++) {
    result.push(steps === 1 ? start2 : start2 + (finish - start2) * (i2 / (steps - 1)));
  }
  return new Ring(result);
}

// ../../../sonicPiWeb/src/engine/EuclideanRhythm.ts
function spread(hits, total, rotation = 0) {
  if (hits >= total) return new Ring(Array(total).fill(true));
  if (hits <= 0) return new Ring(Array(total).fill(false));
  let pattern = bjorklund(hits, total);
  if (rotation !== 0) {
    const r = (rotation % total + total) % total;
    pattern = [...pattern.slice(r), ...pattern.slice(0, r)];
  }
  return new Ring(pattern);
}
function bjorklund(hits, total) {
  let groups = [];
  for (let i2 = 0; i2 < total; i2++) {
    groups.push([i2 < hits]);
  }
  let tail = total - hits;
  while (tail > 1) {
    const head = groups.length - tail;
    const min = Math.min(head, tail);
    const newGroups = [];
    for (let i2 = 0; i2 < min; i2++) {
      newGroups.push([...groups[i2], ...groups[head + i2]]);
    }
    const remaining = head > tail ? groups.slice(min, head) : groups.slice(head + min);
    groups = [...newGroups, ...remaining];
    tail = remaining.length;
  }
  return groups.flat();
}

// ../../../sonicPiWeb/src/engine/ChordScale.ts
var CHORD_TYPES = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dim: [0, 3, 6],
  diminished: [0, 3, 6],
  aug: [0, 4, 8],
  augmented: [0, 4, 8],
  dom7: [0, 4, 7, 10],
  "7": [0, 4, 7, 10],
  major7: [0, 4, 7, 11],
  M7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  m7: [0, 3, 7, 10],
  dim7: [0, 3, 6, 9],
  aug7: [0, 4, 8, 10],
  halfdim: [0, 3, 6, 10],
  "m7-5": [0, 3, 6, 10],
  m9: [0, 3, 7, 10, 14],
  dom9: [0, 4, 7, 10, 14],
  "9": [0, 4, 7, 10, 14],
  major9: [0, 4, 7, 11, 14],
  M9: [0, 4, 7, 11, 14],
  minor11: [0, 3, 7, 10, 14, 17],
  dom11: [0, 4, 7, 10, 14, 17],
  "11": [0, 4, 7, 10, 14, 17],
  minor13: [0, 3, 7, 10, 14, 17, 21],
  dom13: [0, 4, 7, 10, 14, 17, 21],
  "13": [0, 4, 7, 10, 14, 17, 21],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  power: [0, 7],
  "1": [0],
  "5": [0, 7],
  "+5": [0, 4, 8],
  m_plus_5: [0, 3, 8],
  sus2sus4: [0, 2, 5, 7],
  add9: [0, 4, 7, 14],
  add11: [0, 4, 7, 17],
  add13: [0, 4, 7, 21],
  madd9: [0, 3, 7, 14],
  madd11: [0, 3, 7, 17],
  madd13: [0, 3, 7, 21],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "6_9": [0, 4, 7, 9, 14],
  m6_9: [0, 3, 7, 9, 14],
  // Extended chords — from Desktop SP chord.rb
  "7sus2": [0, 2, 7, 10],
  "7sus4": [0, 5, 7, 10],
  "7-5": [0, 4, 6, 10],
  "7+5": [0, 4, 8, 10],
  "m7+5": [0, 3, 8, 10],
  "m7+9": [0, 3, 7, 10, 14],
  "9sus4": [0, 5, 7, 10, 14],
  "6*9": [0, 4, 7, 9, 14],
  "m6*9": [0, 3, 7, 9, 14],
  "7-9": [0, 4, 7, 10, 13],
  "m7-9": [0, 3, 7, 10, 13],
  "7-10": [0, 4, 7, 10, 15],
  "7-11": [0, 4, 7, 10, 16],
  "7-13": [0, 4, 7, 10, 20],
  "9+5": [0, 10, 13],
  "m9+5": [0, 10, 14],
  "7+5-9": [0, 4, 8, 10, 13],
  "m7+5-9": [0, 3, 8, 10, 13],
  "11+": [0, 4, 7, 10, 14, 18],
  "m11+": [0, 3, 7, 10, 14, 18],
  add2: [0, 2, 4, 7],
  add4: [0, 4, 5, 7],
  madd2: [0, 2, 3, 7],
  madd4: [0, 3, 5, 7],
  // Aliases
  M: [0, 4, 7],
  m: [0, 3, 7],
  maj: [0, 4, 7],
  min: [0, 3, 7],
  a: [0, 4, 8],
  i: [0, 3, 6],
  i7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  maj9: [0, 4, 7, 11, 14],
  maj11: [0, 4, 7, 11, 14, 17],
  m11: [0, 3, 7, 10, 14, 17],
  m13: [0, 3, 7, 10, 14, 17, 21]
};
var SCALE_TYPES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  natural_minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  melodic_minor: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  minor_pentatonic: [0, 3, 5, 7, 10],
  major_pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  whole_tone: [0, 2, 4, 6, 8, 10],
  whole: [0, 2, 4, 6, 8, 10],
  diminished: [0, 2, 3, 5, 6, 8, 9, 11],
  octatonic: [0, 2, 3, 5, 6, 8, 9, 11],
  hex_major6: [0, 2, 4, 5, 7, 9],
  hex_dorian: [0, 2, 3, 5, 7, 10],
  hex_phrygian: [0, 1, 3, 5, 8, 10],
  hex_major7: [0, 2, 4, 7, 9, 11],
  hex_sus: [0, 2, 5, 7, 9, 10],
  hex_aeolian: [0, 3, 5, 7, 8, 10],
  hungarian_minor: [0, 2, 3, 6, 7, 8, 11],
  gypsy: [0, 2, 3, 6, 7, 8, 11],
  hirajoshi: [0, 4, 6, 7, 11],
  iwato: [0, 1, 5, 6, 10],
  kumoi: [0, 2, 3, 7, 9],
  in_sen: [0, 1, 5, 7, 10],
  yo: [0, 3, 5, 7, 10],
  pelog: [0, 1, 3, 7, 8],
  chinese: [0, 4, 6, 7, 11],
  egyptian: [0, 2, 5, 7, 10],
  prometheus: [0, 2, 4, 6, 9, 10],
  scriabin: [0, 1, 4, 7, 9],
  indian: [0, 4, 5, 7, 8, 11],
  enigmatic: [0, 1, 4, 6, 8, 10, 11],
  spanish: [0, 1, 3, 4, 5, 7, 8, 10],
  neapolitan_major: [0, 1, 3, 5, 7, 9, 11],
  neapolitan_minor: [0, 1, 3, 5, 7, 8, 11],
  bebop_major: [0, 2, 4, 5, 7, 8, 9, 11],
  bebop_minor: [0, 2, 3, 5, 7, 8, 10, 11],
  bebop_dominant: [0, 2, 4, 5, 7, 9, 10, 11],
  super_locrian: [0, 1, 3, 4, 6, 8, 10],
  persian: [0, 1, 4, 5, 6, 8, 11],
  arabic: [0, 2, 4, 5, 6, 8, 10],
  japanese: [0, 1, 5, 7, 8],
  lydian_minor: [0, 2, 4, 6, 7, 8, 10],
  // Aliases
  ionian: [0, 2, 4, 5, 7, 9, 11],
  diatonic: [0, 2, 4, 5, 7, 9, 11],
  // Extended scales — from Desktop SP scale.rb
  melodic_minor_asc: [0, 2, 3, 5, 7, 9, 11],
  melodic_minor_desc: [0, 2, 3, 5, 7, 8, 10],
  bartok: [0, 2, 4, 6, 7, 9, 10],
  bhairav: [0, 1, 4, 5, 7, 8, 11],
  locrian_major: [0, 2, 4, 5, 6, 8, 10],
  ahirbhairav: [0, 1, 4, 5, 7, 9, 11],
  harmonic_major: [0, 2, 4, 5, 7, 8, 11],
  romanian_minor: [0, 2, 3, 6, 7, 9, 11],
  hindu: [0, 2, 4, 5, 7, 9, 10],
  todi: [0, 1, 3, 6, 7, 8, 11],
  purvi: [0, 1, 4, 5, 7, 8, 11],
  marva: [0, 1, 4, 5, 7, 9, 10],
  melodic_major: [0, 2, 4, 5, 7, 9, 10],
  leading_whole: [0, 2, 4, 6, 8, 10, 11],
  augmented: [0, 3, 4, 7, 8, 11],
  augmented2: [0, 1, 4, 5, 8, 9],
  blues_major: [0, 2, 3, 6, 8, 11],
  blues_minor: [0, 3, 5, 6, 9, 11],
  diminished2: [0, 2, 3, 5, 6, 8, 9, 11],
  // Messiaen modes of limited transposition
  messiaen1: [0, 2, 4, 6, 8, 10],
  messiaen2: [0, 1, 3, 4, 6, 7, 9, 10],
  messiaen3: [0, 2, 3, 5, 6, 8, 9, 11],
  messiaen4: [0, 1, 4, 5, 6, 9, 10, 11],
  messiaen5: [0, 1, 5, 6, 7, 11],
  messiaen6: [0, 2, 4, 5, 7, 9, 10, 11],
  messiaen7: [0, 1, 2, 4, 5, 6, 7, 9, 10, 11],
  // Pentatonic aliases
  yu: [0, 3, 5, 7, 10],
  gong: [0, 2, 4, 7, 9],
  shang: [0, 2, 5, 7, 10],
  jiao: [0, 3, 5, 7, 10],
  zhi: [0, 2, 4, 7, 9],
  ritusen: [0, 2, 4, 7, 9]
};
function chord(root, type = "major", numOctavesOrOpts = 1) {
  const numOctaves = typeof numOctavesOrOpts === "number" ? numOctavesOrOpts : numOctavesOrOpts.num_octaves ?? 1;
  const rootMidi = noteToMidi2(root);
  const intervals = CHORD_TYPES[type];
  if (!intervals) {
    console.warn(`[SonicPi] Unknown chord type: ${type}, using major`);
    return chord(root, "major", numOctaves);
  }
  const notes = [];
  for (let oct = 0; oct < numOctaves; oct++) {
    for (const interval of intervals) {
      notes.push(rootMidi + interval + oct * 12);
    }
  }
  return new Ring(notes);
}
function scale(root, type = "major", numOctavesOrOpts = 1) {
  const numOctaves = typeof numOctavesOrOpts === "number" ? numOctavesOrOpts : numOctavesOrOpts.num_octaves ?? 1;
  const rootMidi = noteToMidi2(root);
  const intervals = SCALE_TYPES[type];
  if (!intervals) {
    console.warn(`[SonicPi] Unknown scale type: ${type}, using major`);
    return scale(root, "major", numOctaves);
  }
  const notes = [];
  for (let oct = 0; oct < numOctaves; oct++) {
    for (const interval of intervals) {
      notes.push(rootMidi + interval + oct * 12);
    }
  }
  notes.push(rootMidi + 12 * numOctaves);
  return new Ring(notes);
}
function chord_invert(notes, inversion) {
  const arr = Array.isArray(notes) ? [...notes] : notes.toArray();
  let inv = (inversion % arr.length + arr.length) % arr.length;
  for (let i2 = 0; i2 < inv; i2++) {
    const lowest = arr.shift();
    arr.push(lowest + 12);
  }
  return new Ring(arr);
}
function note(n) {
  return noteToMidi2(n);
}
function note_range(low, high) {
  const lo = noteToMidi2(low);
  const hi = noteToMidi2(high);
  const notes = [];
  const maxNotes = 1e4;
  for (let n = lo; n <= hi && notes.length < maxNotes; n++) {
    notes.push(n);
  }
  if (notes.length >= maxNotes) {
    console.warn("[SonicPi] note_range capped at 10000 notes");
  }
  return new Ring(notes);
}
function chord_degree(degreeVal, root, scaleType = "major", chordNumNotes = 3) {
  const idx = parseDegree(degreeVal);
  scale(root, scaleType);
  const scaleIntervals = SCALE_TYPES[scaleType] ?? SCALE_TYPES["major"];
  const len = scaleIntervals.length;
  if (idx < 0 || idx >= len) {
    console.warn(`[SonicPi] chord_degree index ${idx} out of range for scale ${scaleType}`);
    return chord(root, "major");
  }
  const rootMidi = noteToMidi2(root) + scaleIntervals[idx];
  const notes = [rootMidi];
  for (let i2 = 1; i2 < chordNumNotes; i2++) {
    const degIdx = (idx + i2 * 2) % len;
    const octOffset = Math.floor((idx + i2 * 2) / len) * 12;
    notes.push(noteToMidi2(root) + scaleIntervals[degIdx] + octOffset);
  }
  return new Ring(notes);
}
function degree(degreeVal, root, scaleType = "major") {
  const idx = parseDegree(degreeVal);
  const scaleIntervals = SCALE_TYPES[scaleType] ?? SCALE_TYPES["major"];
  const len = scaleIntervals.length;
  const octOffset = Math.floor(idx / len) * 12;
  const degIdx = (idx % len + len) % len;
  return noteToMidi2(root) + scaleIntervals[degIdx] + octOffset;
}
function parseDegree(d) {
  if (typeof d === "number") return d - 1;
  const roman = {
    i: 0,
    ii: 1,
    iii: 2,
    iv: 3,
    v: 4,
    vi: 5,
    vii: 6
  };
  return roman[d.toLowerCase()] ?? 0;
}
function chord_names() {
  return Object.keys(CHORD_TYPES);
}
function scale_names() {
  return Object.keys(SCALE_TYPES);
}

// ../../../sonicPiWeb/src/engine/ProgramBuilder.ts
var DEFAULT_LOOP_BUDGET = 1e5;
var InfiniteLoopError = class extends Error {
  constructor(message = "Infinite loop detected \u2014 did you forget a sleep?") {
    super(message);
    this.name = "InfiniteLoopError";
  }
};
var ProgramBuilder = class _ProgramBuilder {
  constructor(seed = 0, initialTicks) {
    this.steps = [];
    this.currentSynth = "beep";
    this.ticks = /* @__PURE__ */ new Map();
    this.densityFactor = 1;
    this.nextRef = 1;
    this._lastRef = 0;
    this._budgetRemaining = DEFAULT_LOOP_BUDGET;
    this._transpose = 0;
    this._synthDefaults = {};
    this._sampleDefaults = {};
    this._debug = true;
    this._argBpmScaling = true;
    this._currentBpm = 60;
    // --- Data constructors (pure, no side effects) ---
    this.ring = ring;
    this.knit = knit;
    this.range = range;
    this.line = line;
    this.spread = spread;
    this.chord = chord;
    this.scale = scale;
    this.chord_invert = chord_invert;
    this.note = note;
    this.note_range = note_range;
    this.noteToMidi = noteToMidi2;
    this.midiToFreq = midiToFreq5;
    // --- Wave 1 DSL additions ---
    this.hz_to_midi = hzToMidi;
    this.midi_to_hz = midiToFreq5;
    this.chord_degree = chord_degree;
    this.degree = degree;
    this.chord_names = chord_names;
    this.scale_names = scale_names;
    this.rng = new SeededRandom(seed);
    if (initialTicks) this.ticks = new Map(initialTicks);
  }
  /** Snapshot current tick state — saved by the engine between loop iterations. */
  getTicks() {
    return new Map(this.ticks);
  }
  get density() {
    return this.densityFactor;
  }
  set density(d) {
    this.densityFactor = d;
  }
  /** Returns the node reference of the last play() call, for use with control(). */
  get lastRef() {
    return this._lastRef;
  }
  play(noteVal, opts) {
    if (noteVal instanceof Ring || Array.isArray(noteVal)) {
      const notes = noteVal instanceof Ring ? noteVal.toArray() : noteVal;
      for (const n of notes) this._pushPlayStep(n, opts);
      return this;
    }
    this._pushPlayStep(noteVal, opts);
    return this;
  }
  _pushPlayStep(noteVal, opts) {
    if (noteVal === null || noteVal === void 0 || noteVal === "rest") return;
    const midi = (typeof noteVal === "string" ? noteToMidi2(noteVal) : noteVal) + this._transpose;
    const synth = opts?.synth;
    const srcLine = opts?._srcLine;
    const cleanOpts = { ...this._synthDefaults, ...opts };
    delete cleanOpts._srcLine;
    delete cleanOpts.synth;
    if (!this._argBpmScaling) cleanOpts._argBpmScaling = 0;
    this._lastRef = this.nextRef++;
    this.steps.push({
      tag: "play",
      note: midi,
      opts: cleanOpts,
      synth: synth ?? this.currentSynth,
      srcLine
    });
  }
  sleep(beats) {
    this.steps.push({ tag: "sleep", beats: beats / this.densityFactor });
    this._budgetRemaining = DEFAULT_LOOP_BUDGET;
    return this;
  }
  /** Alias for sleep — Sonic Pi accepts both. */
  wait(beats) {
    return this.sleep(beats);
  }
  /**
   * Decrement loop iteration budget. Throws InfiniteLoopError when budget
   * is exhausted. Injected by the transpiler at loop back-edges.
   */
  __checkBudget__() {
    if (--this._budgetRemaining <= 0) {
      throw new InfiniteLoopError();
    }
  }
  sample(name2, opts) {
    const srcLine = opts?._srcLine;
    const cleanOpts = { ...this._sampleDefaults, ...opts };
    delete cleanOpts._srcLine;
    if (!this._argBpmScaling) cleanOpts._argBpmScaling = 0;
    this.steps.push({ tag: "sample", name: name2, opts: cleanOpts, srcLine });
    return this;
  }
  use_synth(name2) {
    this.currentSynth = name2;
    this.steps.push({ tag: "useSynth", name: name2 });
    return this;
  }
  use_bpm(bpm) {
    this._currentBpm = bpm;
    this.steps.push({ tag: "useBpm", bpm });
    return this;
  }
  /** Set BPM to match a sample's natural tempo. */
  use_sample_bpm(name2, opts) {
    const dur = this.sample_duration(name2, opts);
    return this.use_bpm(60 / dur);
  }
  use_random_seed(seed) {
    this.rng.reset(seed);
    return this;
  }
  cue(name2, ...args2) {
    this.steps.push({ tag: "cue", name: name2, args: args2 });
    return this;
  }
  sync(name2) {
    this.steps.push({ tag: "sync", name: name2 });
    return this;
  }
  control(nodeRef, params) {
    const p = !this._argBpmScaling ? { ...params, _argBpmScaling: 0 } : params;
    this.steps.push({ tag: "control", nodeRef, params: p });
    return this;
  }
  with_fx(name2, optsOrFn, maybeFn) {
    let opts;
    let fn;
    if (typeof optsOrFn === "function") {
      opts = {};
      fn = optsOrFn;
    } else {
      opts = optsOrFn;
      fn = maybeFn;
    }
    const fxRef = this.nextRef++;
    this._lastRef = fxRef;
    const inner = new _ProgramBuilder(this.rng.next() * 4294967295);
    inner.currentSynth = this.currentSynth;
    inner.densityFactor = this.densityFactor;
    inner._argBpmScaling = this._argBpmScaling;
    inner._transpose = this._transpose;
    inner._synthDefaults = { ...this._synthDefaults };
    inner._sampleDefaults = { ...this._sampleDefaults };
    fn(inner, fxRef);
    const fxOpts = !this._argBpmScaling ? { ...opts, _argBpmScaling: 0 } : opts;
    this.steps.push({ tag: "fx", name: name2, opts: fxOpts, body: inner.build(), nodeRef: fxRef });
    return this;
  }
  in_thread(buildFn) {
    const inner = new _ProgramBuilder(this.rng.next() * 4294967295);
    inner.currentSynth = this.currentSynth;
    inner.densityFactor = this.densityFactor;
    inner._argBpmScaling = this._argBpmScaling;
    inner._transpose = this._transpose;
    inner._synthDefaults = { ...this._synthDefaults };
    inner._sampleDefaults = { ...this._sampleDefaults };
    buildFn(inner);
    this.steps.push({ tag: "thread", body: inner.build() });
    return this;
  }
  at(times, values, buildFn) {
    for (let i2 = 0; i2 < times.length; i2++) {
      const offset = times[i2];
      const val = values ? values[i2 % values.length] : i2;
      const inner = new _ProgramBuilder(this.rng.next() * 4294967295);
      inner.currentSynth = this.currentSynth;
      inner.densityFactor = this.densityFactor;
      inner._argBpmScaling = this._argBpmScaling;
      inner._transpose = this._transpose;
      inner._synthDefaults = { ...this._synthDefaults };
      inner._sampleDefaults = { ...this._sampleDefaults };
      if (offset > 0) inner.sleep(offset);
      buildFn(inner, val);
      this.steps.push({ tag: "thread", body: inner.build() });
    }
    return this;
  }
  live_audio(name2, opts) {
    this.steps.push({ tag: "liveAudio", name: name2, opts: opts ?? {} });
    return this;
  }
  stop() {
    this.steps.push({ tag: "stop" });
    return this;
  }
  /** Free a running synth node immediately. */
  kill(nodeRef) {
    this.steps.push({ tag: "kill", nodeRef });
    return this;
  }
  /** Emit an OSC message — the host provides the actual transport. */
  osc_send(host, port, path, ...args2) {
    this.steps.push({ tag: "oscSend", host, port, path, args: args2 });
    return this;
  }
  /** Play multiple notes simultaneously as a chord. */
  play_chord(notes, opts) {
    return this.play(notes, opts);
  }
  /** Play notes sequentially with sleep(1) between each. */
  play_pattern(notes, opts) {
    for (const n of notes) {
      this.play(n, opts);
      this.sleep(1);
    }
    return this;
  }
  /** Return the current synth name. */
  get current_synth_name() {
    return this.currentSynth;
  }
  /** Return the current synth defaults hash. */
  get current_synth_defaults_hash() {
    return { ...this._synthDefaults };
  }
  /** Return the current sample defaults hash. */
  get current_sample_defaults_hash() {
    return { ...this._sampleDefaults };
  }
  /** Deferred set — fires at runtime (interleaved with sleeps). */
  set(key, value) {
    this.steps.push({ tag: "set", key, value });
    return this;
  }
  puts(...args2) {
    const msg = args2.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
    this.steps.push({ tag: "print", message: msg });
    return this;
  }
  print(...args2) {
    return this.puts(...args2);
  }
  // --- Random (resolved eagerly at build time) ---
  rrand(min, max) {
    return this.rng.rrand(min, max);
  }
  rrand_i(min, max) {
    return this.rng.rrand_i(min, max);
  }
  rand(max = 1) {
    return this.rng.rrand(0, max);
  }
  rand_i(max = 2) {
    return this.rng.rrand_i(0, max - 1);
  }
  rand_look() {
    return this.rng.peek();
  }
  choose(arr) {
    return this.rng.choose(arr);
  }
  shuffle(arr) {
    const items = arr instanceof Ring ? arr.toArray() : [...arr];
    for (let i2 = items.length - 1; i2 > 0; i2--) {
      const j = this.rng.rrand_i(0, i2);
      [items[i2], items[j]] = [items[j], items[i2]];
    }
    return new Ring(items);
  }
  pick(arr, n = 1) {
    const items = arr instanceof Ring ? arr.toArray() : [...arr];
    const result = [];
    for (let i2 = 0; i2 < n; i2++) {
      result.push(items[Math.floor(this.rng.next() * items.length)]);
    }
    return new Ring(result);
  }
  /** Random distribution — returns a value between -max and +max. */
  rdist(max, centre = 0) {
    return centre + this.rng.rrand(-max, max);
  }
  dice(sides, bonus = 0) {
    return this.rng.dice(sides) + bonus;
  }
  one_in(n) {
    return this.rng.rrand_i(1, n) === 1;
  }
  // --- Tick (resolved at build time, per-builder counter) ---
  tick(name2 = "__default", opts) {
    const step = opts?.step ?? 1;
    const v = (this.ticks.get(name2) ?? -step) + step;
    this.ticks.set(name2, v);
    return v;
  }
  look(name2 = "__default", offset = 0) {
    return (this.ticks.get(name2) ?? 0) + offset;
  }
  /** Reset a named tick counter (or the default counter). */
  tick_reset(name2 = "__default") {
    this.ticks.delete(name2);
  }
  /** Reset ALL tick counters. */
  tick_reset_all() {
    this.ticks.clear();
  }
  // --- Transpose ---
  /** Set transpose offset (semitones) for all subsequent play calls. */
  use_transpose(semitones) {
    this._transpose = semitones;
    return this;
  }
  /** Temporarily set transpose for a block, then restore. */
  with_transpose(semitones, buildFn) {
    const prev = this._transpose;
    this._transpose = semitones;
    buildFn(this);
    this._transpose = prev;
    return this;
  }
  /** Temporarily shift by N octaves within block, then restore. */
  with_octave(octaves, buildFn) {
    const prev = this._transpose;
    this._transpose = prev + octaves * 12;
    buildFn(this);
    this._transpose = prev;
    return this;
  }
  /** Run block with a specific random seed, then restore. */
  with_random_seed(seed, buildFn) {
    const prevState = this.rng.getState();
    this.rng.reset(seed);
    buildFn(this);
    this.rng.setState(prevState);
    return this;
  }
  // --- Synth defaults ---
  /** Set default synthesis parameters for all subsequent play calls. */
  use_synth_defaults(opts) {
    this._synthDefaults = { ...opts };
    return this;
  }
  /** Set default sample parameters for all subsequent sample calls. */
  use_sample_defaults(opts) {
    this._sampleDefaults = { ...opts };
    return this;
  }
  /** Temporarily set synth defaults for a block, then restore. */
  with_synth_defaults(opts, buildFn) {
    const prev = this._synthDefaults;
    this._synthDefaults = { ...opts };
    buildFn(this);
    this._synthDefaults = prev;
    return this;
  }
  /** Temporarily set sample defaults for a block, then restore. */
  with_sample_defaults(opts, buildFn) {
    const prev = this._sampleDefaults;
    this._sampleDefaults = { ...opts };
    buildFn(this);
    this._sampleDefaults = prev;
    return this;
  }
  // --- BPM block ---
  /** Temporarily set BPM for a block. Sleeps inside are scaled. Restores previous BPM after. */
  with_bpm(bpm, buildFn) {
    const prev = this._currentBpm;
    this._currentBpm = bpm;
    this.steps.push({ tag: "useBpm", bpm });
    buildFn(this);
    this._currentBpm = prev;
    this.steps.push({ tag: "useBpm", bpm: prev });
    return this;
  }
  /** Temporarily set synth for a block, then restore. */
  with_synth(name2, buildFn) {
    const prev = this.currentSynth;
    this.currentSynth = name2;
    this.steps.push({ tag: "useSynth", name: name2 });
    buildFn(this);
    this.currentSynth = prev;
    this.steps.push({ tag: "useSynth", name: prev });
    return this;
  }
  // --- Debug ---
  /** Permanently set density factor — divides sleep times. */
  use_density(factor) {
    this.densityFactor = factor;
    return this;
  }
  /** Run block with density factor — divides sleep times. */
  with_density(factor, buildFn) {
    const prev = this.densityFactor;
    this.densityFactor = prev * factor;
    buildFn(this);
    this.densityFactor = prev;
    return this;
  }
  /** Enable/disable debug output. In browser, this is a no-op flag. */
  use_debug(enabled) {
    this._debug = enabled;
    return this;
  }
  /** Set schedule-ahead time to 0 for this thread — responsive MIDI input (#149). */
  use_real_time() {
    this.steps.push({ tag: "useRealTime" });
    return this;
  }
  /**
   * Control whether time params (release, attack, phase, etc.) are automatically
   * BPM-scaled. Default: true (matching Desktop Sonic Pi).
   * With false, time params are treated as seconds, not beats.
   */
  use_arg_bpm_scaling(enabled) {
    this._argBpmScaling = enabled;
    return this;
  }
  /** Temporarily set arg_bpm_scaling for a block, then restore. */
  with_arg_bpm_scaling(enabled, buildFn) {
    const prev = this._argBpmScaling;
    this._argBpmScaling = enabled;
    buildFn(this);
    this._argBpmScaling = prev;
    return this;
  }
  // --- Utility functions ---
  /**
   * Returns true if `val` is divisible by `factor`.
   * Sonic Pi's `factor?(val, factor)` → `val % factor === 0`
   */
  factor_q(val, factor) {
    return val % factor === 0;
  }
  /**
   * Create a ring of booleans from 0/1 values.
   * `bools(1,0,1,0)` → Ring([true, false, true, false])
   */
  bools(...values) {
    return new Ring(values.map((v) => v !== 0));
  }
  /**
   * Play a sequence of notes with timed intervals.
   * `play_pattern_timed [:c4, :e4, :g4], [0.5, 0.25]`
   */
  play_pattern_timed(notes, times, opts) {
    const timeArr = Array.isArray(times) ? times : [times];
    for (let i2 = 0; i2 < notes.length; i2++) {
      this.play(notes[i2], opts);
      if (i2 < notes.length - 1) {
        this.sleep(timeArr[i2 % timeArr.length]);
      }
    }
    return this;
  }
  /**
   * Get the duration of a sample in beats. Stub: returns 1.
   * Real implementation needs SuperSonic bridge access.
   */
  sample_duration(_name, _opts) {
    return 1;
  }
  noteToFreq(n) {
    return midiToFreq5(noteToMidi2(n));
  }
  /** Round val to nearest multiple of step. */
  quantise(val, step) {
    return Math.round(val / step) * step;
  }
  /** Alias for quantise (US spelling). */
  quantize(val, step) {
    return this.quantise(val, step);
  }
  /** Generate a ring of notes spanning n octaves from root. */
  octs(note2, numOctaves = 1) {
    return new Ring(Array.from({ length: numOctaves }, (_, i2) => note2 + i2 * 12));
  }
  /** Build the final Program. */
  build() {
    return [...this.steps];
  }
};

// ../../../sonicPiWeb/src/engine/config.ts
var MIXER = {
  /** [TAU] Mixer pre-amplification. Desktop SP uses 0.2 but needs driver attenuation.
   *  Sonic Tau uses 0.3 for browser WASM context (app.bundle.js:1787). */
  PRE_AMP: 0.3,
  /** [TUNED] Mixer final amplification. Desktop SP uses 6 (clips in WASM).
   *  Sonic Tau uses 0.8 (too quiet). A/B tuned to 1.2 for balanced dynamics. */
  AMP: 1.2,
  /** [TAU] High-pass filter cutoff (Hz). Removes subsonic rumble that can
   *  damage speakers. Desktop SP uses synthdef default. Sonic Tau sends 21
   *  explicitly (app.bundle.js:1788-1789). */
  HPF: 21,
  /** [TAU] Low-pass filter cutoff (MIDI note). Removes ultrasonic content that
   *  causes aliasing. Desktop SP uses synthdef default. Sonic Tau sends 135.5
   *  explicitly (app.bundle.js:1790-1791). */
  LPF: 135.5,
  /** [TAU] Limiter bypass flag. 0 = limiter active (Limiter.ar threshold=0.99,
   *  lookahead=10ms). Prevents hard clipping. Sonic Tau sends 0 explicitly
   *  (app.bundle.js:1792-1793). */
  LIMITER_BYPASS: 0
};
var AUDIO_IO = {
  /** [SP] Maximum stereo track outputs beyond master. Each track gets a
   *  stereo pair for per-track level metering and visualization. */
  MAX_TRACK_OUTPUTS: 6,
  /** [SP] FFT size for AnalyserNode. Higher = more frequency resolution,
   *  more latency. 2048 is standard for music visualization. */
  ANALYSER_FFT_SIZE: 2048,
  /** [SP] Smoothing constant for AnalyserNode frequency data.
   *  0 = no smoothing (jumpy), 1 = frozen. 0.8 = smooth for UI. */
  ANALYSER_SMOOTHING: 0.8};
var PARAM_RANGES = {
  // Amplitude & panning
  amp: [0, null],
  // v_positive(:amp) — no upper clamp (compression handles it)
  pan: [-1, 1],
  // v_between_inclusive(:pan, -1, 1)
  pre_amp: [0, null],
  // v_positive(:pre_amp)
  // ADSR envelope
  attack: [0, null],
  // v_positive(:attack)
  decay: [0, null],
  // v_positive(:decay)
  sustain: [0, null],
  // v_positive(:sustain)
  release: [0, null],
  // v_positive(:release)
  attack_level: [0, null],
  // v_positive(:attack_level)
  decay_level: [0, null],
  // v_positive(:decay_level)
  sustain_level: [0, null],
  // v_positive(:sustain_level)
  // Filters
  cutoff: [0, 130],
  // v_positive(:cutoff), v_less_than(:cutoff, 131)
  lpf: [0, 130],
  // same as cutoff (alias)
  hpf: [0, 130],
  // same range
  res: [0, 1],
  // v_positive(:res), v_less_than(:res, 1)
  // FX
  mix: [0, 1],
  // v_between_inclusive(:mix, 0, 1)
  pre_mix: [0, 1],
  // v_between_inclusive(:pre_mix, 0, 1)
  room: [0, 1],
  // v_between_inclusive(:room, 0, 1)
  damp: [0, 1],
  // v_between_inclusive(:damp, 0, 1)
  // Modulation
  mod_phase_offset: [0, 1],
  // v_between_inclusive(:mod_phase_offset, 0, 1)
  pulse_width: [0, 1],
  // v_between_exclusive(:pulse_width, 0, 1)
  dpulse_width: [0, 1],
  // v_between_exclusive(:dpulse_width, 0, 1)
  mod_pulse_width: [0, 1],
  // v_between_exclusive(:mod_pulse_width, 0, 1)
  // Timing (pre-BPM-scaling, so in beats)
  phase: [0, null],
  // v_positive(:phase)
  mod_phase: [0, null],
  // v_positive(:mod_phase)
  // Sample playback
  rate: [null, null],
  // no range (negative = reverse)
  start: [0, 1],
  // v_between_inclusive(:start, 0, 1)
  finish: [0, 1],
  // v_between_inclusive(:finish, 0, 1)
  // Slide times
  amp_slide: [0, null],
  // v_positive(:amp_slide)
  pan_slide: [0, null],
  // v_positive(:pan_slide)
  cutoff_slide: [0, null],
  // v_positive(:cutoff_slide)
  // Piano/pluck specific
  vel: [0, 1],
  // v_between_inclusive(:vel, 0, 1)
  hard: [0, 1],
  // v_between_inclusive(:hard, 0, 1)
  stereo_width: [0, 1],
  // v_between_inclusive(:stereo_width, 0, 1)
  coef: [-1, 1]
  // v_between_inclusive(:coef, -1, 1)
};

// ../../../sonicPiWeb/src/engine/SoundLayer.ts
var SYNTH_NAME_ALIASES = {
  sine: "beep",
  // synthinfo.rb:9614 — :sine => Beep.new
  mod_beep: "mod_sine"
  // synthinfo.rb — :mod_beep => ModSine.new
};
function resolveSynthName(name2) {
  return SYNTH_NAME_ALIASES[name2] ?? name2;
}
var TIME_PARAMS = /* @__PURE__ */ new Set([
  // ADSR envelope
  "attack",
  "decay",
  "sustain",
  "release",
  // tb303 filter envelope
  "cutoff_attack",
  "cutoff_decay",
  "cutoff_sustain",
  "cutoff_release",
  // FX time params — tagged :bpm_scale => true in Sonic Pi's synthinfo.rb.
  // echo/delay/ping_pong: phase, max_phase
  // slicer/wobble/tremolo/panslicer/ixi_techno/flanger: phase
  // flanger: delay
  "phase",
  "max_phase",
  "pre_delay",
  "delay",
  // Mod synths: modulation rate (mod_saw, mod_tri, mod_pulse, etc.)
  "mod_phase"
]);
var FX_TIME_DEFAULTS = {
  echo: { phase: 0.25, decay: 2, max_phase: 2 },
  delay: { phase: 0.25, decay: 2, max_phase: 2 },
  // same as echo — synthinfo.rb FXDelay
  slicer: { phase: 0.25 },
  wobble: { phase: 0.5 },
  panslicer: { phase: 0.25 },
  ixi_techno: { phase: 4 },
  flanger: { phase: 4 },
  tremolo: { phase: 4 },
  ping_pong: { phase: 0.25, max_phase: 1 },
  chorus: { decay: 1e-5, max_phase: 1 }
};
var SYNTH_TIME_DEFAULTS_BASE = {
  release: 1
};
var SYNTH_TIME_DEFAULTS_OVERRIDE = {
  dark_sea_horn: { attack: 1, release: 4 },
  growl: { attack: 0.1, release: 1 },
  hoover: { attack: 0.05, release: 1 },
  rhodey: { attack: 1e-3, decay: 1, release: 1 },
  organ_tonewheel: { attack: 0.01, sustain: 1, release: 0.01 },
  gabberkick: { attack: 1e-3, decay: 0.01, sustain: 0.3, release: 0.02 },
  singer: { attack: 1, release: 4 },
  kalimba: { sustain: 4, release: 1 },
  rodeo: { decay: 1, sustain: 0.8, release: 1 },
  zawa: { phase: 1, release: 1 },
  synth_violin: { release: 1 },
  piano: { release: 1 },
  pluck: { release: 1 },
  pretty_bell: { release: 1 },
  winwood_lead: { release: 1 },
  // Mod synths: mod_phase needs injection at non-60 BPM
  mod_saw: { release: 1, mod_phase: 0.25 },
  mod_dsaw: { release: 1, mod_phase: 0.25 },
  mod_sine: { release: 1, mod_phase: 0.25 },
  mod_beep: { release: 1, mod_phase: 0.25 },
  mod_tri: { release: 1, mod_phase: 0.25 },
  mod_pulse: { release: 1, mod_phase: 0.25 },
  mod_fm: { release: 1, mod_phase: 0.25 },
  // SC808 drums — each has unique decay default (no release, decay controls length)
  sc808_bassdrum: { decay: 2 },
  sc808_snare: { decay: 4.2 },
  sc808_clap: {},
  // no non-zero time defaults
  sc808_open_hihat: { decay: 0.5 },
  sc808_closed_hihat: { decay: 0.42 },
  sc808_cowbell: { decay: 9.5 },
  sc808_tom_lo: { decay: 4 },
  sc808_tom_mid: { decay: 16 },
  sc808_tom_hi: { decay: 11 },
  sc808_maracas: { decay: 0.1 },
  sc808_claves: { decay: 0.1 },
  sc808_rimshot: { decay: 0.07 },
  sc808_open_cymbal: { decay: 2 },
  sc808_conga_lo: { decay: 18 },
  sc808_conga_mid: { decay: 9 },
  sc808_conga_hi: { decay: 6 }
};
var SYMBOL_DEFAULTS = [
  ["decay_level", "sustain_level"]
];
var STRIP_PARAMS = /* @__PURE__ */ new Set([
  "on",
  // conditional trigger flag — should_trigger? mutates args_h
  "slide",
  // global slide propagation (expanded before stripping)
  "duration",
  // converted to sustain by calculateSustain before stripping
  "beat_stretch",
  // handled by translateSampleOpts before this stage
  "pitch_stretch",
  "rpitch",
  "_argBpmScaling",
  // use_arg_bpm_scaling flag — consumed by normalize, not sent to scsynth
  "reps",
  // with_fx repeat count — consumed by AudioInterpreter
  "kill_delay"
  // with_fx kill delay — consumed by AudioInterpreter
]);
var SLIDE_PARAMS = [
  "amp_slide",
  "pan_slide",
  "cutoff_slide",
  "lpf_slide",
  "hpf_slide",
  "res_slide",
  "note_slide",
  "pitch_slide",
  "attack_slide",
  "decay_slide",
  "sustain_slide",
  "release_slide"
];
var SYNTH_ALIASES = {
  sc808_snare: [["cutoff", "lpf"]],
  sc808_clap: [["cutoff", "lpf"]],
  dpulse: [["dpulse_width", "pulse_width"]]
};
function normalizePlayParams(synthName, params, bpm, warnFn) {
  const shouldScaleBpm = !("_argBpmScaling" in params && !params._argBpmScaling);
  let p = { ...params };
  p = calculateSustain(p);
  p = expandSlideParam(p);
  p = stripNonScynthParams(p);
  p = resolveSymbolDefaults(p);
  p = injectMandatoryDefaults(p);
  p = injectSynthTimeDefaults(synthName, p);
  p = aliasSynthParams(synthName, p);
  p = mungeSynthOpts(synthName, p);
  p = validateAndClamp(p);
  if (shouldScaleBpm) p = scaleTimeParamsToBpm(p, bpm);
  return p;
}
function normalizeSampleParams(params, bpm, warnFn) {
  const shouldScaleBpm = !("_argBpmScaling" in params && !params._argBpmScaling);
  let p = { ...params };
  p = calculateSustain(p);
  p = expandSlideParam(p);
  p = stripNonScynthParams(p);
  p = injectSampleDefaults(p);
  p = validateAndClamp(p);
  if (shouldScaleBpm) p = scaleTimeParamsToBpm(p, bpm);
  return p;
}
function normalizeControlParams(params, bpm, warnFn) {
  const shouldScaleBpm = !("_argBpmScaling" in params && !params._argBpmScaling);
  let p = { ...params };
  p = stripNonScynthParams(p);
  p = validateAndClamp(p);
  if (shouldScaleBpm) p = scaleTimeParamsToBpm(p, bpm);
  return p;
}
function normalizeFxParams(fxName, params, bpm, warnFn) {
  const shouldScaleBpm = !("_argBpmScaling" in params && !params._argBpmScaling);
  let p = { ...params };
  p = stripNonScynthParams(p);
  p = resolveSymbolDefaults(p);
  p = injectFxTimeDefaults(fxName, p);
  p = validateAndClamp(p);
  if (shouldScaleBpm) p = scaleTimeParamsToBpm(p, bpm);
  return p;
}
function calculateSustain(params) {
  if (!("duration" in params)) return params;
  if ("sustain" in params) return params;
  const duration = params.duration;
  const attack = params.attack ?? 0;
  const decay = params.decay ?? 0;
  const release = params.release ?? 1;
  const sustain = Math.max(0, duration - attack - decay - release);
  const p = { ...params };
  p.sustain = sustain;
  return p;
}
function expandSlideParam(params) {
  if (!("slide" in params)) return params;
  const slideValue = params.slide;
  const p = { ...params };
  for (const key of SLIDE_PARAMS) {
    if (!(key in p)) p[key] = slideValue;
  }
  return p;
}
function stripNonScynthParams(params) {
  for (const key of STRIP_PARAMS) {
    if (key in params) {
      const p = { ...params };
      for (const k of STRIP_PARAMS) delete p[k];
      return p;
    }
  }
  return params;
}
function resolveSymbolDefaults(params) {
  let p = params;
  for (const [param, targetParam] of SYMBOL_DEFAULTS) {
    if (!(param in p) && targetParam in p) {
      if (p === params) p = { ...params };
      p[param] = p[targetParam];
    }
  }
  return p;
}
function injectMandatoryDefaults(params) {
  return params;
}
function injectSynthTimeDefaults(synthName, params) {
  const name2 = synthName.replace(/^sonic-pi-/, "");
  const defaults = SYNTH_TIME_DEFAULTS_OVERRIDE[name2] ?? SYNTH_TIME_DEFAULTS_BASE;
  let p = params;
  for (const [key, val] of Object.entries(defaults)) {
    if (!(key in p)) {
      if (p === params) p = { ...params };
      p[key] = val;
    }
  }
  return p;
}
function injectFxTimeDefaults(fxName, params) {
  const name2 = fxName.replace(/^(sonic-pi-)?fx_/, "");
  const defaults = FX_TIME_DEFAULTS[name2];
  if (!defaults) return params;
  let p = params;
  for (const [key, val] of Object.entries(defaults)) {
    if (!(key in p)) {
      if (p === params) p = { ...params };
      p[key] = val;
    }
  }
  return p;
}
function injectSampleDefaults(params) {
  const hasEnvelope = "attack" in params || "decay" in params || "sustain" in params || "release" in params;
  if (hasEnvelope) {
    const p = { ...params };
    if (!("pre_amp" in p)) p.pre_amp = 1;
    return p;
  }
  return params;
}
function aliasSynthParams(synthName, params) {
  const name2 = synthName.replace(/^sonic-pi-/, "");
  const aliases = SYNTH_ALIASES[name2];
  if (!aliases) return params;
  let p = params;
  for (const [from, to] of aliases) {
    if (from in p && !(to in p)) {
      if (p === params) p = { ...params };
      p[to] = p[from];
      delete p[from];
    }
  }
  return p;
}
function mungeSynthOpts(synthName, params) {
  const name2 = synthName.replace(/^sonic-pi-/, "");
  if (name2 === "tb303") {
    const p = { ...params };
    if (p.attack != null && p.cutoff_attack == null) p.cutoff_attack = p.attack;
    if (p.decay != null && p.cutoff_decay == null) p.cutoff_decay = p.decay;
    if (p.sustain != null && p.cutoff_sustain == null) p.cutoff_sustain = p.sustain;
    if (p.release != null && p.cutoff_release == null) p.cutoff_release = p.release;
    if (p.cutoff_min == null) p.cutoff_min = 30;
    return p;
  }
  return params;
}
function validateAndClamp(params, warnFn) {
  let p = params;
  for (const key of Object.keys(params)) {
    const range2 = PARAM_RANGES[key];
    if (!range2) continue;
    const [min, max] = range2;
    const val = p[key];
    if (val < 0 && TIME_PARAMS.has(key)) continue;
    if (min !== null && val < min) {
      if (p === params) p = { ...params };
      p[key] = min;
    } else if (max !== null && val > max) {
      if (p === params) p = { ...params };
      p[key] = max;
    }
  }
  return p;
}
function scaleTimeParamsToBpm(params, bpm) {
  if (bpm === 60) return params;
  const factor = 60 / bpm;
  let p = params;
  for (const key of Object.keys(params)) {
    if (TIME_PARAMS.has(key) || key.endsWith("_slide")) {
      if (p[key] < 0) continue;
      if (p === params) p = { ...params };
      p[key] = p[key] * factor;
    }
  }
  return p;
}
function translateSampleOpts(opts, bpm, sampleDuration) {
  if (!opts) return {};
  const result = {};
  for (const [key, value] of Object.entries(opts)) {
    switch (key) {
      case "beat_stretch": {
        const existingRate = result["rate"] ?? 1;
        if (sampleDuration !== null) {
          result["rate"] = 1 / value * existingRate * (bpm / (60 / sampleDuration));
        } else {
          result["rate"] = existingRate / value;
        }
        break;
      }
      case "pitch_stretch": {
        const existingRate = result["rate"] ?? 1;
        const existingPitch = result["pitch"] ?? 0;
        if (sampleDuration !== null) {
          const newRate = 1 / value * (bpm / (60 / sampleDuration));
          const pitchShift = 12 * Math.log2(newRate);
          result["rate"] = newRate * existingRate;
          result["pitch"] = existingPitch - pitchShift;
        } else {
          result["rate"] = existingRate / value;
        }
        break;
      }
      case "rpitch":
        result["rate"] = (result["rate"] ?? 1) * Math.pow(2, value / 12);
        break;
      // Sonic Pi aliases: sample players use 'lpf'/'hpf', not 'cutoff'
      case "cutoff":
        result["lpf"] = value;
        break;
      case "cutoff_slide":
        result["lpf_slide"] = value;
        break;
      default:
        result[key] = value;
        break;
    }
  }
  return result;
}
var SIMPLE_SAMPLER_ARGS = /* @__PURE__ */ new Set([
  "amp",
  "amp_slide",
  "amp_slide_shape",
  "amp_slide_curve",
  "pan",
  "pan_slide",
  "pan_slide_shape",
  "pan_slide_curve",
  "cutoff",
  "cutoff_slide",
  "cutoff_slide_shape",
  "cutoff_slide_curve",
  "lpf",
  "lpf_slide",
  "lpf_slide_shape",
  "lpf_slide_curve",
  "hpf",
  "hpf_slide",
  "hpf_slide_shape",
  "hpf_slide_curve",
  "rate",
  "slide",
  "beat_stretch",
  "rpitch",
  "attack",
  "decay",
  "sustain",
  "release",
  "attack_level",
  "decay_level",
  "sustain_level",
  "env_curve",
  // Internal params (stripped before sending to scsynth)
  "on",
  "duration",
  "pitch_stretch",
  // Our internal params
  "_srcLine",
  "out_bus",
  "_argBpmScaling"
]);
function selectSamplePlayer(opts) {
  if (!opts) return "sonic-pi-basic_stereo_player";
  for (const key of Object.keys(opts)) {
    if (!SIMPLE_SAMPLER_ARGS.has(key)) {
      return "sonic-pi-stereo_player";
    }
  }
  return "sonic-pi-basic_stereo_player";
}

// ../../../sonicPiWeb/src/engine/interpreters/AudioInterpreter.ts
var NOTE_EVENT_VISUAL_DURATION = 0.25;
var SAMPLE_EVENT_VISUAL_DURATION = 0.5;
async function runProgram(program, ctx, fxCounter) {
  if (!fxCounter) fxCounter = { value: 0 };
  let currentSynth = "beep";
  let currentBpm = ctx.scheduler.getTask(ctx.taskId)?.bpm ?? 60;
  let nextNodeRef = 1;
  for (const step of program) {
    const task = ctx.scheduler.getTask(ctx.taskId);
    if (!task?.running) break;
    switch (step.tag) {
      case "play": {
        if ("on" in step.opts && !step.opts.on) break;
        const audioTime = task.virtualTime + ctx.schedAheadTime;
        const synth = resolveSynthName(step.synth ?? currentSynth);
        const nodeRef = nextNodeRef++;
        if (ctx.bridge) {
          if ((synth === "sound_in" || synth === "sound_in_stereo") && !ctx.bridge.isLiveAudioStreaming(synth)) {
            ctx.bridge.startLiveAudio(synth, { stereo: synth === "sound_in_stereo" }).catch((err2) => ctx.printHandler?.(`Mic input failed: ${err2.message}`));
          }
          step.opts.note = step.note;
          const params = normalizePlayParams(synth, step.opts, currentBpm);
          params.out_bus = task.outBus;
          ctx.bridge.triggerSynth(synth, audioTime, params).then((realNodeId) => ctx.nodeRefMap.set(nodeRef, realNodeId)).catch((err2) => {
            ctx.printHandler?.(`Synth '${synth}' failed: ${err2.message}`);
          });
        }
        const audioCtxTime = ctx.bridge?.audioContext?.currentTime ?? 0;
        ctx.eventStream.emitEvent({
          audioTime,
          audioDuration: NOTE_EVENT_VISUAL_DURATION,
          scheduledAheadMs: (audioTime - audioCtxTime) * 1e3,
          midiNote: step.note,
          s: synth,
          srcLine: step.srcLine ?? null,
          trackId: ctx.taskId
        });
        break;
      }
      case "sample": {
        if (step.opts && "on" in step.opts && !step.opts.on) break;
        const audioTime = task.virtualTime + ctx.schedAheadTime;
        if (ctx.bridge) {
          const sampleOpts = task.outBus !== 0 ? { ...step.opts, out_bus: task.outBus } : step.opts;
          ctx.bridge.playSample(step.name, audioTime, sampleOpts, currentBpm).catch((err2) => {
            ctx.printHandler?.(`Sample '${step.name}' failed: ${err2.message}`);
          });
        }
        const audioCtxTime = ctx.bridge?.audioContext?.currentTime ?? 0;
        ctx.eventStream.emitEvent({
          audioTime,
          audioDuration: SAMPLE_EVENT_VISUAL_DURATION,
          scheduledAheadMs: (audioTime - audioCtxTime) * 1e3,
          midiNote: null,
          s: step.name,
          srcLine: step.srcLine ?? null,
          trackId: ctx.taskId
        });
        break;
      }
      case "sleep":
        ctx.bridge?.flushMessages();
        await ctx.scheduler.scheduleSleep(ctx.taskId, step.beats);
        break;
      case "useSynth":
        currentSynth = resolveSynthName(step.name);
        if (task) task.currentSynth = currentSynth;
        break;
      case "useBpm":
        currentBpm = step.bpm;
        if (task) task.bpm = step.bpm;
        break;
      case "useRealTime":
        ctx.schedAheadTime = 0;
        break;
      case "control": {
        const realNodeId = ctx.nodeRefMap.get(step.nodeRef);
        if (realNodeId && ctx.bridge) {
          const audioTime = task.virtualTime + ctx.schedAheadTime;
          const normalized = normalizeControlParams(step.params, currentBpm);
          const paramList = [];
          for (const [k, v] of Object.entries(normalized)) {
            paramList.push(k, v);
          }
          ctx.bridge.sendTimedControl(audioTime, realNodeId, paramList);
        }
        break;
      }
      case "kill": {
        const killNodeId = ctx.nodeRefMap.get(step.nodeRef);
        if (killNodeId && ctx.bridge) {
          ctx.bridge.freeNode(killNodeId);
        }
        break;
      }
      case "cue":
        ctx.scheduler.fireCue(step.name, ctx.taskId, step.args ?? []);
        break;
      case "set":
        if (ctx.globalStore) {
          ctx.globalStore.set(step.key, step.value);
        }
        break;
      case "sync":
        ctx.bridge?.flushMessages();
        await ctx.scheduler.waitForSync(step.name, ctx.taskId);
        break;
      case "fx": {
        const reps = step.opts.reps ?? 1;
        if (!ctx.bridge) {
          for (let rep = 0; rep < reps; rep++) await runProgram(step.body, ctx, fxCounter);
          break;
        }
        const fxIndex = fxCounter.value++;
        const fxKey = `${ctx.taskId}:fx${fxIndex}`;
        const prevOutBus = task.outBus;
        const existing = ctx.reusableFx.get(fxKey);
        if (existing) {
          if (existing.killTimer) {
            clearTimeout(existing.killTimer);
            existing.killTimer = void 0;
          }
          if (step.nodeRef && existing.nodeId !== void 0) {
            ctx.nodeRefMap.set(step.nodeRef, existing.nodeId);
          }
          task.outBus = existing.bus;
          try {
            for (let rep = 0; rep < reps; rep++) await runProgram(step.body, ctx, fxCounter);
          } finally {
            task.outBus = prevOutBus;
            ctx.bridge.flushMessages();
            const killDelay = step.opts.kill_delay ?? 1;
            existing.killTimer = setTimeout(() => {
              ctx.bridge.freeGroup(existing.groupId);
              ctx.bridge.freeBus(existing.bus);
              ctx.reusableFx.delete(fxKey);
            }, killDelay * 1e3);
          }
        } else {
          const newBus = ctx.bridge.allocateBus();
          const fxGroupId = ctx.bridge.createFxGroup();
          let fxNodeId;
          try {
            const audioTime = task.virtualTime + ctx.schedAheadTime;
            const fxOpts = normalizeFxParams(step.name, step.opts, currentBpm);
            fxNodeId = await ctx.bridge.applyFx(step.name, audioTime, fxOpts, newBus, prevOutBus);
            if (step.nodeRef && fxNodeId !== void 0) {
              ctx.nodeRefMap.set(step.nodeRef, fxNodeId);
            }
            task.outBus = newBus;
            ctx.bridge.flushMessages();
            const state4 = {
              bus: newBus,
              groupId: fxGroupId,
              nodeId: fxNodeId,
              outBus: prevOutBus
            };
            ctx.reusableFx.set(fxKey, state4);
            for (let rep = 0; rep < reps; rep++) await runProgram(step.body, ctx, fxCounter);
          } finally {
            task.outBus = prevOutBus;
            ctx.bridge.flushMessages();
            const killDelay = step.opts.kill_delay ?? 1;
            const state4 = ctx.reusableFx.get(fxKey);
            if (state4) {
              state4.killTimer = setTimeout(() => {
                ctx.bridge.freeGroup(state4.groupId);
                ctx.bridge.freeBus(state4.bus);
                ctx.reusableFx.delete(fxKey);
              }, killDelay * 1e3);
            }
          }
        }
        break;
      }
      case "thread": {
        const task2 = ctx.scheduler.getTask(ctx.taskId);
        if (!task2) break;
        const threadName = `${ctx.taskId}__thread_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const threadBody = step.body;
        ctx.scheduler.registerLoop(threadName, async () => {
          await runProgram(threadBody, {
            ...ctx,
            taskId: threadName
          });
          const t = ctx.scheduler.getTask(threadName);
          if (t) t.running = false;
        }, {
          bpm: task2.bpm,
          synth: task2.currentSynth,
          outBus: task2.outBus
        });
        break;
      }
      case "liveAudio": {
        if (ctx.bridge) {
          ctx.bridge.startLiveAudio(step.name, { stereo: !!step.opts.stereo }).catch((err2) => ctx.printHandler?.(`live_audio failed: ${err2.message}`));
        }
        break;
      }
      case "oscSend":
        if (ctx.oscHandler) {
          ctx.oscHandler(step.host, step.port, step.path, ...step.args);
        } else {
          ctx.printHandler?.(`[Warning] osc_send: no handler set \u2014 message to ${step.host}:${step.port}${step.path} dropped`);
        }
        break;
      case "print":
        ctx.printHandler?.(step.message);
        break;
      case "stop":
        ctx.bridge?.flushMessages();
        if (task) task.running = false;
        return;
    }
  }
  ctx.bridge?.flushMessages();
}

// ../../../sonicPiWeb/src/engine/interpreters/QueryInterpreter.ts
function queryProgram(program, begin, end, bpm, startTime = 0) {
  const events = [];
  let time = startTime;
  let currentSynth = "beep";
  let currentBpm = bpm;
  const beatDuration = () => 60 / currentBpm;
  for (const step of program) {
    if (time > end) break;
    switch (step.tag) {
      case "play":
        if (time >= begin) {
          events.push({
            type: "synth",
            time,
            duration: (step.opts.release ?? 0.25) * beatDuration(),
            params: { synth: step.synth ?? currentSynth, note: step.note, ...step.opts }
          });
        }
        break;
      case "sample":
        if (time >= begin) {
          events.push({
            type: "sample",
            time,
            duration: null,
            // real duration depends on sample file
            params: { name: step.name, ...step.opts }
          });
        }
        break;
      case "sleep":
        time += step.beats * beatDuration();
        break;
      case "useSynth":
        currentSynth = step.name;
        break;
      case "useBpm":
        currentBpm = step.bpm;
        break;
      case "fx": {
        const fxEvents = queryProgram(step.body, begin, end, currentBpm, time);
        events.push(...fxEvents);
        const fxResult = programDurationAndBpm(step.body, currentBpm);
        time += fxResult.duration;
        currentBpm = fxResult.finalBpm;
        break;
      }
      case "thread": {
        const threadEvents = queryProgram(step.body, begin, end, currentBpm, time);
        events.push(...threadEvents);
        break;
      }
      case "stop":
        return events;
    }
  }
  return events;
}
function programDurationAndBpm(program, bpm) {
  let dur = 0;
  let currentBpm = bpm;
  for (const step of program) {
    if (step.tag === "sleep") dur += step.beats * (60 / currentBpm);
    if (step.tag === "useBpm") currentBpm = step.bpm;
    if (step.tag === "fx") {
      const inner = programDurationAndBpm(step.body, currentBpm);
      dur += inner.duration;
      currentBpm = inner.finalBpm;
    }
  }
  return { duration: dur, finalBpm: currentBpm };
}
function programDuration(program, bpm) {
  return programDurationAndBpm(program, bpm).duration;
}
function queryLoopProgram(input, begin, end, bpm) {
  const isFactory = typeof input === "function";
  let ticks;
  let firstProgram;
  if (isFactory) {
    const result = input(void 0, 0);
    firstProgram = result.program;
    ticks = result.ticks;
  } else {
    firstProgram = input;
  }
  const iterDuration = programDuration(firstProgram, bpm);
  if (iterDuration <= 0) return [];
  const events = [];
  const firstIter = Math.floor(begin / iterDuration);
  const lastIter = Math.ceil(end / iterDuration);
  for (let i2 = firstIter; i2 <= lastIter; i2++) {
    const iterStart = i2 * iterDuration;
    let program;
    if (isFactory && i2 > firstIter) {
      const result = input(ticks, i2);
      program = result.program;
      ticks = result.ticks;
    } else {
      program = firstProgram;
    }
    const iterEvents = queryProgram(program, begin, end, bpm, iterStart);
    events.push(...iterEvents);
  }
  return events.sort((a, b) => a.time - b.time);
}

// ../../../sonicPiWeb/src/engine/osc.ts
var NTP_EPOCH_OFFSET = 2208988800;
function audioTimeToNTP(audioTime, audioCtxCurrentTime) {
  const wallNow = (performance.timeOrigin + performance.now()) / 1e3;
  const delta = audioTime - audioCtxCurrentTime;
  return wallNow + delta + NTP_EPOCH_OFFSET;
}
function pad4(n) {
  return n + 3 & -4;
}
var SINGLE_BUF = new ArrayBuffer(4096);
var SINGLE_DV = new DataView(SINGLE_BUF);
var MSG_BUF = new ArrayBuffer(4096);
var MSG_DV = new DataView(MSG_BUF);
var MULTI_BUF = new ArrayBuffer(65536);
var MULTI_DV = new DataView(MULTI_BUF);
function writeString2(dv, off, s) {
  const start2 = off;
  for (let i2 = 0; i2 < s.length; i2++) dv.setUint8(off++, s.charCodeAt(i2));
  const end = start2 + pad4(s.length + 1);
  while (off < end) dv.setUint8(off++, 0);
  return off;
}
function writeNTP(dv, off, ntpTime) {
  const secs = Math.floor(ntpTime) >>> 0;
  const frac = (ntpTime - Math.floor(ntpTime)) * 4294967296 >>> 0;
  dv.setUint32(off, secs, false);
  off += 4;
  dv.setUint32(off, frac, false);
  off += 4;
  return off;
}
function writeBundleTag(dv, off) {
  dv.setUint8(off++, 35);
  dv.setUint8(off++, 98);
  dv.setUint8(off++, 117);
  dv.setUint8(off++, 110);
  dv.setUint8(off++, 100);
  dv.setUint8(off++, 108);
  dv.setUint8(off++, 101);
  dv.setUint8(off++, 0);
  return off;
}
function writeArgs(dv, off, args2) {
  let types = ",";
  for (let i2 = 0; i2 < args2.length; i2++) {
    const a = args2[i2];
    types += typeof a === "string" ? "s" : Number.isInteger(a) ? "i" : "f";
  }
  off = writeString2(dv, off, types);
  for (let i2 = 0; i2 < args2.length; i2++) {
    const a = args2[i2];
    if (typeof a === "string") {
      off = writeString2(dv, off, a);
    } else if (Number.isInteger(a)) {
      dv.setInt32(off, a, false);
      off += 4;
    } else {
      dv.setFloat32(off, a, false);
      off += 4;
    }
  }
  return off;
}
function encodeSingleBundle(ntpTime, address, args2) {
  let off = 0;
  off = writeBundleTag(SINGLE_DV, off);
  off = writeNTP(SINGLE_DV, off, ntpTime);
  const sizeOff = off;
  off += 4;
  const msgStart = off;
  off = writeString2(SINGLE_DV, off, address);
  off = writeArgs(SINGLE_DV, off, args2);
  SINGLE_DV.setUint32(sizeOff, off - msgStart, false);
  return new Uint8Array(SINGLE_BUF, 0, off);
}
function encodeMessage(address, args2) {
  let off = 0;
  off = writeString2(MSG_DV, off, address);
  off = writeArgs(MSG_DV, off, args2);
  return new Uint8Array(MSG_BUF, 0, off);
}
function encodeBundle(ntpTime, messages) {
  let off = 0;
  off = writeBundleTag(MULTI_DV, off);
  off = writeNTP(MULTI_DV, off, ntpTime);
  for (const msg of messages) {
    const msgBytes = encodeMessage(msg.address, msg.args);
    MULTI_DV.setUint32(off, msgBytes.length, false);
    off += 4;
    new Uint8Array(MULTI_BUF, off, msgBytes.length).set(msgBytes);
    off += msgBytes.length;
  }
  return new Uint8Array(MULTI_BUF, 0, off);
}

// ../../../sonicPiWeb/src/engine/buildTrackMonitorSynthDef.ts
var RATE_CONTROL = 1;
var RATE_AUDIO = 2;
var BINOP_MULTIPLY = 2;
function writePstring(view, offset, s) {
  view.setUint8(offset, s.length);
  offset += 1;
  for (let i2 = 0; i2 < s.length; i2++) {
    view.setUint8(offset + i2, s.charCodeAt(i2));
  }
  return offset + s.length;
}
function writeUGen(view, offset, name2, rate, inputs, numOutputs, outputRate, special = 0) {
  offset = writePstring(view, offset, name2);
  view.setInt8(offset, rate);
  offset += 1;
  view.setInt16(offset, inputs.length, false);
  offset += 2;
  view.setInt16(offset, numOutputs, false);
  offset += 2;
  view.setInt16(offset, special, false);
  offset += 2;
  for (const [ugenIdx, outIdx] of inputs) {
    view.setInt16(offset, ugenIdx, false);
    offset += 2;
    view.setInt16(offset, outIdx, false);
    offset += 2;
  }
  for (let i2 = 0; i2 < numOutputs; i2++) {
    view.setInt8(offset, outputRate);
    offset += 1;
  }
  return offset;
}
function writeParamName(view, offset, name2, index) {
  offset = writePstring(view, offset, name2);
  view.setInt16(offset, index, false);
  return offset + 2;
}
function buildTrackMonitorSynthDef() {
  const buf = new ArrayBuffer(246);
  const view = new DataView(buf);
  let o = 0;
  view.setUint8(o, 83);
  o += 1;
  view.setUint8(o, 67);
  o += 1;
  view.setUint8(o, 103);
  o += 1;
  view.setUint8(o, 102);
  o += 1;
  view.setInt32(o, 1, false);
  o += 4;
  view.setInt16(o, 1, false);
  o += 2;
  o = writePstring(view, o, "sonic_pi_track_monitor");
  view.setInt16(o, 0, false);
  o += 2;
  view.setInt16(o, 4, false);
  o += 2;
  view.setFloat32(o, 0, false);
  o += 4;
  view.setFloat32(o, 0, false);
  o += 4;
  view.setFloat32(o, 0, false);
  o += 4;
  view.setFloat32(o, 1, false);
  o += 4;
  view.setInt16(o, 4, false);
  o += 2;
  o = writeParamName(view, o, "in_bus", 0);
  o = writeParamName(view, o, "out_bus_master", 1);
  o = writeParamName(view, o, "out_bus_track", 2);
  o = writeParamName(view, o, "amp", 3);
  view.setInt16(o, 6, false);
  o += 2;
  o = writeUGen(
    view,
    o,
    "Control",
    RATE_CONTROL,
    [],
    // no inputs
    4,
    RATE_CONTROL
  );
  o = writeUGen(
    view,
    o,
    "In",
    RATE_AUDIO,
    [[0, 0]],
    // input: Control.in_bus
    2,
    RATE_AUDIO
  );
  o = writeUGen(
    view,
    o,
    "BinaryOpUGen",
    RATE_AUDIO,
    [[1, 0], [0, 3]],
    // In.L, Control.amp
    1,
    RATE_AUDIO,
    BINOP_MULTIPLY
  );
  o = writeUGen(
    view,
    o,
    "BinaryOpUGen",
    RATE_AUDIO,
    [[1, 1], [0, 3]],
    // In.R, Control.amp
    1,
    RATE_AUDIO,
    BINOP_MULTIPLY
  );
  o = writeUGen(
    view,
    o,
    "Out",
    RATE_AUDIO,
    [[0, 1], [2, 0], [3, 0]],
    // Control.out_bus_master, scaled_L, scaled_R
    0,
    RATE_AUDIO
  );
  o = writeUGen(
    view,
    o,
    "Out",
    RATE_AUDIO,
    [[0, 2], [2, 0], [3, 0]],
    // Control.out_bus_track, scaled_L, scaled_R
    0,
    RATE_AUDIO
  );
  view.setInt16(o, 0, false);
  o += 2;
  if (o !== 246) {
    throw new Error(
      `SynthDef binary size mismatch: wrote ${o} bytes, expected 246. This is a bug in buildTrackMonitorSynthDef().`
    );
  }
  return new Uint8Array(buf);
}

// ../../../sonicPiWeb/src/engine/SuperSonicBridge.ts
function formatOscTrace(address, args2, audioTime) {
  if (address === "/s_new" && args2.length >= 4) {
    const synthName = args2[0];
    const nodeId = args2[1];
    const addAction = args2[2];
    const targetGroup = args2[3];
    const params = {};
    for (let i2 = 4; i2 < args2.length; i2 += 2) {
      const key = args2[i2];
      const val = args2[i2 + 1];
      if (key !== void 0 && val !== void 0) {
        params[String(key)] = val;
      }
    }
    const paramsStr = Object.entries(params).map(([k, v]) => `${k}: ${typeof v === "number" ? Number(v.toFixed(4)) : v}`).join(", ");
    return `[t:${audioTime.toFixed(4)}] ${address} "${synthName}" ${nodeId} ${addAction} ${targetGroup} {${paramsStr}}`;
  }
  if (address === "/n_set" && args2.length >= 1) {
    const nodeId = args2[0];
    const params = {};
    for (let i2 = 1; i2 < args2.length; i2 += 2) {
      const key = args2[i2];
      const val = args2[i2 + 1];
      if (key !== void 0 && val !== void 0) {
        params[String(key)] = val;
      }
    }
    const paramsStr = Object.entries(params).map(([k, v]) => `${k}: ${typeof v === "number" ? Number(v.toFixed(4)) : v}`).join(", ");
    return `[t:${audioTime.toFixed(4)}] ${address} ${nodeId} {${paramsStr}}`;
  }
  return `[t:${audioTime.toFixed(4)}] ${address} ${args2.join(" ")}`;
}
var COMMON_SYNTHDEFS = [
  "sonic-pi-beep",
  "sonic-pi-saw",
  "sonic-pi-prophet",
  "sonic-pi-tb303",
  "sonic-pi-supersaw",
  "sonic-pi-pluck",
  "sonic-pi-pretty_bell",
  "sonic-pi-piano",
  "sonic-pi-basic_stereo_player"
  // Note: sonic-pi-stereo_player is NOT in the CDN (404). Loaded lazily on demand.
];
var NUM_OUTPUT_CHANNELS = 2 + AUDIO_IO.MAX_TRACK_OUTPUTS * 2;
var _SuperSonicBridge = class _SuperSonicBridge {
  constructor(options = {}) {
    this.sonic = null;
    this.loadedSynthDefs = /* @__PURE__ */ new Set();
    this.pendingSynthDefLoads = /* @__PURE__ */ new Map();
    this.loadedSamples = /* @__PURE__ */ new Map();
    this.pendingSampleLoads = /* @__PURE__ */ new Map();
    /** Sample duration cache — populated asynchronously on first load via Web Audio decode. */
    this.sampleDurations = /* @__PURE__ */ new Map();
    this.resolvedSampleBaseURL = "https://unpkg.com/supersonic-scsynth-samples@latest/samples/";
    this.nextBufNum = 0;
    this.analyserNode = null;
    this.analyserL = null;
    this.analyserR = null;
    /** rand_buf — buffer of random values for slicer/wobble/panslicer FX.
     *  Desktop SP loads rand-stream.wav (studio.rb:87). We generate in-memory. */
    this.randBufId = -1;
    /** Audio bus allocator — buses 0-15 are hardware, 16+ are private */
    this.nextBusNum = NUM_OUTPUT_CHANNELS;
    this.freeBuses = [];
    /** Live audio (mic/line-in) streams keyed by name */
    this.liveAudioStreams = /* @__PURE__ */ new Map();
    /** Names whose startLiveAudio getUserMedia is currently in-flight — race lock (#152) */
    this.pendingLiveAudio = /* @__PURE__ */ new Set();
    /** Per-track AnalyserNodes keyed by track name */
    this.trackAnalysers = /* @__PURE__ */ new Map();
    /** Track name → scsynth bus pair (stereo, starting at bus 2) */
    this.trackBuses = /* @__PURE__ */ new Map();
    /** Next available track bus pair */
    this.nextTrackBus = 2;
    this.splitter = null;
    this.masterMerger = null;
    this.masterGainNode = null;
    /** Per-loop monitor state: loopBus (internal routing) + monitorNodeId (scsynth node) */
    this.loopMonitors = /* @__PURE__ */ new Map();
    /** Whether the track-monitor SynthDef has been loaded via /d_recv */
    this.monitorSynthDefLoaded = false;
    /** scsynth mixer node ID — for controlling master volume via /n_set */
    this.mixerNodeId = 0;
    /** Optional callback for OSC trace logging — receives formatted trace strings like desktop Sonic Pi. */
    this.oscTraceHandler = null;
    /** SuperSonic.osc encoder (preferred) or fallback */
    this.oscEncoder = null;
    /** SuperSonic constructor ref — needed for static osc access */
    this.SuperSonicClass = null;
    /**
     * Delayed message queue — matches Sonic Pi's __delayed_messages.
     * Messages are queued during computation and flushed as a single
     * OSC bundle on sleep, so all events between sleeps share one NTP timetag.
     */
    this.messageQueue = [];
    this.messageQueueAudioTime = 0;
    this.options = options;
  }
  async init() {
    const SuperSonicClass = this.options.SuperSonicClass ?? globalThis.SuperSonic;
    if (!SuperSonicClass) {
      throw new Error(
        "SuperSonic not found. Pass it via options.SuperSonicClass or load via CDN."
      );
    }
    this.SuperSonicClass = SuperSonicClass;
    this.oscEncoder = SuperSonicClass.osc ?? { encodeSingleBundle };
    const pkgBase = "https://unpkg.com/supersonic-scsynth@latest/dist/";
    const coreBase = "https://unpkg.com/supersonic-scsynth-core@latest/";
    this.resolvedSampleBaseURL = this.options.sampleBaseURL ?? "https://unpkg.com/supersonic-scsynth-samples@latest/samples/";
    this.sonic = new SuperSonicClass({
      baseURL: this.options.baseURL ?? pkgBase,
      workerBaseURL: this.options.baseURL ?? `${pkgBase}workers/`,
      wasmBaseURL: this.options.coreBaseURL ?? `${coreBase}wasm/`,
      coreBaseURL: this.options.coreBaseURL ?? coreBase,
      synthdefBaseURL: this.options.synthdefBaseURL ?? "https://unpkg.com/supersonic-scsynth-synthdefs@latest/synthdefs/",
      sampleBaseURL: this.resolvedSampleBaseURL,
      autoConnect: false,
      scsynthOptions: { numOutputBusChannels: NUM_OUTPUT_CHANNELS }
    });
    await this.sonic.init();
    await this.sonic.loadSynthDefs(COMMON_SYNTHDEFS);
    for (const name2 of COMMON_SYNTHDEFS) {
      this.loadedSynthDefs.add(name2);
    }
    const mixerGroupId = this.sonic.nextNodeId();
    this.sonic.send("/g_new", mixerGroupId, 0, 0);
    this.sonic.send("/g_new", 102, 2, mixerGroupId);
    this.sonic.send("/g_new", 101, 2, 102);
    this.sonic.send("/g_new", 100, 2, 101);
    this.sonic.send("/d_recv", buildTrackMonitorSynthDef());
    this.monitorSynthDefLoaded = true;
    await this.sonic.loadSynthDef("sonic-pi-mixer");
    const mixerBus = this.allocateBus();
    this.mixerNodeId = this.sonic.nextNodeId();
    this.sonic.send(
      "/s_new",
      "sonic-pi-mixer",
      this.mixerNodeId,
      0,
      mixerGroupId,
      "out_bus",
      0,
      "in_bus",
      mixerBus,
      "amp",
      MIXER.AMP,
      "pre_amp",
      MIXER.PRE_AMP,
      "hpf",
      MIXER.HPF,
      "lpf",
      MIXER.LPF,
      "limiter_bypass",
      MIXER.LIMITER_BYPASS
    );
    await this.sonic.sync();
    const audioCtx = this.sonic.audioContext;
    const workletNode = this.sonic.node.input ?? this.sonic.node;
    this.splitter = audioCtx.createChannelSplitter(NUM_OUTPUT_CHANNELS);
    workletNode.connect(this.splitter);
    this.masterMerger = audioCtx.createChannelMerger(2);
    this.splitter.connect(this.masterMerger, 0, 0);
    this.splitter.connect(this.masterMerger, 1, 1);
    this.masterGainNode = audioCtx.createGain();
    this.masterGainNode.gain.value = 1;
    this.analyserNode = audioCtx.createAnalyser();
    this.analyserNode.fftSize = AUDIO_IO.ANALYSER_FFT_SIZE;
    this.analyserNode.smoothingTimeConstant = AUDIO_IO.ANALYSER_SMOOTHING;
    this.masterMerger.connect(this.analyserNode);
    this.analyserNode.connect(this.masterGainNode);
    this.masterGainNode.connect(audioCtx.destination);
    this.analyserL = audioCtx.createAnalyser();
    this.analyserL.fftSize = AUDIO_IO.ANALYSER_FFT_SIZE;
    this.analyserL.smoothingTimeConstant = AUDIO_IO.ANALYSER_SMOOTHING;
    this.analyserR = audioCtx.createAnalyser();
    this.analyserR.fftSize = AUDIO_IO.ANALYSER_FFT_SIZE;
    this.analyserR.smoothingTimeConstant = AUDIO_IO.ANALYSER_SMOOTHING;
    this.splitter.connect(this.analyserL, 0);
    this.splitter.connect(this.analyserR, 1);
  }
  get audioContext() {
    return this.sonic?.audioContext ?? null;
  }
  get analyser() {
    return this.analyserNode;
  }
  get analyserLeft() {
    return this.analyserL;
  }
  get analyserRight() {
    return this.analyserR;
  }
  /** Expose SuperSonic metrics for diagnostics. Returns null if not available. */
  getMetrics() {
    if (!this.sonic) return null;
    const s = this.sonic;
    if (typeof s.getMetrics === "function") {
      return s.getMetrics();
    }
    return null;
  }
  /** Set master volume (0-1). Controls both scsynth mixer pre_amp and Web Audio gain. */
  setMasterVolume(volume) {
    const clamped = Math.max(0, Math.min(1, volume));
    const scaledPreAmp = clamped * MIXER.PRE_AMP;
    this.sonic?.send("/n_set", this.mixerNodeId, "pre_amp", scaledPreAmp);
    if (this.masterGainNode) {
      this.masterGainNode.gain.setTargetAtTime(clamped, this.masterGainNode.context.currentTime, 0.02);
    }
  }
  /**
   * Enable OSC trace logging — callback receives formatted trace strings
   * matching desktop Sonic Pi's output style.
   *
   * Example output:
   *   /s_new "sonic-pi-basic_stereo_player" 1003 0 100 {buf: 0, amp: 1.5, lpf: 130, out_bus: 0}
   */
  setOscTraceHandler(handler) {
    this.oscTraceHandler = handler;
  }
  /**
   * Queue an OSC message for batched dispatch.
   * Sonic Pi's model: all play/sample calls between sleeps are collected,
   * then dispatched as ONE OSC bundle on sleep — sharing a single NTP timetag.
   */
  queueMessage(audioTime, address, args2) {
    this.messageQueueAudioTime = audioTime;
    this.messageQueue.push({ address, args: args2 });
    if (this.oscTraceHandler) {
      this.oscTraceHandler(formatOscTrace(address, args2, audioTime));
    }
  }
  /**
   * Flush all queued messages as a single OSC bundle.
   * Called by the interpreter on sleep/sync/end-of-iteration.
   * Matches Sonic Pi's __schedule_delayed_blocks_and_messages!
   */
  flushMessages(audioTime) {
    if (!this.sonic || this.messageQueue.length === 0) return;
    const t = audioTime ?? this.messageQueueAudioTime;
    const ntpTime = audioTimeToNTP(t, this.sonic.audioContext.currentTime);
    if (this.messageQueue.length === 1) {
      const msg = this.messageQueue[0];
      const bundle = this.oscEncoder.encodeSingleBundle(ntpTime, msg.address, msg.args);
      this.sonic.sendOSC(bundle);
    } else {
      try {
        const bundle = encodeBundle(ntpTime, this.messageQueue);
        this.sonic.sendOSC(bundle);
      } catch {
        for (const msg of this.messageQueue) {
          const single = this.oscEncoder.encodeSingleBundle(ntpTime, msg.address, msg.args);
          this.sonic.sendOSC(single);
        }
      }
    }
    this.messageQueue.length = 0;
  }
  ensureSynthDefLoaded(name2) {
    const fullName = name2.startsWith("sonic-pi-") ? name2 : `sonic-pi-${name2}`;
    if (this.loadedSynthDefs.has(fullName)) return Promise.resolve();
    const pending = this.pendingSynthDefLoads.get(fullName);
    if (pending) return pending;
    if (!this.sonic) throw new Error("SuperSonic not initialized");
    const p = this.sonic.loadSynthDef(fullName).then(() => {
      this.loadedSynthDefs.add(fullName);
      this.pendingSynthDefLoads.delete(fullName);
    });
    this.pendingSynthDefLoads.set(fullName, p);
    return p;
  }
  ensureSampleLoaded(name2) {
    const existing = this.loadedSamples.get(name2);
    if (existing !== void 0) return Promise.resolve(existing);
    const pending = this.pendingSampleLoads.get(name2);
    if (pending) return pending;
    if (!this.sonic) throw new Error("SuperSonic not initialized");
    const bufNum = this.nextBufNum++;
    const p = this.sonic.loadSample(bufNum, `${name2}.flac`).then(() => {
      this.loadedSamples.set(name2, bufNum);
      this.pendingSampleLoads.delete(name2);
      this.fetchSampleDuration(name2).catch((err2) => console.warn(`[SonicPi] Could not determine duration for ${name2}: ${err2.message}`));
      return bufNum;
    });
    this.pendingSampleLoads.set(name2, p);
    return p;
  }
  /**
   * Decode the sample via Web Audio to get its exact duration in seconds.
   * Fires once per sample name and caches the result.
   * Used by beat_stretch / pitch_stretch to apply Sonic Pi's exact formula.
   */
  async fetchSampleDuration(name2) {
    if (this.sampleDurations.has(name2)) return;
    if (!this.sonic) return;
    const url = `${this.resolvedSampleBaseURL}${name2}.flac`;
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.sonic.audioContext.decodeAudioData(arrayBuffer);
    this.sampleDurations.set(name2, audioBuffer.duration);
  }
  /**
   * Trigger a synth. Fast path: if synthdef already loaded, no async/await overhead.
   * The await in ensureSynthDefLoaded creates a microtask yield even on cache hit,
   * which at 43 events/sec causes significant event loop contention. See #71.
   */
  triggerSynth(synthName, audioTime, params) {
    if (!this.sonic) throw new Error("SuperSonic not initialized");
    const fullName = synthName.startsWith("sonic-pi-") ? synthName : `sonic-pi-${synthName}`;
    if (this.loadedSynthDefs.has(fullName)) {
      return Promise.resolve(this.triggerSynthImmediate(fullName, audioTime, params));
    }
    return this.ensureSynthDefLoaded(fullName).then(
      () => this.triggerSynthImmediate(fullName, audioTime, params)
    );
  }
  triggerSynthImmediate(fullName, audioTime, params) {
    const nodeId = this.sonic.nextNodeId();
    const paramList = [];
    for (const key in params) {
      paramList.push(key, params[key]);
    }
    this.queueMessage(audioTime, "/s_new", [fullName, nodeId, 0, 100, ...paramList]);
    if ((this.sonic?.audioContext?.currentTime ?? 0) > 0) {
      this.scheduleNodeFree(nodeId, audioTime, params);
    }
    return nodeId;
  }
  /**
   * Schedule /n_free for a synth node after its expected lifetime.
   * Uses setTimeout + sonic.send() — the immediate send path is reliable
   * for /n_free (scsynth may not process /n_free inside timetaged bundles).
   * The setTimeout fires on the main thread, but each call is <1ms.
   * See #73, #75.
   */
  scheduleNodeFree(nodeId, audioTime, params) {
    const attack = params.attack ?? 0;
    const decay = params.decay ?? 0;
    const sustain = params.sustain ?? 0;
    const release = params.release ?? 1;
    const duration = attack + decay + sustain + release;
    const freeTime = audioTime + duration + 0.1;
    const audioCtx = this.sonic?.audioContext;
    if (!audioCtx) return;
    const delayMs = (freeTime - audioCtx.currentTime) * 1e3;
    if (delayMs <= 0) return;
    setTimeout(() => {
      this.sonic?.send("/n_free", nodeId);
    }, delayMs);
  }
  /**
   * Play a sample. Fast path: if sample + synthdef already loaded, no async overhead.
   * See triggerSynth comment re: microtask yield cost at high event density (#71).
   */
  playSample(sampleName, audioTime, opts, bpm) {
    if (!this.sonic) throw new Error("SuperSonic not initialized");
    const playerName = selectSamplePlayer(opts);
    const bufNum = this.loadedSamples.get(sampleName);
    if (bufNum !== void 0 && this.loadedSynthDefs.has(playerName)) {
      return Promise.resolve(this.playSampleImmediate(sampleName, bufNum, playerName, audioTime, opts, bpm));
    }
    return this.playSampleSlow(sampleName, playerName, audioTime, opts, bpm);
  }
  playSampleImmediate(sampleName, bufNum, playerName, audioTime, opts, bpm) {
    const nodeId = this.sonic.nextNodeId();
    const duration = this.sampleDurations.get(sampleName) ?? null;
    const translated = translateSampleOpts(opts, bpm ?? 60, duration);
    const params = normalizeSampleParams(translated, bpm ?? 60);
    const paramList = ["buf", bufNum];
    for (const key in params) {
      paramList.push(key, params[key]);
    }
    this.queueMessage(audioTime, "/s_new", [playerName, nodeId, 0, 100, ...paramList]);
    if ((this.sonic?.audioContext?.currentTime ?? 0) > 0) {
      this.scheduleSampleNodeFree(nodeId, sampleName, audioTime, params);
    }
    return nodeId;
  }
  /**
   * Schedule /n_free for a sample node after its expected playback duration.
   * Uses setTimeout + sonic.send() (same as scheduleNodeFree).
   */
  scheduleSampleNodeFree(nodeId, sampleName, audioTime, params) {
    const sampleDur = this.sampleDurations.get(sampleName) ?? null;
    const rate = Math.abs(params.rate ?? 1);
    const finish = params.finish ?? 1;
    const start2 = params.start ?? 0;
    const release = params.release ?? 0;
    const attack = params.attack ?? 0;
    const sustain = params.sustain ?? 0;
    let playDuration;
    if (sustain > 0 && sustain < 100) {
      playDuration = attack + sustain + release;
    } else if (sampleDur !== null && rate > 0) {
      playDuration = sampleDur * (finish - start2) / rate + release;
    } else {
      playDuration = 2;
    }
    const freeTime = audioTime + playDuration + 0.1;
    const audioCtx = this.sonic?.audioContext;
    if (!audioCtx) return;
    const delayMs = (freeTime - audioCtx.currentTime) * 1e3;
    if (delayMs <= 0) return;
    setTimeout(() => {
      this.sonic?.send("/n_free", nodeId);
    }, delayMs);
  }
  async playSampleSlow(sampleName, playerName, audioTime, opts, bpm) {
    const bufNum = await this.ensureSampleLoaded(sampleName);
    if (playerName !== "sonic-pi-basic_stereo_player") {
      await this.ensureSynthDefLoaded(playerName);
    }
    return this.playSampleImmediate(sampleName, bufNum, playerName, audioTime, opts, bpm);
  }
  /** Apply an FX. Fast path when synthdef already loaded. */
  applyFx(fxName, audioTime, params, inBus, outBus = 0) {
    if (!this.sonic) throw new Error("SuperSonic not initialized");
    const fullName = fxName.startsWith("sonic-pi-") ? fxName : `sonic-pi-fx_${fxName}`;
    if (this.loadedSynthDefs.has(fullName)) {
      return Promise.resolve(this.applyFxImmediate(fullName, audioTime, params, inBus, outBus));
    }
    return this.ensureSynthDefLoaded(fullName).then(
      () => this.applyFxImmediate(fullName, audioTime, params, inBus, outBus)
    );
  }
  applyFxImmediate(fullName, audioTime, params, inBus, outBus) {
    const nodeId = this.sonic.nextNodeId();
    const paramList = ["in_bus", inBus, "out_bus", outBus];
    if (_SuperSonicBridge.RAND_BUF_FX.has(fullName)) {
      if (this.randBufId < 0) {
        const bufNum = this.nextBufNum++;
        this.sonic.send("/b_alloc", bufNum, 16, 1);
        this.sonic.send(
          "/b_setn",
          bufNum,
          0,
          16,
          0.23,
          -0.71,
          0.52,
          -0.33,
          0.89,
          -0.14,
          0.67,
          -0.82,
          0.41,
          -0.58,
          0.76,
          -0.27,
          0.93,
          -0.45,
          0.18,
          -0.63
        );
        this.randBufId = bufNum;
      }
      paramList.push("rand_buf", this.randBufId);
    }
    for (const key in params) {
      paramList.push(key, params[key]);
    }
    this.queueMessage(audioTime, "/s_new", [fullName, nodeId, 0, 101, ...paramList]);
    return nodeId;
  }
  /**
   * Returns true if a live audio stream under this name is currently active
   * OR mid-acquisition. Used by AudioInterpreter to avoid re-starting the
   * mic on every `synth :sound_in` dispatch inside a live_loop (#152).
   */
  isLiveAudioStreaming(name2) {
    return this.liveAudioStreams.has(name2) || this.pendingLiveAudio.has(name2);
  }
  /**
   * Start capturing live audio from the system input (microphone/line-in).
   * The stream is connected to the scsynth AudioWorkletNode so SoundIn.ar
   * inside the `sonic-pi-sound_in` synthdef can read the mic signal.
   *
   * **Idempotent and race-safe** (#152): if a stream already exists under
   * this name, or a `getUserMedia` call is in-flight for it, returns
   * immediately. Without this the AudioInterpreter's per-dispatch auto-start
   * would tear down and re-acquire the mic ~10×/sec inside a live_loop,
   * making the browser indicator flicker and the audio drop out.
   */
  async startLiveAudio(name2, opts) {
    if (!this.sonic) throw new Error("SuperSonic not initialized");
    if (this.liveAudioStreams.has(name2) || this.pendingLiveAudio.has(name2)) return;
    this.pendingLiveAudio.add(name2);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: opts?.stereo ? 2 : 1
        }
      });
      if (!this.pendingLiveAudio.has(name2)) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const audioCtx = this.sonic.audioContext;
      const source = audioCtx.createMediaStreamSource(stream);
      const nodeWrapper = this.sonic.node;
      const workletNode = nodeWrapper.input ?? this.sonic.node;
      source.connect(workletNode);
      this.liveAudioStreams.set(name2, { stream, source });
    } finally {
      this.pendingLiveAudio.delete(name2);
    }
  }
  /** Stop a named live audio stream and release its resources. */
  stopLiveAudio(name2) {
    const entry = this.liveAudioStreams.get(name2);
    if (entry) {
      entry.source.disconnect();
      entry.stream.getTracks().forEach((t) => t.stop());
      this.liveAudioStreams.delete(name2);
    }
  }
  /**
   * Stop every active live audio stream and release mic tracks (#152).
   * Called on engine stop so the browser's mic indicator clears and the
   * mic stops feeding scsynth's input channel between runs.
   *
   * Also clears pendingLiveAudio so any in-flight getUserMedia call
   * detects the cancellation after its await and tears down the stream
   * it just acquired instead of racing past the stop.
   */
  stopAllLiveAudio() {
    this.pendingLiveAudio.clear();
    for (const name2 of Array.from(this.liveAudioStreams.keys())) {
      this.stopLiveAudio(name2);
    }
  }
  /**
   * Allocate a stereo output bus for a track with its own AnalyserNode.
   * Returns the bus number to use as out_bus in synth params.
   * The bus audio is automatically routed to speakers via the worklet's
   * multi-channel output + Web Audio ChannelSplitter.
   */
  allocateTrackBus(trackId) {
    const existing = this.trackBuses.get(trackId);
    if (existing !== void 0) return existing;
    if (this.nextTrackBus >= NUM_OUTPUT_CHANNELS) {
      return 0;
    }
    const busNum = this.nextTrackBus;
    this.nextTrackBus += 2;
    this.trackBuses.set(trackId, busNum);
    if (this.sonic && this.splitter) {
      const audioCtx = this.sonic.audioContext;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = AUDIO_IO.ANALYSER_FFT_SIZE;
      analyser.smoothingTimeConstant = AUDIO_IO.ANALYSER_SMOOTHING;
      const merger = audioCtx.createChannelMerger(2);
      this.splitter.connect(merger, busNum, 0);
      this.splitter.connect(merger, busNum + 1, 1);
      merger.connect(analyser);
      this.trackAnalysers.set(trackId, analyser);
    }
    return busNum;
  }
  /** Get the per-track AnalyserNode for a specific track. */
  getTrackAnalyser(trackId) {
    return this.trackAnalysers.get(trackId) ?? null;
  }
  /** Get all per-track AnalyserNodes. */
  getAllTrackAnalysers() {
    return this.trackAnalysers;
  }
  // ── Per-loop audio isolation (monitor synths) ────────────────
  //
  // Each live_loop gets:
  //   1. A loopBus (internal scsynth bus, from the 128-bus pool)
  //   2. A monitor synth in group 102 (reads loopBus, writes to
  //      bus 0 for the mixer AND to a trackBus output channel
  //      for the per-track AnalyserNode)
  //
  // task.outBus is set to loopBus so all synths + FX in that loop
  // write there. The monitor fans out post-FX.
  //
  // Bare code (no live_loop) keeps outBus = 0, no monitor.
  /**
   * Create a per-loop monitor synth. Returns the loopBus number that
   * the loop's synths should write to (via task.outBus).
   *
   * If a monitor already exists for this name (hot-swap), reuses it.
   * The monitor persists across loop iterations (SP11 pattern — same
   * lifecycle as persistentFx).
   */
  createLoopMonitor(name2) {
    const existing = this.loopMonitors.get(name2);
    if (existing) return existing.loopBus;
    if (!this.sonic || !this.monitorSynthDefLoaded) return 0;
    const loopBus = this.allocateBus();
    const trackBus = this.allocateTrackBus(name2);
    const monitorNodeId = this.sonic.nextNodeId();
    this.sonic.send(
      "/s_new",
      "sonic_pi_track_monitor",
      monitorNodeId,
      1,
      102,
      "in_bus",
      loopBus,
      "out_bus_master",
      0,
      "out_bus_track",
      trackBus,
      "amp",
      1
    );
    this.loopMonitors.set(name2, { loopBus, monitorNodeId });
    return loopBus;
  }
  /**
   * Get the loopBus for a named loop (0 if no monitor exists).
   * The engine uses this to set task.outBus.
   */
  getLoopBus(name2) {
    return this.loopMonitors.get(name2)?.loopBus ?? 0;
  }
  /**
   * Free a specific loop's monitor synth and return its bus to the pool.
   * Called when a loop is removed during hot-swap.
   */
  freeLoopMonitor(name2) {
    const monitor = this.loopMonitors.get(name2);
    if (!monitor) return;
    this.sonic?.send("/n_free", monitor.monitorNodeId);
    this.freeBus(monitor.loopBus);
    this.loopMonitors.delete(name2);
  }
  /**
   * Free all monitor synths (called on stop / re-evaluate).
   * The loopBus numbers are returned to the pool so they can be
   * reused on the next run. Monitor synths are also freed via
   * /g_freeAll 102 in freeAllNodes(), but we clean the map here
   * so createLoopMonitor() knows to recreate them.
   */
  clearLoopMonitors() {
    for (const [, { loopBus }] of this.loopMonitors) {
      this.freeBus(loopBus);
    }
    this.loopMonitors.clear();
  }
  /** Allocate a private audio bus for FX routing. */
  allocateBus() {
    if (this.freeBuses.length > 0) return this.freeBuses.pop();
    return this.nextBusNum++;
  }
  /** Release a private audio bus back to the pool. Guards against duplicate frees. */
  freeBus(busNum) {
    if (!this.freeBuses.includes(busNum)) this.freeBuses.push(busNum);
  }
  /**
   * Register a custom (user-uploaded) sample from raw audio file bytes.
   * The ArrayBuffer is passed to SuperSonic's loadSample() which decodes
   * it via Web Audio and copies the PCM data to the WASM shared buffer.
   * After registration, `sample :user_mykick` works like any built-in sample.
   */
  async registerCustomSample(name2, audioData) {
    if (!this.sonic) throw new Error("SuperSonic not initialized");
    const bufNum = this.nextBufNum++;
    await this.sonic.loadSample(bufNum, audioData);
    this.loadedSamples.set(name2, bufNum);
    try {
      const audioBuffer = await this.sonic.audioContext.decodeAudioData(audioData.slice(0));
      this.sampleDurations.set(name2, audioBuffer.duration);
    } catch {
    }
  }
  /** Check if a sample has been loaded (duration cached). */
  isSampleLoaded(name2) {
    return this.loadedSamples.has(name2);
  }
  /** Get cached sample duration in seconds, or undefined if not yet loaded. */
  getSampleDuration(name2) {
    return this.sampleDurations.get(name2);
  }
  /** Free all synth, FX, and monitor nodes (clean slate for re-evaluate). */
  freeAllNodes() {
    if (!this.sonic) return;
    this.sonic.send("/g_freeAll", 100);
    this.sonic.send("/g_freeAll", 101);
    this.sonic.send("/g_freeAll", 102);
    this.clearLoopMonitors();
  }
  /** Create a new group inside the FX group (101). Returns group ID. */
  createFxGroup() {
    if (!this.sonic) throw new Error("SuperSonic not initialized");
    const groupId = this.sonic.nextNodeId();
    this.sonic.send("/g_new", groupId, 1, 101);
    return groupId;
  }
  /** Kill an entire group and all its contents. */
  freeGroup(groupId) {
    this.sonic?.send("/n_free", groupId);
  }
  /** Queue a timestamped /n_set control message for batched dispatch. */
  sendTimedControl(audioTime, nodeId, params) {
    this.queueMessage(audioTime, "/n_set", [nodeId, ...params]);
  }
  /** Send raw OSC message to SuperSonic (immediate, no timestamp). */
  send(address, ...args2) {
    this.sonic?.send(address, ...args2);
  }
  freeNode(nodeId) {
    this.sonic?.send("/n_free", nodeId);
  }
  dispose() {
    this.stopAllLiveAudio();
    if (this.masterGainNode) {
      this.masterGainNode.disconnect();
      this.masterGainNode = null;
    }
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    if (this.sonic) {
      this.sonic.destroy();
      this.sonic = null;
    }
    this.loadedSynthDefs.clear();
    this.loadedSamples.clear();
  }
};
/** FX that require rand_buf injection — matches Desktop SP's on_start hooks.
 *  REF: synthinfo.rb:6960 FXSlicer, :7225 FXWobble, :7470 FXPanSlicer */
_SuperSonicBridge.RAND_BUF_FX = /* @__PURE__ */ new Set([
  "sonic-pi-fx_slicer",
  "sonic-pi-fx_wobble",
  "sonic-pi-fx_panslicer"
]);
var SuperSonicBridge = _SuperSonicBridge;

// ../../../sonicPiWeb/src/engine/Sandbox.ts
var SANDBOX_WRAPPER_LINES = 37;
var BLOCKED_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "document",
  "window",
  "navigator",
  "location",
  "history",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "Worker",
  "SharedWorker",
  "ServiceWorker",
  "importScripts",
  "postMessage",
  "globalThis",
  "eval",
  "Function"
];
var BLOCKED_SET = new Set(BLOCKED_GLOBALS);
function createIsolatedExecutor(transpiledCode, dslParamNames) {
  const scopeBase = {};
  for (const name2 of BLOCKED_GLOBALS) {
    scopeBase[name2] = void 0;
  }
  const scopeStack = [];
  const scopeLocals = /* @__PURE__ */ new Map();
  const scope = new Proxy(scopeBase, {
    has() {
      return true;
    },
    get(target, prop) {
      if (typeof prop === "string") {
        if (BLOCKED_SET.has(prop)) return void 0;
        const currentScopeName = scopeStack[scopeStack.length - 1] ?? null;
        if (currentScopeName !== null) {
          const locals = scopeLocals.get(currentScopeName);
          if (locals && locals.has(prop)) return locals.get(prop);
        }
        if (prop in target) return target[prop];
      }
      return globalThis[prop];
    },
    set(target, prop, value) {
      if (typeof prop === "string") {
        const currentScopeName = scopeStack[scopeStack.length - 1] ?? null;
        if (currentScopeName !== null) {
          let locals = scopeLocals.get(currentScopeName);
          if (!locals) {
            locals = /* @__PURE__ */ new Map();
            scopeLocals.set(currentScopeName, locals);
          }
          locals.set(prop, value);
          return true;
        }
      }
      target[prop] = value;
      return true;
    }
  });
  const scopeHandle = {
    enterScope(name2) {
      scopeStack.push(name2);
    },
    exitScope() {
      scopeStack.pop();
    }
  };
  const mergePolyfill = `if (!Object.prototype.merge) { Object.defineProperty(Object.prototype, 'merge', { value: function(other) { return {...this, ...other}; }, writable: true, configurable: true, enumerable: false }); }
`;
  const stringRingPolyfill = `if (!String.prototype.ring) { Object.defineProperty(String.prototype, 'ring', { get: function() { return this.split(''); }, configurable: true, enumerable: false }); }
`;
  const arrayAtPolyfill = `{ const _origAt = Array.prototype.at; Object.defineProperty(Array.prototype, 'at', { value: function(i) { return this[((i % this.length) + this.length) % this.length]; }, writable: true, configurable: true }); }
`;
  const spOperatorPolyfill = [
    "var __spNoteRe = /^[a-g][sb#]?\\d*$/;",
    'function __spIsNote(v) { return typeof v === "string" && __spNoteRe.test(v); }',
    'function __spToNum(v) { return __spIsNote(v) && typeof note === "function" ? note(v) : v; }',
    'function __spIsRing(v) { return v != null && typeof v === "object" && typeof v.toArray === "function" && typeof v.tick === "function"; }',
    "function __spAdd(a, b) {",
    "  if (a == null || b == null) return null;",
    "  a = __spToNum(a); b = __spToNum(b);",
    "  if (__spIsRing(a) && __spIsRing(b)) return a.concat(b);",
    "  if (__spIsRing(a) && Array.isArray(b)) return a.concat(b);",
    "  if (Array.isArray(a) && __spIsRing(b)) return ring.apply(null, [].concat(a, b.toArray()));",
    '  if (typeof a === "number" && Array.isArray(b)) return b.map(function(x) { return a + x; });',
    '  if (Array.isArray(a) && typeof b === "number") return a.map(function(x) { return x + b; });',
    '  if (typeof a === "number" && __spIsRing(b)) return ring.apply(null, b.toArray().map(function(x) { return a + x; }));',
    '  if (__spIsRing(a) && typeof b === "number") return ring.apply(null, a.toArray().map(function(x) { return x + b; }));',
    "  return a + b;",
    "}",
    "function __spSub(a, b) {",
    "  if (a == null || b == null) return null;",
    "  a = __spToNum(a); b = __spToNum(b);",
    '  if (typeof a === "number" && Array.isArray(b)) return b.map(function(x) { return a - x; });',
    '  if (Array.isArray(a) && typeof b === "number") return a.map(function(x) { return x - b; });',
    '  if (typeof a === "number" && __spIsRing(b)) return ring.apply(null, b.toArray().map(function(x) { return a - x; }));',
    '  if (__spIsRing(a) && typeof b === "number") return ring.apply(null, a.toArray().map(function(x) { return x - b; }));',
    "  return a - b;",
    "}",
    "function __spMul(a, b) {",
    '  if (__spIsRing(a) && typeof b === "number") return a.repeat(b);',
    '  if (typeof a === "number" && __spIsRing(b)) return b.repeat(a);',
    "  return a * b;",
    "}"
  ].join("\n") + "\n";
  const wrappedCode = `with(__scope__) { return (async () => {
${mergePolyfill}${stringRingPolyfill}${arrayAtPolyfill}${spOperatorPolyfill}${transpiledCode}
})(); }`;
  const polyfillLineCount = (mergePolyfill + stringRingPolyfill + arrayAtPolyfill + spOperatorPolyfill).split("\n").length;
  SANDBOX_WRAPPER_LINES = 2 + polyfillLineCount;
  try {
    const fn = new Function("__scope__", wrappedCode);
    const execute = (...dslArgs) => {
      for (let i2 = 0; i2 < dslParamNames.length; i2++) {
        scope[dslParamNames[i2]] = dslArgs[i2];
      }
      return fn(scope);
    };
    return { execute, scopeHandle };
  } catch (e) {
    if (e instanceof SyntaxError) {
      const msg = e.message;
      const lineMatch = e.stack?.match(/<anonymous>:(\d+):\d+/) ?? msg.match(/line\s+(\d+)/i);
      if (lineMatch) {
        const jsLine = parseInt(lineMatch[1], 10);
        const wrapperLines = 2 + polyfillLineCount;
        const sourceLine = jsLine - wrapperLines;
        const enriched = new SyntaxError(`${msg} (line ${sourceLine > 0 ? sourceLine : 1})`);
        enriched.stack = e.stack;
        throw enriched;
      }
      throw e;
    }
    console.warn("[SonicPi] Sandbox unavailable \u2014 running without global blocking");
    const asyncBody = `return (async () => {
${transpiledCode}
})();`;
    try {
      const fn = new Function(...dslParamNames, asyncBody);
      return { execute: fn, scopeHandle };
    } catch (fallbackErr) {
      if (fallbackErr instanceof SyntaxError) {
        const fbMsg = fallbackErr.message;
        const fbMatch = fallbackErr.stack?.match(/<anonymous>:(\d+):\d+/) ?? fbMsg.match(/line\s+(\d+)/i);
        if (fbMatch) {
          const raw = parseInt(fbMatch[1], 10);
          const adjusted = raw - 2;
          const enriched = new SyntaxError(`${fbMsg} (line ${adjusted > 0 ? adjusted : 1})`);
          enriched.stack = fallbackErr.stack;
          throw enriched;
        }
      }
      throw fallbackErr;
    }
  }
}
function validateCode(code) {
  const warnings = [];
  if (/\bconstructor\b/.test(code)) {
    warnings.push('Code accesses "constructor" \u2014 this may not work in sandbox mode.');
  }
  if (/__proto__/.test(code)) {
    warnings.push('Code accesses "__proto__" \u2014 this may not work in sandbox mode.');
  }
  return warnings;
}

// ../../../sonicPiWeb/src/engine/TreeSitterTranspiler.ts
var Parser2 = null;
var RubyLanguage = null;
var _initPromise = null;
function initTreeSitter(opts) {
  if (_initPromise) return _initPromise;
  _initPromise = _doInit(opts);
  return _initPromise;
}
async function _doInit(opts) {
  const isBrowser = typeof window !== "undefined";
  let prevOnError = null;
  let rejectHandler = null;
  if (isBrowser) {
    prevOnError = window.onerror;
    window.onerror = (msg) => {
      if (typeof msg === "string" && (msg.includes("Aborted") || msg.includes("_abort"))) {
        return true;
      }
      return prevOnError ? prevOnError(...arguments) : false;
    };
    rejectHandler = (e) => {
      const reason = String(e.reason ?? "");
      if (reason.includes("Aborted") || reason.includes("_abort") || reason.includes("LinkError")) {
        e.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", rejectHandler);
  }
  try {
    const mod = await Promise.resolve().then(() => __toESM(require_tree_sitter(), 1));
    const TSParser = mod.Parser ?? mod.default ?? mod;
    const tsWasm = opts?.treeSitterWasmUrl ?? "/tree-sitter.wasm";
    const rubyWasm = opts?.rubyWasmUrl ?? "/tree-sitter-ruby.wasm";
    const initWithTimeout = Promise.race([
      TSParser.init({
        locateFile: (_filename, _scriptDir) => tsWasm
      }),
      new Promise(
        (_, reject) => setTimeout(() => reject(new Error("tree-sitter init timeout")), 5e3)
      )
    ]);
    await initWithTimeout;
    const TSLanguage = mod.Language ?? TSParser.Language;
    Parser2 = new TSParser();
    RubyLanguage = await TSLanguage.load(rubyWasm);
    Parser2.setLanguage(RubyLanguage);
    return true;
  } catch (err2) {
    console.warn("[TreeSitter] Init failed, regex fallback will be used:", err2);
    _initPromise = null;
    return false;
  } finally {
    if (isBrowser) {
      setTimeout(() => {
        window.onerror = prevOnError;
        if (rejectHandler) window.removeEventListener("unhandledrejection", rejectHandler);
      }, 200);
    }
  }
}
function isTreeSitterReady() {
  return Parser2 !== null && RubyLanguage !== null;
}
function treeSitterTranspile(ruby) {
  if (!isTreeSitterReady()) {
    return { code: "", ok: false, errors: ["tree-sitter not initialized"] };
  }
  ruby = ruby.split("\n").map((line2) => {
    const trimmed = line2.trim();
    if (/^\/[^/].*\/$/.test(trimmed) && !/[=~<>!]/.test(trimmed)) {
      return line2.replace(trimmed, `# ${trimmed.slice(1, -1).trim()}`);
    }
    return line2;
  }).join("\n");
  const tree = Parser2.parse(ruby);
  const errors = [];
  const ctx = {
    source: ruby,
    errors,
    insideLoop: false,
    definedFunctions: /* @__PURE__ */ new Set(),
    indent: ""
  };
  const js = transpileNode(tree.rootNode, ctx);
  if (errors.length > 0) {
    return { code: js, ok: false, errors };
  }
  try {
    new Function(js);
    return { code: js, ok: true, errors: [] };
  } catch (e) {
    return { code: js, ok: false, errors: [`Invalid JS output: ${e.message}`] };
  }
}
var BUILDER_METHODS = /* @__PURE__ */ new Set([
  // Core
  "play",
  "sleep",
  "wait",
  "sample",
  "sync",
  "cue",
  "set",
  "use_synth",
  "use_bpm",
  "use_random_seed",
  "control",
  "stop",
  "live_audio",
  "with_fx",
  "in_thread",
  "at",
  "puts",
  "print",
  // Random (resolved eagerly)
  "rrand",
  "rrand_i",
  "rand",
  "rand_i",
  "choose",
  "dice",
  "one_in",
  "rdist",
  "rand_look",
  "shuffle",
  "pick",
  // Tick
  "tick",
  "look",
  "tick_reset",
  "tick_reset_all",
  // Transpose
  "use_transpose",
  "with_transpose",
  // Synth defaults / BPM / synth blocks
  "use_synth_defaults",
  "use_sample_defaults",
  "with_synth_defaults",
  "with_sample_defaults",
  "with_bpm",
  "with_synth",
  "use_density",
  // Debug + latency
  "use_debug",
  "use_real_time",
  // BPM scaling control
  "use_arg_bpm_scaling",
  "with_arg_bpm_scaling",
  // Utility
  "factor_q",
  "bools",
  "play_pattern_timed",
  "sample_duration",
  "hz_to_midi",
  "midi_to_hz",
  "quantise",
  "quantize",
  "octs",
  "kill",
  "play_chord",
  "play_pattern",
  "with_octave",
  "with_random_seed",
  "with_density",
  "noteToMidi",
  "midiToFreq",
  "noteToFreq",
  // Data constructors
  "ring",
  "knit",
  "range",
  "line",
  "spread",
  "chord",
  "scale",
  "chord_invert",
  "note",
  "note_range",
  "chord_degree",
  "degree",
  "chord_names",
  "scale_names",
  // OSC
  "osc_send",
  // Sample BPM
  "use_sample_bpm",
  // Budget
  "__checkBudget__"
]);
var TOP_LEVEL_SCOPE = /* @__PURE__ */ new Set([
  "live_loop",
  "stop_loop",
  "define",
  "use_bpm",
  "use_synth",
  "use_random_seed",
  "use_arg_bpm_scaling",
  "in_thread",
  "at",
  "density",
  "with_fx",
  "with_arg_bpm_scaling",
  // Global store
  "set",
  "get",
  // Sample catalog
  "sample_duration",
  "sample_names",
  "sample_groups",
  "sample_loaded",
  // Output
  "puts",
  "print",
  "stop",
  // Volume & introspection
  "set_volume",
  "current_synth",
  "current_volume",
  // Catalog queries
  "synth_names",
  "fx_names",
  "all_sample_names",
  // Sample management
  "load_sample",
  "sample_info",
  // Math / music theory
  "hz_to_midi",
  "midi_to_hz",
  "quantise",
  "quantize",
  "octs",
  "chord_degree",
  "degree",
  "chord_names",
  "scale_names",
  "current_bpm",
  // Data constructors (also on builder, but available at top level)
  "ring",
  "knit",
  "range",
  "line",
  "spread",
  "chord",
  "scale",
  "chord_invert",
  "note",
  "note_range",
  // OSC
  "use_osc",
  "osc",
  "osc_send",
  // MIDI shorthand
  "midi",
  // Sample BPM
  "use_sample_bpm"
]);
var UNIMPLEMENTED_DSL = /* @__PURE__ */ new Set([
  "load_samples",
  "load_sample"
]);
var BARE_CALLABLE = /* @__PURE__ */ new Set([
  "tick",
  "look",
  "stop",
  "tick_reset_all",
  "rand",
  "rand_i",
  "chord_names",
  "scale_names"
]);
var BARE_CALLABLE_TOP_LEVEL = /* @__PURE__ */ new Set([
  "current_bpm"
]);
var SYNTH_NAMES = /* @__PURE__ */ new Set([
  "beep",
  "sine",
  "saw",
  "pulse",
  "subpulse",
  "square",
  "tri",
  "dsaw",
  "dpulse",
  "dtri",
  "fm",
  "mod_fm",
  "mod_saw",
  "mod_dsaw",
  "mod_sine",
  "mod_beep",
  "mod_tri",
  "mod_pulse",
  "supersaw",
  "hoover",
  "prophet",
  "zawa",
  "dark_ambience",
  "growl",
  "hollow",
  "blade",
  "piano",
  "pluck",
  "pretty_bell",
  "dull_bell",
  "tech_saws",
  "chipbass",
  "chiplead",
  "chipnoise",
  "tb303",
  "bass_foundation",
  "bass_highend",
  "organ_tonewheel",
  "rhodey",
  "rodeo",
  "kalimba",
  "gabberkick",
  "noise",
  "pnoise",
  "bnoise",
  "gnoise",
  "cnoise",
  "sound_in",
  "sound_in_stereo",
  "sc808_bassdrum",
  "sc808_snare",
  "sc808_clap",
  "sc808_tomlo",
  "sc808_tommid",
  "sc808_tomhi",
  "sc808_congalo",
  "sc808_congamid",
  "sc808_congahi",
  "sc808_rimshot",
  "sc808_claves",
  "sc808_maracas",
  "sc808_cowbell",
  "sc808_closed_hihat",
  "sc808_open_hihat",
  "sc808_cymbal"
]);
function transpileNode(node, ctx) {
  const type = node.type;
  switch (type) {
    // ---- Root ----
    case "program":
      return transpileProgram(node, ctx);
    // ---- Literals ----
    case "integer":
    case "float":
      return node.text;
    case "true":
      return "true";
    case "false":
      return "false";
    case "nil":
      return "null";
    case "self":
      return "this";
    case "simple_symbol":
      return `"${node.text.slice(1)}"`;
    case "hash_key_symbol":
      return node.text.replace(/:$/, "");
    case "string": {
      return transpileString(node, ctx);
    }
    case "string_content":
      return node.text;
    case "escape_sequence":
      return node.text;
    case "interpolation": {
      const inner = node.namedChildren.map((c) => transpileNode(c, ctx)).join("");
      return "${" + inner + "}";
    }
    case "symbol_array":
    case "string_array":
      return `[${node.namedChildren.map((c) => `"${c.text}"`).join(", ")}]`;
    case "array": {
      const elements = node.namedChildren.map((c) => transpileNode(c, ctx));
      return `[${elements.join(", ")}]`;
    }
    case "hash": {
      const pairs = node.namedChildren.map((c) => transpileNode(c, ctx));
      return `{ ${pairs.join(", ")} }`;
    }
    case "pair": {
      const key = node.namedChildren[0];
      const value = node.namedChildren[1];
      const keyStr = key.type === "hash_key_symbol" ? key.text.replace(/:$/, "") : transpileNode(key, ctx);
      return `${keyStr}: ${transpileNode(value, ctx)}`;
    }
    case "subarray":
      return `[${node.namedChildren.map((c) => transpileNode(c, ctx)).join(", ")}]`;
    // ---- Identifiers ----
    case "identifier": {
      const name2 = node.text;
      if (name2 === "nil") return "null";
      if (name2 === "true") return "true";
      if (name2 === "false") return "false";
      const parentType = node.parent?.type;
      const isStatement = parentType === "body_statement" || parentType === "program" || parentType === "then" || parentType === "block_body";
      if (isStatement && ctx.definedFunctions.has(name2)) {
        return `${name2}(__b)`;
      }
      if (BARE_CALLABLE.has(name2)) {
        const prefix = ctx.insideLoop ? "__b." : "";
        return `${prefix}${name2}()`;
      }
      if (BARE_CALLABLE_TOP_LEVEL.has(name2)) {
        return `${name2}()`;
      }
      return name2;
    }
    case "constant":
      return node.text;
    case "global_variable":
      return node.text;
    case "instance_variable":
      return `this.${node.text.slice(1)}`;
    case "class_variable":
      return node.text;
    // ---- Expressions ----
    case "assignment": {
      const lhs = node.namedChildren[0];
      const rhs = node.namedChildren[1];
      const lhsStr = transpileNode(lhs, ctx);
      const rhsStr = transpileNode(rhs, ctx);
      if (ctx.insideLoop && /^__b\.(play|sample)\(/.test(rhsStr)) {
        return `${rhsStr}; ${lhsStr} = __b.lastRef`;
      }
      return `${lhsStr} = ${rhsStr}`;
    }
    case "operator_assignment": {
      const lhs = node.namedChildren[0];
      const op = node.children.find((c) => c.type.endsWith("=") && c.type !== "identifier");
      const rhs = node.namedChildren[1];
      const opText = op ? op.text : "+=";
      return `${transpileNode(lhs, ctx)} ${opText} ${transpileNode(rhs, ctx)}`;
    }
    case "conditional": {
      const cond = node.namedChildren[0];
      const trueBranch = node.namedChildren[1];
      const falseBranch = node.namedChildren[2];
      return `${transpileNode(cond, ctx)} ? ${transpileNode(trueBranch, ctx)} : ${transpileNode(falseBranch, ctx)}`;
    }
    case "binary": {
      const left = node.namedChildren[0];
      const right = node.namedChildren[1];
      const op = node.children.find((c) => !c.isNamed)?.text ?? node.children[1]?.text ?? "+";
      const jsOp = op === "and" ? "&&" : op === "or" ? "||" : op === "**" ? "**" : op;
      if (op === "**") {
        return `Math.pow(${transpileNode(left, ctx)}, ${transpileNode(right, ctx)})`;
      }
      const lhs = transpileNode(left, ctx);
      const rhs = transpileNode(right, ctx);
      if (op === "+") return `__spAdd(${lhs}, ${rhs})`;
      if (op === "-") return `__spSub(${lhs}, ${rhs})`;
      if (op === "*") return `__spMul(${lhs}, ${rhs})`;
      return `${lhs} ${jsOp} ${rhs}`;
    }
    case "unary": {
      const operand = node.namedChildren[0];
      const op = node.children[0]?.text ?? "-";
      if (op === "defined?") return `(typeof ${transpileNode(operand, ctx)} !== 'undefined')`;
      const jsOp = op === "not" ? "!" : op;
      return `${jsOp}${transpileNode(operand, ctx)}`;
    }
    case "parenthesized_statements": {
      const inner = node.namedChildren.map((c) => transpileNode(c, ctx));
      if (inner.length === 1) return `(${inner[0]})`;
      return `(${inner.join(", ")})`;
    }
    case "range": {
      const from = transpileNode(node.namedChildren[0], ctx);
      const to = transpileNode(node.namedChildren[1], ctx);
      const exclusive = node.text.includes("...");
      if (exclusive) {
        return `Array.from({length: ${to} - ${from}}, (_, _i) => ${from} + _i)`;
      }
      return `Array.from({length: ${to} - ${from} + 1}, (_, _i) => ${from} + _i)`;
    }
    // ---- Method calls — the heart of the DSL ----
    case "call":
    case "method_call": {
      return transpileMethodCall(node, ctx);
    }
    case "argument_list": {
      return transpileArgList(node, ctx);
    }
    case "element_reference": {
      const obj = transpileNode(node.namedChildren[0], ctx);
      if (node.namedChildren[1]?.type === "range") {
        const rangeNode = node.namedChildren[1];
        const from = transpileNode(rangeNode.namedChildren[0], ctx);
        const toNode = rangeNode.namedChildren[1];
        const toStr = transpileNode(toNode, ctx);
        if (toStr === "-1" || toNode.type === "unary" && toNode.namedChildren[0]?.text === "1") {
          return `${obj}.slice(${from})`;
        }
        if (toStr.startsWith("-")) {
          const absVal = parseInt(toStr.slice(1));
          return `${obj}.slice(${from}, ${-(absVal - 1) || void 0})`;
        }
        return `${obj}.slice(${from}, ${toStr} + 1)`;
      }
      const args2 = node.namedChildren.slice(1).map((c) => transpileNode(c, ctx));
      return `${obj}[${args2.join(", ")}]`;
    }
    case "scope_resolution":
      return node.text;
    // ---- Blocks ----
    case "do_block":
    case "block": {
      return transpileBlockBody(node, ctx);
    }
    case "block_parameters": {
      const params = node.namedChildren.map((c) => transpileNode(c, ctx));
      return params.join(", ");
    }
    case "block_body":
    case "body_statement": {
      return transpileChildren(node, ctx);
    }
    // ---- Control flow ----
    case "if": {
      return transpileIf(node, ctx);
    }
    case "unless": {
      return transpileUnless(node, ctx);
    }
    case "if_modifier": {
      const body2 = node.namedChildren[0];
      const cond = node.namedChildren[1];
      return `if (${transpileNode(cond, ctx)}) { ${transpileNode(body2, ctx)} }`;
    }
    case "unless_modifier": {
      const body2 = node.namedChildren[0];
      const cond = node.namedChildren[1];
      return `if (!(${transpileNode(cond, ctx)})) { ${transpileNode(body2, ctx)} }`;
    }
    case "while": {
      const cond = node.namedChildren[0];
      const bodyNode = node.namedChildren[1];
      const bodyCtx = { ...ctx };
      const bodyStr = bodyNode ? transpileNode(bodyNode, bodyCtx) : "";
      return `while (${transpileNode(cond, ctx)}) {
${ctx.indent}  __b.__checkBudget__()
${bodyStr}
${ctx.indent}}`;
    }
    case "until": {
      const cond = node.namedChildren[0];
      const bodyNode = node.namedChildren[1];
      const bodyStr = bodyNode ? transpileNode(bodyNode, ctx) : "";
      return `while (!(${transpileNode(cond, ctx)})) {
${ctx.indent}  __b.__checkBudget__()
${bodyStr}
${ctx.indent}}`;
    }
    case "for": {
      const varNode = node.namedChildren[0];
      const iterNode = node.namedChildren[1];
      const bodyNode = node.namedChildren[2];
      const bodyStr = bodyNode ? transpileNode(bodyNode, ctx) : "";
      return `for (const ${transpileNode(varNode, ctx)} of ${transpileNode(iterNode, ctx)}) {
${ctx.indent}  __b.__checkBudget__()
${bodyStr}
${ctx.indent}}`;
    }
    case "case": {
      return transpileCase(node, ctx);
    }
    case "when": {
      return "";
    }
    case "else":
      return "";
    case "then":
      return transpileChildren(node, ctx);
    case "begin": {
      return transpileBeginRescue(node, ctx);
    }
    case "rescue":
    case "ensure":
      return "";
    case "return": {
      const val = node.namedChildren[0];
      if (val) return `return ${transpileNode(val, ctx)}`;
      return "return";
    }
    // ---- Method/function definitions ----
    case "method": {
      const nameNode = node.namedChildren[0];
      const params = node.namedChildren.find((c) => c.type === "method_parameters");
      const body2 = node.namedChildren.find((c) => c.type === "body_statement");
      const paramStr = params ? params.namedChildren.map((c) => transpileNode(c, ctx)).join(", ") : "";
      const bodyStr = body2 ? transpileNode(body2, ctx) : "";
      return `function ${nameNode.text}(${paramStr}) {
${bodyStr}
${ctx.indent}}`;
    }
    // ---- Lambda ----
    case "lambda": {
      const params = node.namedChildren.find((c) => c.type === "lambda_parameters" || c.type === "block_parameters");
      const body2 = node.namedChildren.find((c) => c.type === "block" || c.type === "do_block") ?? node.namedChildren[node.namedChildCount - 1];
      const paramStr = params ? params.namedChildren.map((c) => transpileNode(c, ctx)).join(", ") : "";
      const bodyStr = body2 ? transpileNode(body2, ctx) : "";
      return `(${paramStr}) => { ${bodyStr} }`;
    }
    // ---- Block argument (&:method → (x) => x.method()) ----
    case "block_argument": {
      const inner = node.namedChildren[0];
      if (inner?.type === "simple_symbol") {
        const method = inner.text.slice(1);
        return `(__x) => __x.${method}()`;
      }
      return transpileNode(inner, ctx);
    }
    // ---- Multiple assignment: a, b = [1, 2] → [a, b] = [1, 2] ----
    case "left_assignment_list": {
      const vars = node.namedChildren.map((c) => transpileNode(c, ctx));
      return `[${vars.join(", ")}]`;
    }
    // ---- Splat/rest ----
    case "splat_parameter":
    case "rest_assignment":
      return `...${node.namedChildren[0]?.text ?? ""}`;
    case "keyword_parameter": {
      const name2 = node.namedChildren[0]?.text ?? "";
      const defaultVal = node.namedChildren[1];
      if (defaultVal) return `${name2} = ${transpileNode(defaultVal, ctx)}`;
      return name2;
    }
    case "optional_parameter": {
      const name2 = node.namedChildren[0]?.text ?? "";
      const defaultVal = node.namedChildren[1];
      if (defaultVal) return `${name2} = ${transpileNode(defaultVal, ctx)}`;
      return name2;
    }
    case "destructured_parameter":
      return node.text;
    // ---- Comments ----
    case "comment":
      return `//${node.text.slice(1)}`;
    // Sonic Pi uses /text/ as multi-line comments. Ruby's grammar parses
    // these as regex literals. Convert to JS comments.
    case "regex":
      return `// ${node.text.slice(1, -1).trim()}`;
    // ---- Misc ----
    case "expression_statement":
      return transpileChildren(node, ctx);
    case "empty_statement":
      return "";
    case "ERROR": {
      ctx.errors.push(`Parse error at line ${node.startPosition.row + 1}: ${node.text.slice(0, 50)}`);
      return `/* PARSE ERROR: ${node.text.slice(0, 30)} */`;
    }
    // ---- Structural wrapper nodes — recurse into children ----
    // These are CST nodes that exist for grouping but carry no semantic
    // content for transpilation (e.g., `then`, `body_statement` variants).
    // A partial fold over named nodes — handle semantically meaningful
    // types explicitly above, recurse through structural wrappers here.
    default: {
      if (node.namedChildCount > 0) {
        return transpileChildren(node, ctx);
      }
      if (node.type !== "empty_statement" && node.text.trim()) {
        ctx.errors.push(`Unhandled node type '${node.type}' at line ${node.startPosition.row + 1}: ${node.text.slice(0, 40)}`);
      }
      return node.text;
    }
  }
}
var BARE_DSL_CALLS = /* @__PURE__ */ new Set([
  "play",
  "sleep",
  "sample",
  "cue",
  "sync",
  "puts",
  "print",
  "control",
  "synth",
  "loop",
  "play_chord",
  "play_pattern",
  "play_pattern_timed",
  "use_synth_defaults",
  "use_sample_defaults",
  "use_transpose"
]);
var TOP_LEVEL_SETTINGS = /* @__PURE__ */ new Set(["use_bpm", "use_random_seed", "use_debug", "use_arg_bpm_scaling"]);
function transpileProgram(node, ctx) {
  const children = node.namedChildren;
  const hasBareCode = children.some((c) => {
    if (c.type === "call" || c.type === "method_call") {
      const method = c.childForFieldName("method")?.text ?? c.namedChildren[0]?.text;
      if (BARE_DSL_CALLS.has(method)) return true;
      if (method === "times" || method === "each") return true;
    }
    return false;
  });
  const hasBareFx = children.some((c) => {
    if (c.type !== "call" && c.type !== "method_call") return false;
    const method = c.childForFieldName("method")?.text ?? c.namedChildren[0]?.text;
    if (method !== "with_fx") return false;
    const text = c.text ?? "";
    return !/live_loop/.test(text);
  });
  if (!hasBareCode && !hasBareFx) {
    return transpileChildren(node, ctx);
  }
  const topLevel = [];
  const bareCode = [];
  const blocks = [];
  for (const child of children) {
    if (child.type === "comment") {
      bareCode.push(child);
      continue;
    }
    const method = child.type === "call" || child.type === "method_call" ? child.childForFieldName("method")?.text ?? child.namedChildren[0]?.text : null;
    const isBareFxNode = method === "with_fx" && !/live_loop/.test(child.text ?? "");
    if (method && TOP_LEVEL_SETTINGS.has(method)) {
      topLevel.push(child);
    } else if (method && !isBareFxNode && (method === "live_loop" || method === "define" || method === "with_fx" || method === "in_thread")) {
      blocks.push(child);
    } else {
      bareCode.push(child);
    }
  }
  for (const child of blocks) {
    const m = child.type === "call" || child.type === "method_call" ? child.childForFieldName("method")?.text ?? child.namedChildren[0]?.text : null;
    if (m === "define") {
      const argsNode = child.childForFieldName("arguments");
      const nameNode = argsNode?.namedChildren?.[0];
      if (nameNode) {
        const funcName = nameNode.type === "simple_symbol" ? nameNode.text.slice(1) : nameNode.type === "string" ? nameNode.text.replace(/['"]/g, "") : nameNode.text;
        ctx.definedFunctions.add(funcName);
      }
    }
  }
  const topJS = topLevel.map((c) => transpileNode(c, ctx)).filter(Boolean);
  const bareCtx = { ...ctx, insideLoop: true };
  const bareJS = bareCode.map((c) => "  " + transpileNode(c, bareCtx)).filter((s) => s.trim());
  const blockJS = blocks.map((c) => transpileNode(c, ctx)).filter(Boolean);
  const parts2 = [];
  if (topJS.length > 0) parts2.push(topJS.join("\n"));
  if (bareJS.length > 0) {
    parts2.push(`live_loop("__run_once", (__b) => {
${bareJS.join("\n")}
  __b.stop()
})`);
  }
  if (blockJS.length > 0) parts2.push(blockJS.join("\n"));
  return parts2.join("\n");
}
function transpileMethodCall(node, ctx) {
  const type = node.type;
  if (type === "call" || type === "method_call") {
    const receiver = node.childForFieldName("receiver");
    const methodNode = node.childForFieldName("method");
    const argsNode = node.childForFieldName("arguments");
    const blockNode = node.namedChildren.find((c) => c.type === "do_block" || c.type === "block");
    if (receiver && methodNode) {
      return transpileReceiverMethodCall(receiver, methodNode, argsNode, blockNode, node, ctx);
    }
    const rawMethodName = methodNode?.text ?? node.namedChildren[0]?.text ?? node.text;
    const methodName = rawMethodName.endsWith("!") ? rawMethodName.slice(0, -1) : rawMethodName;
    if (methodName === "live_loop") {
      return transpileLiveLoop(node, argsNode, blockNode, ctx);
    }
    if (methodName === "define") {
      return transpileDefine(node, argsNode, blockNode, ctx);
    }
    if (methodName === "with_fx" || methodName === "with_synth" || methodName === "with_bpm" || methodName === "with_transpose" || methodName === "with_arg_bpm_scaling" || methodName === "with_synth_defaults" || methodName === "with_sample_defaults" || methodName === "with_random_seed" || methodName === "with_octave" || methodName === "with_density") {
      return transpileWithBlock(methodName, argsNode, blockNode, ctx);
    }
    if (methodName === "in_thread") {
      return transpileInThread(argsNode, blockNode, ctx);
    }
    if (methodName === "at") {
      return transpileAt(argsNode, blockNode, ctx);
    }
    if (methodName === "time_warp") {
      return transpileTimeWarp(argsNode, blockNode, ctx);
    }
    if (methodName === "density") {
      return transpileDensity(argsNode, blockNode, ctx);
    }
    if (methodName === "uncomment") {
      if (blockNode) {
        const bodyCtx = { ...ctx };
        return transpileBlockBody(blockNode, bodyCtx);
      }
      return "";
    }
    if (methodName === "comment") {
      return "/* commented out */";
    }
    if (methodName === "loop") {
      const block = blockNode ?? node.namedChildren.find((c) => c.type === "block");
      if (block) {
        const bodyStr = transpileBlockBody(block, ctx);
        return `while (true) {
${ctx.indent}  __b.__checkBudget__()
${bodyStr}
${ctx.indent}}`;
      }
    }
    if (methodName === "stop") {
      return "__b.stop()";
    }
    if (methodName === "stop_loop") {
      const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
      return `stop_loop(${args3})`;
    }
    if (methodName === "use_synth") {
      const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
      const prefix = ctx.insideLoop ? "__b." : "";
      return `${prefix}use_synth(${args3})`;
    }
    if (methodName === "use_bpm") {
      const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
      const prefix = ctx.insideLoop ? "__b." : "";
      return `${prefix}use_bpm(${args3})`;
    }
    if (methodName === "use_random_seed") {
      const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
      const prefix = ctx.insideLoop ? "__b." : "";
      return `${prefix}use_random_seed(${args3})`;
    }
    if (methodName === "use_synth_defaults" || methodName === "use_sample_defaults") {
      const args3 = argsNode ? transpileArgListAsOpts(argsNode, ctx) : "{}";
      const prefix = ctx.insideLoop ? "__b." : "";
      return `${prefix}${methodName}(${args3})`;
    }
    if (methodName === "load_samples" || methodName === "load_sample") {
      return "/* load_samples: no-op in browser */";
    }
    if (methodName === "osc_send") {
      const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
      const prefix = ctx.insideLoop ? "__b." : "";
      return `${prefix}osc_send(${args3})`;
    }
    if (methodName === "synth") {
      return transpileSynthCommand(argsNode, ctx);
    }
    if (SYNTH_NAMES.has(methodName)) {
      const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
      return `__b.play(${args3}, { synth: "${methodName}" })`;
    }
    if (ctx.definedFunctions.has(methodName)) {
      const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
      return `${methodName}(__b${args3 ? ", " + args3 : ""})`;
    }
    if (methodName.endsWith("?")) {
      const cleanName = methodName.slice(0, -1) + "_q";
      const prefix = ctx.insideLoop ? "__b." : "";
      const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
      return `${prefix}${cleanName}(${args3})`;
    }
    if (BUILDER_METHODS.has(methodName)) {
      const prefix = ctx.insideLoop ? "__b." : "";
      const needsSrcLine = methodName === "play" || methodName === "sample";
      const nodeCtx = { ...ctx, srcLine: node.startPosition.row + 1 };
      const args3 = argsNode ? transpileArgList(argsNode, nodeCtx, needsSrcLine) : "";
      return `${prefix}${methodName}(${args3})`;
    }
    if (TOP_LEVEL_SCOPE.has(methodName)) {
      const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
      return `${methodName}(${args3})`;
    }
    if (UNIMPLEMENTED_DSL.has(methodName)) {
      const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
      return `${methodName}(${args3})`;
    }
    const args2 = argsNode ? transpileArgList(argsNode, ctx) : "";
    return `${methodName}(${args2})`;
  }
  return node.text;
}
function transpileReceiverMethodCall(receiver, methodNode, argsNode, blockNode, fullNode, ctx) {
  const method = methodNode.text;
  const recStr = transpileNode(receiver, ctx);
  if (method === "times" && blockNode) {
    const params = blockNode.namedChildren.find((c) => c.type === "block_parameters");
    const varName = params?.namedChildren[0]?.text ?? "_i";
    const bodyStr = transpileBlockBody(blockNode, ctx);
    return `for (let ${varName} = 0; ${varName} < ${recStr}; ${varName}++) {
${ctx.indent}  __b.__checkBudget__()
${bodyStr}
${ctx.indent}}`;
  }
  if (method === "each" && blockNode) {
    const params = blockNode.namedChildren.find((c) => c.type === "block_parameters");
    const varName = params?.namedChildren[0]?.text ?? "_item";
    const bodyStr = transpileBlockBody(blockNode, ctx);
    return `for (const ${varName} of ${recStr}) {
${ctx.indent}  __b.__checkBudget__()
${bodyStr}
${ctx.indent}}`;
  }
  if (method === "each_with_index" && blockNode) {
    const params = blockNode.namedChildren.find((c) => c.type === "block_parameters");
    const itemVar = params?.namedChildren[0]?.text ?? "_item";
    const idxVar = params?.namedChildren[1]?.text ?? "_i";
    const bodyStr = transpileBlockBody(blockNode, ctx);
    const arrTmp = `__ewi_${ctx.indent.length}`;
    return `{ const ${arrTmp} = ${recStr}; for (let ${idxVar} = 0; ${idxVar} < ${arrTmp}.length; ${idxVar}++) {
${ctx.indent}  __b.__checkBudget__()
${ctx.indent}  const ${itemVar} = ${arrTmp}[${idxVar}]
${bodyStr}
${ctx.indent}} }`;
  }
  if ((method === "map" || method === "select" || method === "reject" || method === "collect") && blockNode) {
    const params = blockNode.namedChildren.find((c) => c.type === "block_parameters");
    const varName = params?.namedChildren[0]?.text ?? "_item";
    const jsMethod = method === "select" || method === "reject" ? "filter" : "map";
    const isReject = method === "reject";
    const bodyStr = transpileBlockBody(blockNode, ctx);
    const negation = isReject ? "!" : "";
    return `${recStr}.${jsMethod}((${varName}) => ${negation}(${bodyStr}))`;
  }
  if ((method === "map" || method === "select" || method === "reject" || method === "collect") && !blockNode) {
    const inlineBlock = fullNode.namedChildren.find((c) => c.type === "block");
    if (inlineBlock) {
      const params = inlineBlock.namedChildren.find((c) => c.type === "block_parameters");
      const varName = params?.namedChildren[0]?.text ?? "_item";
      const jsMethod = method === "select" || method === "reject" ? "filter" : "map";
      const isReject = method === "reject";
      const bodyStr = transpileBlockBody(inlineBlock, ctx);
      const negation = isReject ? "!" : "";
      return `${recStr}.${jsMethod}((${varName}) => ${negation}(${bodyStr}))`;
    }
  }
  if (method === "tick") {
    const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
    if (args3) return `${recStr}?.at(__b.tick(${args3}))`;
    return `${recStr}?.at(__b.tick())`;
  }
  if (method === "look") {
    return `${recStr}?.at(__b.look())`;
  }
  if (method === "choose") {
    return `__b.choose(${recStr})`;
  }
  if (method === "reverse") {
    return `${recStr}.reverse()`;
  }
  if (method === "shuffle") {
    return `__b.shuffle(${recStr})`;
  }
  if (method === "mirror") {
    return `${recStr}.mirror()`;
  }
  if (method === "ramp") {
    return `${recStr}.ramp()`;
  }
  if (method === "stretch") {
    const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
    return `${recStr}.stretch(${args3})`;
  }
  if (method === "drop") {
    const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
    return `${recStr}.drop(${args3})`;
  }
  if (method === "butlast") {
    return `${recStr}.butlast()`;
  }
  if (method === "take") {
    const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
    return `${recStr}.take(${args3})`;
  }
  if (method === "pick") {
    const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
    return `__b.pick(${recStr}${args3 ? ", " + args3 : ""})`;
  }
  if (method === "ring") {
    return `__b.ring(...${recStr})`;
  }
  if (method === "to_a") {
    return `Array.from(${recStr})`;
  }
  if (method === "to_sym" || method === "to_s") {
    return recStr;
  }
  if (method === "to_i") {
    return `Math.floor(${recStr})`;
  }
  if (method === "to_f") {
    return `Number(${recStr})`;
  }
  if (method === "length" || method === "size" || method === "count") {
    return `${recStr}.length`;
  }
  if (method === "abs") {
    return `Math.abs(${recStr})`;
  }
  if (method === "min") return `Math.min(...${recStr})`;
  if (method === "max") return `Math.max(...${recStr})`;
  if (method === "first") {
    return `${recStr}[0]`;
  }
  if (method === "last") {
    return `${recStr}.at(-1)`;
  }
  if (method === "flat_map") {
    const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
    return `${recStr}.flatMap(${args3})`;
  }
  if (method === "include?") {
    const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
    return `${recStr}.includes(${args3})`;
  }
  if (method === "sort") {
    return `${recStr}.sort()`;
  }
  if (method === "zip") {
    const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
    return `${recStr}.map((__v, __i) => [__v, ${args3 ? args3.split(", ").map((a) => `(${a})[__i] ?? null`).join(", ") : ""}])`;
  }
  if (method === "sample" && !argsNode) {
    return `__b.choose(${recStr})`;
  }
  if (method.endsWith("?")) {
    const cleanName = method.slice(0, -1) + "_q";
    const args3 = argsNode ? transpileArgList(argsNode, ctx) : "";
    if (method === "factor?") {
      return `__b.factor_q(${args3 ? recStr + ", " + args3 : recStr})`;
    }
    return `${recStr}.${cleanName}(${args3})`;
  }
  const args2 = argsNode ? transpileArgList(argsNode, ctx) : "";
  if (args2) return `${recStr}.${method}(${args2})`;
  if (fullNode.text.includes("(")) return `${recStr}.${method}()`;
  return `${recStr}.${method}()`;
}
function transpileLiveLoop(node, argsNode, blockNode, ctx) {
  const args2 = argsNode?.namedChildren ?? [];
  let name2 = "main";
  let syncName = null;
  const extraOpts = [];
  for (const arg of args2) {
    if (arg.type === "simple_symbol") {
      name2 = arg.text.slice(1);
    } else if (arg.type === "pair") {
      const key = arg.namedChildren[0];
      const val = arg.namedChildren[1];
      const keyName = key.text.replace(/:$/, "");
      if (keyName === "sync") {
        syncName = val.type === "simple_symbol" ? val.text.slice(1) : transpileNode(val, ctx);
      } else if (keyName === "delay") {
        extraOpts.push(`delay: ${transpileNode(val, ctx)}`);
      }
    }
  }
  if (!blockNode) {
    const line2 = node.startPosition?.row != null ? node.startPosition.row + 1 : "?";
    ctx.errors.push(`Parse error at line ${line2}: live_loop :${name2} is missing 'do ... end' block`);
    return `/* parse error: live_loop :${name2} missing block */`;
  }
  const bodyCtx = { ...ctx, insideLoop: true };
  const bodyStr = transpileBlockBody(blockNode, bodyCtx);
  const optsArg = syncName ? `{sync: "${syncName}"}, ` : "";
  return `live_loop("${name2}", ${optsArg}(__b) => {
${bodyStr}
${ctx.indent}})`;
}
function transpileDefine(node, argsNode, blockNode, ctx) {
  const args2 = argsNode?.namedChildren ?? [];
  let name2 = "unnamed";
  for (const arg of args2) {
    if (arg.type === "simple_symbol") {
      name2 = arg.text.slice(1);
    }
  }
  ctx.definedFunctions.add(name2);
  if (!blockNode) {
    const line2 = node.startPosition?.row != null ? node.startPosition.row + 1 : "?";
    ctx.errors.push(`Parse error at line ${line2}: define :${name2} is missing 'do ... end' block`);
    return `/* parse error: define :${name2} missing block */`;
  }
  const params = blockNode.namedChildren.find((c) => c.type === "block_parameters");
  const paramStr = params ? params.namedChildren.map((c) => transpileNode(c, ctx)).join(", ") : "";
  const bodyCtx = { ...ctx, insideLoop: true };
  const bodyStr = transpileBlockBody(blockNode, bodyCtx);
  return `function ${name2}(__b${paramStr ? ", " + paramStr : ""}) {
${bodyStr}
${ctx.indent}}`;
}
function transpileWithBlock(methodName, argsNode, blockNode, ctx) {
  const args2 = argsNode?.namedChildren ?? [];
  const positional = [];
  const opts = [];
  for (const arg of args2) {
    if (arg.type === "pair") {
      const key = arg.namedChildren[0];
      const val = arg.namedChildren[1];
      const keyName = key.text.replace(/:$/, "");
      if (keyName === "reps") {
        opts.push(`reps: ${transpileNode(val, ctx)}`);
      } else {
        opts.push(`${keyName}: ${transpileNode(val, ctx)}`);
      }
    } else {
      positional.push(transpileNode(arg, ctx));
    }
  }
  if (!blockNode) {
    const line2 = argsNode?.startPosition?.row != null ? argsNode.startPosition.row + 1 : "?";
    ctx.errors.push(`Parse error at line ${line2}: ${methodName} is missing 'do ... end' block`);
    return `/* parse error: ${methodName} missing block */`;
  }
  const prefix = ctx.insideLoop ? "__b." : "";
  const bodyCtx = ctx.insideLoop ? { ...ctx, insideLoop: true } : { ...ctx };
  const bodyStr = transpileBlockBody(blockNode, bodyCtx);
  const optsStr = opts.length > 0 ? `{ ${opts.join(", ")} }` : "";
  const posStr = positional.join(", ");
  const blockParams = blockNode?.namedChildren.find((c) => c.type === "block_parameters");
  const fxParamName = blockParams?.namedChildren[0]?.text;
  let callbackParams;
  if (ctx.insideLoop) {
    callbackParams = fxParamName ? `(__b, ${fxParamName})` : "(__b)";
  } else {
    callbackParams = fxParamName ? `(${fxParamName})` : "()";
  }
  const argParts = [posStr, optsStr, `${callbackParams} => {
` + bodyStr + "\n" + ctx.indent + "}"].filter(Boolean);
  return `${prefix}${methodName}(${argParts.join(", ")})`;
}
function transpileInThread(argsNode, blockNode, ctx) {
  if (!blockNode) {
    const line2 = argsNode?.startPosition?.row != null ? argsNode.startPosition.row + 1 : "?";
    ctx.errors.push(`Parse error at line ${line2}: in_thread is missing 'do ... end' block`);
    return `/* parse error: in_thread missing block */`;
  }
  const prefix = ctx.insideLoop ? "__b." : "";
  const bodyCtx = { ...ctx, insideLoop: true };
  const bodyStr = transpileBlockBody(blockNode, bodyCtx);
  const args2 = argsNode?.namedChildren ?? [];
  for (const arg of args2) {
    if (arg.type === "pair") {
      const key = arg.namedChildren[0]?.text?.replace(/:$/, "");
      if (key === "name") {
        const name2 = transpileNode(arg.namedChildren[1], ctx);
        return `${prefix}in_thread({ name: ${name2} }, (__b) => {
${bodyStr}
${ctx.indent}})`;
      }
    }
  }
  return `${prefix}in_thread((__b) => {
${bodyStr}
${ctx.indent}})`;
}
function transpileAt(argsNode, blockNode, ctx) {
  if (!blockNode) {
    const line2 = argsNode?.startPosition?.row != null ? argsNode.startPosition.row + 1 : "?";
    ctx.errors.push(`Parse error at line ${line2}: at is missing 'do ... end' block`);
    return `/* parse error: at missing block */`;
  }
  const args2 = argsNode?.namedChildren ?? [];
  const positional = args2.filter((a) => a.type !== "pair").map((a) => transpileNode(a, ctx));
  const timesArr = positional[0] ?? "[]";
  const valuesArr = positional[1] ?? "null";
  const prefix = ctx.insideLoop ? "__b." : "";
  const bodyCtx = { ...ctx, insideLoop: true };
  const params = blockNode.namedChildren.find((c) => c.type === "block_parameters");
  const paramNames = params?.namedChildren.map((c) => c.text) ?? [];
  const bodyStr = transpileBlockBody(blockNode, bodyCtx);
  const paramStr = paramNames.length > 0 ? ", " + paramNames.join(", ") : "";
  return `${prefix}at(${timesArr}, ${valuesArr}, (__b${paramStr}) => {
${bodyStr}
${ctx.indent}})`;
}
function transpileTimeWarp(argsNode, blockNode, ctx) {
  if (!blockNode) {
    const line2 = argsNode?.startPosition?.row != null ? argsNode.startPosition.row + 1 : "?";
    ctx.errors.push(`Parse error at line ${line2}: time_warp is missing 'do ... end' block`);
    return `/* parse error: time_warp missing block */`;
  }
  const offset = argsNode?.namedChildren[0] ? transpileNode(argsNode.namedChildren[0], ctx) : "0";
  const prefix = ctx.insideLoop ? "__b." : "";
  const bodyCtx = { ...ctx, insideLoop: true };
  const bodyStr = transpileBlockBody(blockNode, bodyCtx);
  return `${prefix}at([${offset}], null, (__b) => {
${bodyStr}
${ctx.indent}})`;
}
function transpileDensity(argsNode, blockNode, ctx) {
  if (!blockNode) {
    const line2 = argsNode?.startPosition?.row != null ? argsNode.startPosition.row + 1 : "?";
    ctx.errors.push(`Parse error at line ${line2}: density is missing 'do ... end' block`);
    return `/* parse error: density missing block */`;
  }
  const factor = argsNode?.namedChildren[0] ? transpileNode(argsNode.namedChildren[0], ctx) : "1";
  const bodyStr = transpileBlockBody(blockNode, ctx);
  const bRef = ctx.insideLoop ? "__b" : "__densityB";
  const lines = ["{"];
  if (!ctx.insideLoop) lines.push(`  const ${bRef} = { density: 1 }`);
  lines.push(`  const __prevDensity = ${bRef}.density`);
  lines.push(`  ${bRef}.density = __prevDensity * ${factor}`);
  lines.push(bodyStr);
  lines.push(`  ${bRef}.density = __prevDensity`);
  lines.push("}");
  return lines.join("\n" + ctx.indent);
}
function transpileSynthCommand(argsNode, ctx) {
  if (!argsNode) return `__b.play(52, { synth: "beep" })`;
  const args2 = argsNode.namedChildren;
  const synthNameNode = args2[0];
  const synthName = synthNameNode ? transpileNode(synthNameNode, ctx) : '"beep"';
  const positional = [];
  const kwargs = [`synth: ${synthName}`];
  let noteExpr = null;
  for (let i2 = 1; i2 < args2.length; i2++) {
    const arg = args2[i2];
    if (arg.type === "pair") {
      const key = arg.namedChildren[0];
      const val = arg.namedChildren[1];
      const keyName = key.type === "hash_key_symbol" ? key.text.replace(/:$/, "") : key.type === "simple_symbol" ? key.text.slice(1) : transpileNode(key, ctx);
      if (keyName === "note") {
        noteExpr = transpileNode(val, ctx);
      } else {
        kwargs.push(`${keyName}: ${transpileNode(val, ctx)}`);
      }
    } else {
      positional.push(transpileNode(arg, ctx));
    }
  }
  const optsStr = `{ ${kwargs.join(", ")} }`;
  if (positional.length > 0) {
    return `__b.play(${positional.join(", ")}, ${optsStr})`;
  }
  const note2 = noteExpr ?? "52";
  return `__b.play(${note2}, ${optsStr})`;
}
function transpileIf(node, ctx) {
  const children = node.namedChildren;
  const condition = children[0];
  const consequence = children[1];
  let result = `if (${transpileNode(condition, ctx)}) {
`;
  if (consequence) result += transpileNode(consequence, ctx) + "\n";
  result += ctx.indent + "}";
  for (let i2 = 2; i2 < children.length; i2++) {
    const child = children[i2];
    if (child.type === "elsif") {
      const elsifCond = child.namedChildren[0];
      const elsifBody = child.namedChildren[1];
      result += ` else if (${transpileNode(elsifCond, ctx)}) {
`;
      if (elsifBody) result += transpileNode(elsifBody, ctx) + "\n";
      result += ctx.indent + "}";
    } else if (child.type === "else") {
      const elseBody = child.namedChildren[0];
      result += ` else {
`;
      if (elseBody) result += transpileNode(elseBody, ctx) + "\n";
      result += ctx.indent + "}";
    }
  }
  return result;
}
function transpileUnless(node, ctx) {
  const condition = node.namedChildren[0];
  const body2 = node.namedChildren[1];
  let result = `if (!(${transpileNode(condition, ctx)})) {
`;
  if (body2) result += transpileNode(body2, ctx) + "\n";
  result += ctx.indent + "}";
  for (let i2 = 2; i2 < node.namedChildren.length; i2++) {
    const child = node.namedChildren[i2];
    if (child.type === "else") {
      const elseBody = child.namedChildren[0];
      result += ` else {
`;
      if (elseBody) result += transpileNode(elseBody, ctx) + "\n";
      result += ctx.indent + "}";
    }
  }
  return result;
}
function transpileCase(node, ctx) {
  const children = node.namedChildren;
  const expr = children[0];
  const exprStr = transpileNode(expr, ctx);
  let result = "";
  let first = true;
  for (let i2 = 1; i2 < children.length; i2++) {
    const child = children[i2];
    if (child.type === "when") {
      const pattern = child.namedChildren[0];
      child.namedChildren[1];
      child.namedChildren.filter((_, idx) => {
        return idx < child.namedChildCount - 1 || child.namedChildCount === 1;
      });
      let conditions;
      if (child.namedChildCount === 1) {
        conditions = [transpileNode(pattern, ctx)];
        const condStr2 = conditions.map((c) => `${exprStr} === ${c}`).join(" || ");
        if (first) {
          result += `if (${condStr2}) {
`;
          first = false;
        } else {
          result += ` else if (${condStr2}) {
`;
        }
        result += ctx.indent + "}";
        continue;
      }
      const patternNodes = child.namedChildren.slice(0, -1).filter((p) => p.type !== "comment");
      const bodyNode = child.namedChildren[child.namedChildCount - 1];
      conditions = patternNodes.map((p) => transpileNode(p, ctx));
      const condStr = conditions.map((c) => `${exprStr} === ${c}`).join(" || ");
      if (first) {
        result += `if (${condStr}) {
`;
        first = false;
      } else {
        result += ` else if (${condStr}) {
`;
      }
      if (bodyNode) result += transpileNode(bodyNode, ctx) + "\n";
      result += ctx.indent + "}";
    } else if (child.type === "else") {
      const elseBody = child.namedChildren[0];
      result += ` else {
`;
      if (elseBody) result += transpileNode(elseBody, ctx) + "\n";
      result += ctx.indent + "}";
    }
  }
  return result;
}
function transpileBeginRescue(node, ctx) {
  const children = node.namedChildren;
  let result = "try {\n";
  for (const child of children) {
    if (child.type === "rescue") {
      const errorVar = child.namedChildren.find((c) => c.type === "exception_variable")?.namedChildren[0]?.text ?? "_e";
      const rescueBody = child.namedChildren.find((c) => c.type === "then" || c.type === "body_statement");
      result += ctx.indent + `} catch (${errorVar}) {
`;
      if (rescueBody) result += transpileNode(rescueBody, ctx) + "\n";
    } else if (child.type === "ensure") {
      const ensureBody = child.namedChildren[0];
      result += ctx.indent + "} finally {\n";
      if (ensureBody) result += transpileNode(ensureBody, ctx) + "\n";
    } else {
      result += transpileNode(child, ctx) + "\n";
    }
  }
  result += ctx.indent + "}";
  return result;
}
function transpileString(node, ctx) {
  const hasInterpolation = node.namedChildren.some((c) => c.type === "interpolation");
  if (hasInterpolation) {
    let result = "`";
    for (const child of node.children) {
      if (child.type === '"') continue;
      if (child.type === "interpolation") {
        result += transpileNode(child, ctx);
      } else if (child.type === "string_content") {
        result += child.text;
      } else if (child.type === "escape_sequence") {
        result += child.text;
      }
    }
    result += "`";
    return result;
  }
  return node.text;
}
function transpileBlockBody(blockNode, ctx) {
  const bodyChildren = blockNode.namedChildren.filter(
    (c) => c.type !== "block_parameters"
  );
  return bodyChildren.map((c) => ctx.indent + "  " + transpileNode(c, ctx)).join("\n");
}
function transpileArgList(node, ctx, injectSrcLine = false) {
  const args2 = node.namedChildren;
  const positional = [];
  const kwargs = [];
  for (const arg of args2) {
    if (arg.type === "pair") {
      const key = arg.namedChildren[0];
      const val = arg.namedChildren[1];
      if (key.type === "hash_key_symbol") {
        kwargs.push(`${key.text.replace(/:$/, "")}: ${transpileNode(val, ctx)}`);
      } else if (key.type === "simple_symbol") {
        kwargs.push(`${key.text.slice(1)}: ${transpileNode(val, ctx)}`);
      } else {
        kwargs.push(`[${transpileNode(key, ctx)}]: ${transpileNode(val, ctx)}`);
      }
    } else {
      positional.push(transpileNode(arg, ctx));
    }
  }
  if (injectSrcLine && ctx.srcLine !== void 0) {
    kwargs.push(`_srcLine: ${ctx.srcLine}`);
  }
  if (kwargs.length > 0) {
    return [...positional, `{ ${kwargs.join(", ")} }`].join(", ");
  }
  return positional.join(", ");
}
function transpileArgListAsOpts(node, ctx) {
  const args2 = node.namedChildren;
  const opts = [];
  for (const arg of args2) {
    if (arg.type === "pair") {
      const key = arg.namedChildren[0];
      const val = arg.namedChildren[1];
      const keyName = key.type === "hash_key_symbol" ? key.text.replace(/:$/, "") : key.type === "simple_symbol" ? key.text.slice(1) : transpileNode(key, ctx);
      opts.push(`${keyName}: ${transpileNode(val, ctx)}`);
    }
  }
  return `{ ${opts.join(", ")} }`;
}
function transpileChildren(node, ctx) {
  return node.namedChildren.map((c) => transpileNode(c, ctx)).filter((s) => s.trim() !== "").join("\n");
}
function detectLanguage(code) {
  const trimmed = code.trim();
  if (/\bdo\s*(\|.*\|)?\s*$/.test(trimmed)) return "ruby";
  if (/\bend\s*$/.test(trimmed)) return "ruby";
  if (/:\w+/.test(trimmed) && !/['"`]/.test(trimmed.split(":")[0])) return "ruby";
  if (/\blive_loop\s+:/.test(trimmed)) return "ruby";
  if (/\bsample\s+:/.test(trimmed)) return "ruby";
  if (/\buse_synth\s+:/.test(trimmed)) return "ruby";
  if (/\basync\b/.test(trimmed)) return "js";
  if (/\bawait\b/.test(trimmed)) return "js";
  if (/\bb\./.test(trimmed)) return "js";
  if (/=>/.test(trimmed)) return "js";
  if (/\bconst\b|\blet\b|\bvar\b/.test(trimmed)) return "js";
  return "ruby";
}
function autoTranspileDetailed(code) {
  const lang = detectLanguage(code);
  if (lang === "js") return { code, hasError: false };
  if (!isTreeSitterReady()) {
    throw new Error("[SonicPi] TreeSitter parser not available \u2014 the audio engine may still be loading. Try clicking Run again.");
  }
  const tsResult = treeSitterTranspile(code);
  if (tsResult.errors.length > 0) {
    return { code, hasError: true, errorMessage: tsResult.errors.join("; "), method: "tree-sitter" };
  }
  try {
    new Function(tsResult.code);
  } catch (e) {
    return { code: tsResult.code, hasError: true, errorMessage: `TreeSitter produced invalid JS: ${e}`, method: "tree-sitter" };
  }
  return { code: tsResult.code, hasError: false, method: "tree-sitter" };
}

// ../../../sonicPiWeb/src/engine/SynthParams.ts
var SYNTH_PARAMS = {
  // Common params shared by most synths
  _common: [
    "note",
    "amp",
    "pan",
    "attack",
    "decay",
    "sustain",
    "release",
    "attack_level",
    "decay_level",
    "sustain_level",
    "note_slide",
    "amp_slide",
    "pan_slide",
    "cutoff",
    "cutoff_slide",
    "res"
  ],
  // Synth-specific additions (empty = uses only common)
  beep: [],
  saw: [],
  sine: [],
  square: [],
  tri: [],
  pulse: ["pulse_width", "pulse_width_slide"],
  noise: [],
  pnoise: [],
  bnoise: [],
  gnoise: [],
  cnoise: [],
  prophet: [],
  tb303: ["wave", "pulse_width", "pulse_width_slide"],
  supersaw: ["detune", "detune_slide"],
  dsaw: ["detune", "detune_slide"],
  dpulse: ["detune", "detune_slide", "pulse_width", "pulse_width_slide"],
  dtri: ["detune", "detune_slide"],
  pluck: ["noise_amp", "max_delay_time", "pluck_decay"],
  pretty_bell: [],
  piano: ["vel", "hard", "stereo_width"],
  fm: ["divisor", "depth", "depth_slide", "divisor_slide"],
  mod_fm: ["divisor", "depth", "depth_slide", "divisor_slide", "mod_phase", "mod_range", "mod_phase_slide"],
  mod_saw: ["mod_phase", "mod_range", "mod_phase_slide", "mod_width"],
  mod_pulse: ["mod_phase", "mod_range", "mod_phase_slide", "mod_width", "pulse_width", "pulse_width_slide"],
  mod_tri: ["mod_phase", "mod_range", "mod_phase_slide", "mod_width"],
  chipbass: [],
  chiplead: ["width"],
  chipnoise: ["freq_band"],
  dark_ambience: ["ring", "room", "reverb_time"],
  hollow: ["noise", "norm"],
  growl: [],
  zawa: ["wave", "phase", "phase_offset", "invert_wave", "range", "disable_wave"],
  blade: ["vibrato_rate", "vibrato_depth", "vibrato_delay", "vibrato_onset"],
  tech_saws: [],
  sound_in: ["input"],
  sound_in_stereo: ["input"]
};
var FX_PARAMS = {
  // Common params shared by most FX
  _common: ["amp", "amp_slide", "mix", "mix_slide", "pre_amp", "pre_amp_slide"],
  // FX-specific additions
  reverb: ["room", "room_slide", "damp", "damp_slide"],
  echo: ["phase", "phase_slide", "decay", "decay_slide", "max_phase"],
  delay: ["phase", "phase_slide", "decay", "decay_slide", "max_phase"],
  distortion: ["distort", "distort_slide"],
  slicer: ["phase", "phase_slide", "wave", "pulse_width", "smooth", "probability"],
  wobble: ["phase", "phase_slide", "wave", "cutoff_min", "cutoff_max", "res"],
  ixi_techno: ["phase", "phase_slide", "cutoff_min", "cutoff_max", "res"],
  compressor: ["threshold", "clamp_time", "slope_above", "slope_below", "relax_time"],
  rlpf: ["cutoff", "cutoff_slide", "res", "res_slide"],
  rhpf: ["cutoff", "cutoff_slide", "res", "res_slide"],
  hpf: ["cutoff", "cutoff_slide"],
  lpf: ["cutoff", "cutoff_slide"],
  normaliser: ["level", "level_slide"],
  pan: ["pan", "pan_slide"],
  band_eq: ["freq", "freq_slide", "res", "res_slide", "db", "db_slide"],
  flanger: ["phase", "phase_slide", "wave", "depth", "decay", "feedback", "delay"],
  krush: ["cutoff", "cutoff_slide", "res", "res_slide", "gain", "gain_slide"],
  bitcrusher: ["sample_rate", "sample_rate_slide", "bits", "bits_slide", "cutoff", "cutoff_slide"],
  ring_mod: ["freq", "freq_slide", "mod_amp", "mod_amp_slide"],
  chorus: ["phase", "phase_slide", "decay", "max_phase"],
  octaver: ["super_amp", "sub_amp", "subsub_amp"],
  vowel: ["vowel_sound", "voice"],
  tanh: ["krunch", "krunch_slide"],
  gverb: ["spread", "spread_slide", "damp", "damp_slide", "room", "release", "ref_level", "tail_level"],
  pitch_shift: ["pitch", "pitch_slide", "window_size", "pitch_dis", "time_dis"],
  whammy: ["transpose", "transpose_slide", "max_delay_time", "deltime", "grainsize"],
  tremolo: ["phase", "phase_slide", "wave", "depth", "depth_slide"],
  record: ["buffer"],
  sound_out: ["output"],
  sound_out_stereo: ["output"],
  level: [],
  mono: [],
  autotuner: ["note"]
};
function getSynthParams(synthName) {
  const common = SYNTH_PARAMS._common ?? [];
  const specific = SYNTH_PARAMS[synthName] ?? [];
  return [...common, ...specific];
}
function getFxParams(fxName) {
  const common = FX_PARAMS._common ?? [];
  const specific = FX_PARAMS[fxName] ?? [];
  return [...common, ...specific];
}

// ../../../sonicPiWeb/src/engine/FriendlyErrors.ts
var KNOWN_SYNTHS = [
  "beep",
  "saw",
  "prophet",
  "tb303",
  "supersaw",
  "pluck",
  "pretty_bell",
  "piano",
  "dsaw",
  "dpulse",
  "dtri",
  "fm",
  "mod_fm",
  "mod_saw",
  "mod_pulse",
  "mod_tri",
  "sine",
  "square",
  "tri",
  "pulse",
  "noise",
  "pnoise",
  "bnoise",
  "gnoise",
  "cnoise",
  "chipbass",
  "chiplead",
  "chipnoise",
  "dark_ambience",
  "hollow",
  "growl",
  "zawa",
  "blade",
  "tech_saws",
  "sound_in",
  "sound_in_stereo"
];
var KNOWN_SAMPLES = [
  "bd_haus",
  "bd_zum",
  "bd_808",
  "bd_boom",
  "bd_klub",
  "bd_pure",
  "bd_tek",
  "sn_dub",
  "sn_dolf",
  "sn_zome",
  "sn_generic",
  "hat_snap",
  "hat_cab",
  "hat_raw",
  "loop_amen",
  "loop_breakbeat",
  "loop_compus",
  "loop_garzul",
  "loop_industrial",
  "ambi_choir",
  "ambi_dark_woosh",
  "ambi_drone",
  "ambi_glass_hum",
  "ambi_lunar_land",
  "bass_dnb_f",
  "bass_hit_c",
  "bass_thick_c",
  "bass_voxy_c",
  "elec_beep",
  "elec_bell",
  "elec_blip",
  "elec_chime",
  "elec_ping",
  "perc_bell",
  "perc_snap",
  "perc_swoosh"
];
var KNOWN_FX = [
  "reverb",
  "echo",
  "delay",
  "distortion",
  "slicer",
  "wobble",
  "ixi_techno",
  "compressor",
  "rlpf",
  "rhpf",
  "hpf",
  "lpf",
  "normaliser",
  "pan",
  "band_eq",
  "flanger",
  "krush",
  "bitcrusher",
  "ring_mod",
  "chorus",
  "octaver",
  "vowel",
  "tanh",
  "gverb",
  "pitch_shift",
  "whammy",
  "tremolo",
  "record",
  "sound_out",
  "sound_out_stereo",
  "level",
  "mono",
  "autotuner"
];
function extractLineFromStack(err2, lineOffset) {
  const msg = err2.message ?? "";
  const stack = err2.stack ?? "";
  const syntaxMatch = msg.match(/line\s+(\d+)/i) ?? stack.match(/Function.*?:(\d+):\d+/) ?? stack.match(/<anonymous>:(\d+):\d+/) ?? stack.match(/eval.*?:(\d+):\d+/);
  if (syntaxMatch) {
    const raw = parseInt(syntaxMatch[1], 10);
    const wrapperLines = lineOffset > 0 ? lineOffset : SANDBOX_WRAPPER_LINES;
    const adjusted = raw - wrapperLines;
    return adjusted > 0 ? adjusted : raw > 0 ? 1 : void 0;
  }
  const runtimeMatch = stack.match(/<anonymous>:(\d+):\d+/) ?? stack.match(/eval.*?:(\d+):\d+/);
  if (runtimeMatch) {
    const raw = parseInt(runtimeMatch[1], 10);
    const wrapperLines = lineOffset > 0 ? lineOffset : SANDBOX_WRAPPER_LINES;
    const adjusted = raw - wrapperLines;
    return adjusted > 0 ? adjusted : 1;
  }
  return void 0;
}
function closestMatch(input, candidates) {
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = editDistance(input.toLowerCase(), c.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return bestDist <= 3 ? best : null;
}
function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i2 = 0; i2 <= m; i2++) dp[i2][0] = i2;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i2 = 1; i2 <= m; i2++) {
    for (let j = 1; j <= n; j++) {
      dp[i2][j] = a[i2 - 1] === b[j - 1] ? dp[i2 - 1][j - 1] : 1 + Math.min(dp[i2 - 1][j], dp[i2][j - 1], dp[i2 - 1][j - 1]);
    }
  }
  return dp[m][n];
}
var ERROR_PATTERNS = [
  // Unknown synth
  {
    test: (msg) => /unknown synth|synthdef.*not found|loadSynthDef/i.test(msg),
    transform: (msg) => {
      const nameMatch = msg.match(/sonic-pi-(\w+)/i) ?? msg.match(/synth[:\s]+["']?(\w+)["']?/i);
      const name2 = nameMatch?.[1]?.replace("sonic-pi-", "") ?? "unknown";
      const suggestion = closestMatch(name2, KNOWN_SYNTHS);
      return {
        title: `Synth :${name2} not found`,
        message: `I don't know a synth called :${name2}.` + (suggestion ? ` Did you mean :${suggestion}?` : "") + `

Available synths include: ${KNOWN_SYNTHS.slice(0, 8).map((s) => ":" + s).join(", ")}...

Try: use_synth("${suggestion ?? "beep"}")`
      };
    }
  },
  // Unknown sample
  {
    test: (msg) => /sample.*not found|loadSample.*failed|sample.*flac/i.test(msg),
    transform: (msg) => {
      const nameMatch = msg.match(/sample[:\s]*["']?(\w+)["']?/i) ?? msg.match(/(\w+)\.flac/i);
      const name2 = nameMatch?.[1] ?? "unknown";
      const suggestion = closestMatch(name2, KNOWN_SAMPLES);
      return {
        title: `Sample :${name2} not found`,
        message: `I couldn't find a sample called :${name2}.` + (suggestion ? ` Did you mean :${suggestion}?` : "") + `

Some built-in samples: ${KNOWN_SAMPLES.slice(0, 6).map((s) => ":" + s).join(", ")}...`
      };
    }
  },
  // Unknown FX
  {
    test: (msg) => /unknown fx|fx.*not found|loadSynthDef.*fx/i.test(msg),
    transform: (msg) => {
      const nameMatch = msg.match(/sonic-pi-fx_(\w+)/i) ?? msg.match(/fx[:\s]+["']?(\w+)["']?/i);
      const name2 = nameMatch?.[1]?.replace("sonic-pi-fx_", "") ?? "unknown";
      const suggestion = closestMatch(name2, KNOWN_FX);
      return {
        title: `FX :${name2} not found`,
        message: `I don't know an FX called :${name2}.` + (suggestion ? ` Did you mean :${suggestion}?` : "") + `

Available FX include: ${KNOWN_FX.slice(0, 8).map((f) => ":" + f).join(", ")}...`
      };
    }
  },
  // Unknown parameter for synth or FX
  {
    test: (msg) => /unknown param|invalid.*param|unrecognised.*param|unrecognized.*param/i.test(msg),
    transform: (msg) => {
      const synthMatch = msg.match(/synth[:\s]+["']?(\w+)["']?/i);
      const fxMatch = msg.match(/fx[:\s]+["']?(\w+)["']?/i);
      const paramMatch = msg.match(/param(?:eter)?[:\s]+["']?(\w+)["']?/i);
      const badParam = paramMatch?.[1] ?? "unknown";
      const isFx = !!fxMatch;
      const name2 = fxMatch?.[1] ?? synthMatch?.[1] ?? "unknown";
      const validParams = isFx ? getFxParams(name2) : getSynthParams(name2);
      const suggestion = validParams.length > 0 ? closestMatch(badParam, validParams) : null;
      const kind = isFx ? "FX" : "synth";
      return {
        title: `Unknown parameter :${badParam} for ${kind} :${name2}`,
        message: `The ${kind} :${name2} doesn't have a parameter called :${badParam}.` + (suggestion ? ` Did you mean :${suggestion}?` : "") + `

Valid parameters for :${name2} include:
  ` + validParams.slice(0, 12).map((p) => ":" + p).join(", ") + (validParams.length > 12 ? "..." : "")
      };
    }
  },
  // Note out of range or invalid
  {
    test: (msg) => /invalid note|note.*range|unknown note|cannot convert.*note/i.test(msg),
    transform: (msg) => ({
      title: "Invalid note",
      message: `That doesn't look like a valid note.

Notes can be:
  - MIDI numbers: play(60)  (middle C)
  - Note names:   play("c4"), play("fs3"), play("eb5")
  - Symbols:      play("c4")  (use strings in JS, not Ruby symbols)`
    })
  },
  // sleep with bad value
  {
    test: (msg) => /sleep.*NaN|sleep.*undefined|sleep.*negative/i.test(msg),
    transform: (msg) => ({
      title: "Invalid sleep value",
      message: `sleep() needs a positive number of beats.

Examples:
  sleep(1)     \u2192 wait 1 beat
  sleep(0.5)   \u2192 wait half a beat
  sleep(0.25)  \u2192 wait a quarter beat`
    })
  },
  // Not initialized
  {
    test: (msg) => /not initialized|call init/i.test(msg),
    transform: () => ({
      title: "Engine not ready",
      message: `The sound engine hasn't started yet.

Make sure to call init() before evaluating code:
  const engine = new SonicPiEngine()
  await engine.init()
  await engine.evaluate(code)`
    })
  },
  // Unknown task
  {
    test: (msg) => /unknown task/i.test(msg),
    transform: (msg) => {
      const nameMatch = msg.match(/task[:\s]*["']?(\w+)["']?/i);
      const name2 = nameMatch?.[1] ?? "unknown";
      return {
        title: `Unknown loop: ${name2}`,
        message: `There's no live_loop called "${name2}" running.

Make sure your code defines the loop:
  live_loop("${name2}", async ({play, sleep}) => {
    await play(60)
    await sleep(1)
  })`
      };
    }
  },
  // Transpile failure — code couldn't be converted to JS
  {
    test: (msg) => /transpile|tree-?sitter|invalid js output/i.test(msg),
    transform: (msg) => {
      const detail = msg.replace(/.*?:\s*/, "");
      return {
        title: "Code couldn't be understood",
        message: `Your code has a syntax issue the transpiler couldn't handle.

Detail: ${detail}

Common causes:
  - Unclosed do/end block (every "do" needs a matching "end")
  - Missing comma between arguments
  - Unsupported Ruby syntax (not all Ruby features are available)

Tip: Try commenting out sections to find which part causes the issue.`
      };
    }
  },
  // Infinite loop detected
  {
    test: (msg) => /infinite loop|did you forget.*sleep/i.test(msg),
    transform: () => ({
      title: "Infinite loop detected",
      message: `Your code is running in a tight loop without sleeping.

Every live_loop and loop needs a sleep:

  live_loop :drums do
    sample :bd_haus
    sleep 0.5          # \u2190 don't forget this!
  end

Without sleep, the loop runs thousands of times per second and freezes the browser.`
    })
  },
  // Nil/undefined access (very common with get/set)
  {
    test: (msg) => /cannot read prop.*of undefined|cannot read prop.*of null|undefined is not an object/i.test(msg),
    transform: (msg) => {
      const propMatch = msg.match(/property '(\w+)'/i) ?? msg.match(/property "(\w+)"/i);
      const prop = propMatch?.[1] ?? "unknown";
      return {
        title: "Trying to use something that doesn't exist yet",
        message: `You tried to access .${prop} on something that is nil/undefined.

Common causes:
  - Using get[:name] before set :name was called
  - Variable not yet assigned in this iteration
  - case/when didn't match any branch (variables inside when are undefined outside)

Tip: Make sure set() runs before get[], or provide a default:
  val = get[:myval] || 0`
      };
    }
  },
  // Wrong number of arguments
  {
    test: (msg) => /expected \d+ arguments|takes \d+ arguments|too (many|few) arguments/i.test(msg),
    transform: (msg) => ({
      title: "Wrong number of arguments",
      message: `${msg}

Check the function signature. In Sonic Pi:
  play 60                    \u2192 one note
  play 60, amp: 0.5          \u2192 note + options
  sample :bd_haus, rate: 2   \u2192 sample + options

Options use key: value syntax (colon after the name).`
    })
  },
  // Stack overflow (deeply nested calls)
  {
    test: (msg) => /maximum call stack|stack overflow/i.test(msg),
    transform: () => ({
      title: "Code nested too deeply",
      message: `Your code has too many nested calls \u2014 it ran out of stack space.

Common causes:
  - A define function calling itself without stopping (infinite recursion)
  - Very deeply nested with_fx blocks (try reducing nesting)

Tip: Make sure recursive functions have a base case that stops the recursion.`
    })
  },
  // Redeclaration error (const/let)
  {
    test: (msg) => /redeclaration|has already been declared|identifier.*already/i.test(msg),
    transform: (msg) => {
      const varMatch = msg.match(/(?:of\s+|identifier\s+)'?(\w+)'?/i);
      const name2 = varMatch?.[1] ?? "variable";
      return {
        title: `"${name2}" declared twice`,
        message: `The variable "${name2}" is being declared more than once.

In Sonic Pi, you can reassign variables freely:
  x = 1
  x = 2    # \u2190 this is fine

If you're seeing this error, it may be a transpiler issue.
Try renaming the variable or restarting.`
      };
    }
  },
  // Invalid note / NaN play
  {
    test: (msg) => /NaN.*play|play.*NaN|invalid.*midi/i.test(msg),
    transform: () => ({
      title: "Note couldn't be played",
      message: `The note value resolved to something that isn't a valid pitch.

Valid notes:
  play 60          \u2192 MIDI note 60 (middle C)
  play :c4          \u2192 C in octave 4
  play :eb3         \u2192 E-flat in octave 3
  play :fs5         \u2192 F-sharp in octave 5

Note: Sharps use "s" (not #), flats use "b".`
    })
  },
  // Type errors (common JS mistakes)
  {
    test: (msg) => /is not a function/i.test(msg),
    transform: (msg) => {
      const fnMatch = msg.match(/(\w+) is not a function/i);
      const fn = fnMatch?.[1] ?? "unknown";
      return {
        title: `${fn} is not a function`,
        message: `Hmm, "${fn}" isn't available as a function here.

Common causes:
  - Typo in function name
  - Using a Ruby method that hasn't been implemented yet
  - Calling a DSL function outside a live_loop`
      };
    }
  },
  // ReferenceError (undefined variable)
  {
    test: (msg) => /is not defined/i.test(msg),
    transform: (msg) => {
      const varMatch = msg.match(/(\w+) is not defined/i);
      const name2 = varMatch?.[1] ?? "unknown";
      return {
        title: `${name2} is not defined`,
        message: `I don't know what "${name2}" means.

If this is a Sonic Pi symbol like :${name2}, use a string instead: "${name2}"
If this is a variable, make sure to define it with let or const first.`
      };
    }
  },
  // Parse errors from TreeSitter transpiler (contain "Parse error at line N")
  {
    test: (msg) => /parse error at line/i.test(msg),
    transform: (msg) => {
      const errors = msg.split(";").map((s) => s.trim()).filter(Boolean);
      const formatted = errors.map((e) => `  ${e}`).join("\n");
      const lineMatch = msg.match(/parse error at line (\d+)/i);
      const line2 = lineMatch ? parseInt(lineMatch[1], 10) : void 0;
      return {
        title: "Syntax error \u2014 your code could not be parsed",
        message: `${formatted}

Check for:
  - Missing "do" after live_loop :name
  - Unclosed do/end blocks
  - Mismatched quotes or parentheses`,
        line: line2
      };
    }
  },
  // Syntax errors (JS-level, from new Function())
  {
    test: (msg) => /syntaxerror|unexpected token|unexpected end/i.test(msg),
    transform: (msg) => ({
      title: "Syntax error",
      message: `There's a syntax problem in your code.

Common causes:
  - Missing closing bracket ) or }
  - Using Ruby do/end instead of JS { }
  - Missing comma between arguments

Tip: If you're writing Sonic Pi syntax, the transpiler handles most Ruby \u2192 JS conversion automatically.`
    })
  }
];
function friendlyError(err2, lineOffset = 0) {
  const msg = err2.message;
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(msg)) {
      const result = pattern.transform(msg, err2);
      return {
        title: result.title,
        message: result.message,
        line: result.line ?? extractLineFromStack(err2, lineOffset),
        original: err2
      };
    }
  }
  return {
    title: "Something went wrong",
    message: `${msg}

If this keeps happening, try simplifying your code and adding things back one at a time.`,
    line: extractLineFromStack(err2, lineOffset),
    original: err2
  };
}
function formatFriendlyError(fe) {
  const lineInfo = fe.line ? ` (line ${fe.line})` : "";
  return `\u2500\u2500 ${fe.title}${lineInfo} \u2500\u2500

${fe.message}`;
}

// ../../../sonicPiWeb/src/engine/Stratum.ts
function detectStratum(code) {
  const joined = code.replace(/\/\/.*$/gm, "");
  const s3Patterns = [
    /\bMath\.random\b/,
    /\bDate\.now\b/,
    /\bfetch\b/,
    /\bXMLHttpRequest\b/,
    /\bsync\s*\(/,
    /\bcue\s*\(/
  ];
  for (const pattern of s3Patterns) {
    if (pattern.test(joined)) return 3 /* S3 */;
  }
  if (/^\s*(let|var)\s+\w+/m.test(joined)) {
    if (/\w+\s*(\+\+|--|(\+|-|\*|\/)?=)/.test(joined)) {
      return 3 /* S3 */;
    }
  }
  const s2Patterns = [
    /\brrand\b/,
    /\brrand_i\b/,
    /\bchoose\b/,
    /\bdice\b/,
    /\buse_random_seed\b/
  ];
  for (const pattern of s2Patterns) {
    if (pattern.test(joined)) return 2 /* S2 */;
  }
  return 1 /* S1 */;
}

// ../../../sonicPiWeb/src/engine/SoundEventStream.ts
var SoundEventStream = class {
  constructor() {
    this.handlers = /* @__PURE__ */ new Set();
  }
  on(handler) {
    this.handlers.add(handler);
  }
  off(handler) {
    this.handlers.delete(handler);
  }
  /** Emit a sound event to all subscribers. */
  emitEvent(event) {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
      }
    }
  }
  dispose() {
    this.handlers.clear();
  }
};

// ../../../sonicPiWeb/src/engine/MidiBridge.ts
var NOTE_ON = 144;
var NOTE_OFF = 128;
var CONTROL_CHANGE = 176;
var PITCH_BEND = 224;
var CHANNEL_PRESSURE = 208;
var POLY_PRESSURE = 160;
var PROGRAM_CHANGE = 192;
var MIDI_TIMING_CLOCK = 248;
var CHANNEL_NIBBLE_MASK = 15;
var MIDI_DATA_MASK = 127;
var MIDI_CLOCKS_PER_QUARTER_NOTE = 24;
var PITCH_BEND_14BIT_MAX = 16383;
var ALL_NOTES_OFF_CC = 123;
var SECONDS_PER_MINUTE = 60;
var MidiBridge = class {
  constructor() {
    this.midiAccess = null;
    /** All selected output ports — sends go to every one. */
    this.selectedOutputs = [];
    this.selectedInputs = [];
    this.inputListeners = /* @__PURE__ */ new Map();
    this.handlers = [];
    /** Last CC value per "controller:channel". */
    this.ccState = /* @__PURE__ */ new Map();
    /**
     * Last pitch bend per channel.
     * Stored as normalised float in [-1, 1].
     * Raw 14-bit value: 0x0000 = -1, 0x2000 = 0, 0x3FFF = +1.
     */
    this.pitchBendState = /* @__PURE__ */ new Map();
    this.noteOnState = /* @__PURE__ */ new Map();
    this.noteOffState = /* @__PURE__ */ new Map();
    /** Running MIDI clock interval (started by startClock / stopped by stopClock). */
    this.clockInterval = null;
  }
  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------
  /** Request MIDI access from the browser. */
  async init() {
    if (!navigator.requestMIDIAccess) {
      console.warn("[MIDI] Web MIDI API not available in this browser");
      return false;
    }
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      return true;
    } catch (err2) {
      console.warn("[MIDI] Access denied:", err2);
      return false;
    }
  }
  /** List available MIDI devices. */
  getDevices() {
    if (!this.midiAccess) return [];
    const devices = [];
    this.midiAccess.inputs.forEach((input) => {
      devices.push({ id: input.id, name: input.name ?? input.id, type: "input" });
    });
    this.midiAccess.outputs.forEach((output) => {
      devices.push({ id: output.id, name: output.name ?? output.id, type: "output" });
    });
    return devices;
  }
  // ---------------------------------------------------------------------------
  // Device selection (multi-output, multi-input)
  // ---------------------------------------------------------------------------
  /**
   * Add an output device to the active set.
   * All subsequent send calls go to every selected output.
   */
  selectOutput(deviceId) {
    if (!this.midiAccess) return false;
    const output = this.midiAccess.outputs.get(deviceId);
    if (!output) return false;
    if (!this.selectedOutputs.some((o) => o.id === deviceId)) {
      this.selectedOutputs.push(output);
    }
    return true;
  }
  /** Remove an output device from the active set. */
  deselectOutput(deviceId) {
    this.selectedOutputs = this.selectedOutputs.filter((o) => o.id !== deviceId);
  }
  /** Clear all selected outputs. */
  clearOutputs() {
    this.selectedOutputs = [];
  }
  /**
   * Add an input device. Incoming MIDI fires registered event handlers.
   * Multiple inputs are supported simultaneously.
   */
  selectInput(deviceId) {
    if (!this.midiAccess) return false;
    if (this.inputListeners.has(deviceId)) return true;
    const input = this.midiAccess.inputs.get(deviceId);
    if (!input) return false;
    const listener = (e) => this.handleMidiMessage(e);
    input.addEventListener("midimessage", listener);
    this.inputListeners.set(deviceId, listener);
    this.selectedInputs.push(input);
    return true;
  }
  /** Stop listening on an input device. */
  deselectInput(deviceId) {
    const listener = this.inputListeners.get(deviceId);
    if (!listener) return;
    const input = this.selectedInputs.find((i2) => i2.id === deviceId);
    if (input) input.removeEventListener("midimessage", listener);
    this.inputListeners.delete(deviceId);
    this.selectedInputs = this.selectedInputs.filter((i2) => i2.id !== deviceId);
  }
  /** Register a handler for all incoming MIDI events. */
  onMidiEvent(handler) {
    this.handlers.push(handler);
  }
  // ---------------------------------------------------------------------------
  // Output — notes
  // ---------------------------------------------------------------------------
  /** Send MIDI note on. Channel 1-16, note 0-127, velocity 0-127. */
  noteOn(note2, velocity = 100, channel = 1) {
    const status = NOTE_ON | channel - 1 & CHANNEL_NIBBLE_MASK;
    this.send([status, note2 & MIDI_DATA_MASK, velocity & MIDI_DATA_MASK]);
  }
  /** Send MIDI note off. */
  noteOff(note2, channel = 1) {
    const status = NOTE_OFF | channel - 1 & CHANNEL_NIBBLE_MASK;
    this.send([status, note2 & MIDI_DATA_MASK, 0]);
  }
  // ---------------------------------------------------------------------------
  // Output — continuous controllers
  // ---------------------------------------------------------------------------
  /** Send MIDI CC (control change). controller 0-127, value 0-127. */
  cc(controller, value, channel = 1) {
    const status = CONTROL_CHANGE | channel - 1 & CHANNEL_NIBBLE_MASK;
    this.send([status, controller & MIDI_DATA_MASK, value & MIDI_DATA_MASK]);
  }
  /** Send all notes off on a channel (CC 123). */
  allNotesOff(channel = 1) {
    this.cc(ALL_NOTES_OFF_CC, 0, channel);
  }
  /**
   * Send MIDI pitch bend. val is normalised [-1, 1] (0 = centre).
   * Maps to 14-bit value: 0x2000 = centre, 0x0000 = -1, 0x3FFF = +1.
   */
  pitchBend(val, channel = 1) {
    const clamped = Math.max(-1, Math.min(1, val));
    const raw = Math.round((clamped + 1) * 0.5 * PITCH_BEND_14BIT_MAX);
    const lsb = raw & MIDI_DATA_MASK;
    const msb = raw >> 7 & MIDI_DATA_MASK;
    const status = PITCH_BEND | channel - 1 & CHANNEL_NIBBLE_MASK;
    this.send([status, lsb, msb]);
  }
  /**
   * Send MIDI channel pressure (aftertouch). val 0-127.
   * Affects all notes on the channel.
   */
  channelPressure(val, channel = 1) {
    const status = CHANNEL_PRESSURE | channel - 1 & CHANNEL_NIBBLE_MASK;
    this.send([status, val & MIDI_DATA_MASK]);
  }
  /**
   * Send MIDI polyphonic key pressure. val 0-127.
   * Targets a specific note on the channel.
   */
  polyPressure(note2, val, channel = 1) {
    const status = POLY_PRESSURE | channel - 1 & CHANNEL_NIBBLE_MASK;
    this.send([status, note2 & MIDI_DATA_MASK, val & MIDI_DATA_MASK]);
  }
  /**
   * Send MIDI program change. program 0-127.
   * Switches the sound/patch on the receiving device.
   */
  programChange(program, channel = 1) {
    const status = PROGRAM_CHANGE | channel - 1 & CHANNEL_NIBBLE_MASK;
    this.send([status, program & MIDI_DATA_MASK]);
  }
  // ---------------------------------------------------------------------------
  // Output — MIDI clock & transport
  // ---------------------------------------------------------------------------
  /** Send a single MIDI timing clock pulse (0xF8). 24 per quarter note. */
  clockTick() {
    this.send([MIDI_TIMING_CLOCK]);
  }
  /**
   * Start a continuous MIDI clock at the given BPM.
   * Sends 24 pulses per quarter note using setInterval.
   * Call stopClock() to halt. Safe to call multiple times — restarts the clock.
   */
  startClock(bpm) {
    this.stopClock();
    const intervalMs = SECONDS_PER_MINUTE / bpm / MIDI_CLOCKS_PER_QUARTER_NOTE * 1e3;
    this.clockInterval = setInterval(() => this.clockTick(), intervalMs);
  }
  /** Stop the running MIDI clock. */
  stopClock() {
    if (this.clockInterval !== null) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  }
  /** Send MIDI Start (0xFA) — tells external devices to begin playback. */
  midiStart() {
    this.send([250]);
  }
  /** Send MIDI Stop (0xFC) — tells external devices to stop. */
  midiStop() {
    this.send([252]);
  }
  /** Send MIDI Continue (0xFB) — resume from current position. */
  midiContinue() {
    this.send([251]);
  }
  // ---------------------------------------------------------------------------
  // Input state readers
  // ---------------------------------------------------------------------------
  /**
   * Return the most recently received CC value (0–127) for a controller.
   * Matches Sonic Pi's get_cc(controller, channel: 1).
   * Returns 0 if no CC has been received.
   */
  getCCValue(controller, channel = 1) {
    return this.ccState.get(`${controller}:${channel}`) ?? 0;
  }
  /** Inject a CC value — used in tests and for programmatic control. */
  setCCValue(controller, value, channel = 1) {
    this.ccState.set(`${controller}:${channel}`, value);
  }
  getLastNoteOn(channel = 1) {
    return this.noteOnState.get(`${channel}`) ?? null;
  }
  getLastNoteOff(channel = 1) {
    return this.noteOffState.get(`${channel}`) ?? null;
  }
  /**
   * Return the most recently received pitch bend normalised to [-1, 1].
   * Returns 0 (centre) if no pitch bend message has been received.
   */
  getPitchBend(channel = 1) {
    return this.pitchBendState.get(channel) ?? 0;
  }
  // ---------------------------------------------------------------------------
  // Internal — input parsing
  // ---------------------------------------------------------------------------
  handleMidiMessage(e) {
    const data = e.data;
    if (!data || data.length < 1) return;
    const status = data[0] & 240;
    const channel = (data[0] & 15) + 1;
    switch (status) {
      case 144:
        if (data.length >= 3 && data[2] > 0) {
          this.emit({ type: "note_on", channel, note: data[1], velocity: data[2] });
          this.noteOnState.set(`${channel}`, { note: data[1], velocity: data[2] });
        } else {
          this.emit({ type: "note_off", channel, note: data[1] });
          this.noteOffState.set(`${channel}`, data[1]);
        }
        break;
      case 128:
        this.emit({ type: "note_off", channel, note: data[1] });
        this.noteOffState.set(`${channel}`, data[1]);
        break;
      case 176: {
        if (data.length < 3) break;
        const ccNum = data[1];
        const ccVal = data[2];
        this.ccState.set(`${ccNum}:${channel}`, ccVal);
        this.emit({ type: "cc", channel, cc: ccNum, value: ccVal });
        break;
      }
      case 224: {
        if (data.length < 3) break;
        const raw = data[2] << 7 | data[1];
        const normalised = (raw - 8192) / 8192;
        this.pitchBendState.set(channel, normalised);
        this.emit({ type: "pitch_bend", channel, value: normalised });
        break;
      }
      case 208: {
        if (data.length < 2) break;
        this.emit({ type: "channel_pressure", channel, value: data[1] });
        break;
      }
      case 160: {
        if (data.length < 3) break;
        this.emit({ type: "poly_pressure", channel, note: data[1], value: data[2] });
        break;
      }
    }
  }
  send(data) {
    for (const output of this.selectedOutputs) {
      try {
        output.send(data);
      } catch {
      }
    }
  }
  emit(event) {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
      }
    }
  }
  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------
  dispose() {
    this.stopClock();
    for (const [id, listener] of this.inputListeners) {
      const input = this.selectedInputs.find((i2) => i2.id === id);
      if (input) input.removeEventListener("midimessage", listener);
    }
    this.inputListeners.clear();
    this.selectedInputs = [];
    this.selectedOutputs = [];
    this.midiAccess = null;
    this.handlers = [];
  }
};

// ../../../sonicPiWeb/src/engine/SampleCatalog.ts
var SAMPLES = [
  // Bass drums
  { name: "bd_808", category: "bass drum" },
  { name: "bd_boom", category: "bass drum" },
  { name: "bd_fat", category: "bass drum" },
  { name: "bd_gas", category: "bass drum" },
  { name: "bd_haus", category: "bass drum" },
  { name: "bd_klub", category: "bass drum" },
  { name: "bd_pure", category: "bass drum" },
  { name: "bd_tek", category: "bass drum" },
  { name: "bd_zum", category: "bass drum" },
  // Snares
  { name: "sn_dolf", category: "snare" },
  { name: "sn_dub", category: "snare" },
  { name: "sn_generic", category: "snare" },
  { name: "sn_zome", category: "snare" },
  // Hi-hats
  { name: "hat_bdu", category: "hi-hat" },
  { name: "hat_cab", category: "hi-hat" },
  { name: "hat_cats", category: "hi-hat" },
  { name: "hat_em", category: "hi-hat" },
  { name: "hat_gem", category: "hi-hat" },
  { name: "hat_metal", category: "hi-hat" },
  { name: "hat_noiz", category: "hi-hat" },
  { name: "hat_raw", category: "hi-hat" },
  { name: "hat_snap", category: "hi-hat" },
  { name: "hat_star", category: "hi-hat" },
  { name: "hat_tap", category: "hi-hat" },
  { name: "hat_zild", category: "hi-hat" },
  // Loops
  { name: "loop_amen", category: "loop" },
  { name: "loop_amen_full", category: "loop" },
  { name: "loop_breakbeat", category: "loop" },
  { name: "loop_compus", category: "loop" },
  { name: "loop_garzul", category: "loop" },
  { name: "loop_industrial", category: "loop" },
  { name: "loop_mika", category: "loop" },
  { name: "loop_safari", category: "loop" },
  { name: "loop_tabla", category: "loop" },
  // Ambient
  { name: "ambi_choir", category: "ambient" },
  { name: "ambi_dark_woosh", category: "ambient" },
  { name: "ambi_drone", category: "ambient" },
  { name: "ambi_glass_hum", category: "ambient" },
  { name: "ambi_glass_rub", category: "ambient" },
  { name: "ambi_haunted_hum", category: "ambient" },
  { name: "ambi_lunar_land", category: "ambient" },
  { name: "ambi_piano", category: "ambient" },
  { name: "ambi_sauna", category: "ambient" },
  { name: "ambi_soft_buzz", category: "ambient" },
  { name: "ambi_swoosh", category: "ambient" },
  // Bass
  { name: "bass_dnb_f", category: "bass" },
  { name: "bass_drop_c", category: "bass" },
  { name: "bass_hard_c", category: "bass" },
  { name: "bass_hit_c", category: "bass" },
  { name: "bass_thick_c", category: "bass" },
  { name: "bass_voxy_c", category: "bass" },
  { name: "bass_voxy_hit_c", category: "bass" },
  { name: "bass_woodsy_c", category: "bass" },
  // Electronic
  { name: "elec_beep", category: "electronic" },
  { name: "elec_bell", category: "electronic" },
  { name: "elec_blip", category: "electronic" },
  { name: "elec_blip2", category: "electronic" },
  { name: "elec_blup", category: "electronic" },
  { name: "elec_bong", category: "electronic" },
  { name: "elec_chime", category: "electronic" },
  { name: "elec_cymbal", category: "electronic" },
  { name: "elec_filt_snare", category: "electronic" },
  { name: "elec_flip", category: "electronic" },
  { name: "elec_fuzz_tom", category: "electronic" },
  { name: "elec_hollow_kick", category: "electronic" },
  { name: "elec_lo_snare", category: "electronic" },
  { name: "elec_mid_snare", category: "electronic" },
  { name: "elec_ping", category: "electronic" },
  { name: "elec_plip", category: "electronic" },
  { name: "elec_pop", category: "electronic" },
  { name: "elec_snare", category: "electronic" },
  { name: "elec_soft_kick", category: "electronic" },
  { name: "elec_tick", category: "electronic" },
  { name: "elec_triangle", category: "electronic" },
  { name: "elec_twang", category: "electronic" },
  { name: "elec_twip", category: "electronic" },
  { name: "elec_wood", category: "electronic" },
  // Percussion
  { name: "perc_bell", category: "percussion" },
  { name: "perc_snap", category: "percussion" },
  { name: "perc_snap2", category: "percussion" },
  { name: "perc_swoosh", category: "percussion" },
  { name: "perc_till", category: "percussion" },
  // Tabla
  { name: "tabla_dhec", category: "tabla" },
  { name: "tabla_ghe1", category: "tabla" },
  { name: "tabla_ghe2", category: "tabla" },
  { name: "tabla_ghe3", category: "tabla" },
  { name: "tabla_ghe4", category: "tabla" },
  { name: "tabla_ghe5", category: "tabla" },
  { name: "tabla_ghe6", category: "tabla" },
  { name: "tabla_ghe7", category: "tabla" },
  { name: "tabla_ghe8", category: "tabla" },
  { name: "tabla_ke1", category: "tabla" },
  { name: "tabla_ke2", category: "tabla" },
  { name: "tabla_ke3", category: "tabla" },
  { name: "tabla_na", category: "tabla" },
  { name: "tabla_na_o", category: "tabla" },
  { name: "tabla_na_s", category: "tabla" },
  { name: "tabla_re", category: "tabla" },
  { name: "tabla_tas1", category: "tabla" },
  { name: "tabla_tas2", category: "tabla" },
  { name: "tabla_tas3", category: "tabla" },
  { name: "tabla_te1", category: "tabla" },
  { name: "tabla_te2", category: "tabla" },
  { name: "tabla_te_m", category: "tabla" },
  { name: "tabla_te_ne", category: "tabla" },
  { name: "tabla_tun1", category: "tabla" },
  { name: "tabla_tun2", category: "tabla" },
  { name: "tabla_tun3", category: "tabla" },
  // Vinyl
  { name: "vinyl_backspin", category: "vinyl" },
  { name: "vinyl_hiss", category: "vinyl" },
  { name: "vinyl_rewind", category: "vinyl" },
  { name: "vinyl_scratch", category: "vinyl" },
  // --- Missing samples added from Desktop SP synthinfo.rb ---
  // Bass drums (missing)
  { name: "bd_ada", category: "bass drum" },
  { name: "bd_sone", category: "bass drum" },
  { name: "bd_zome", category: "bass drum" },
  { name: "bd_mehackit", category: "bass drum" },
  { name: "bd_chip", category: "bass drum" },
  { name: "bd_jazz", category: "bass drum" },
  // Drum kit
  { name: "drum_bass_hard", category: "drum" },
  { name: "drum_bass_soft", category: "drum" },
  { name: "drum_cowbell", category: "drum" },
  { name: "drum_cymbal_closed", category: "drum" },
  { name: "drum_cymbal_hard", category: "drum" },
  { name: "drum_cymbal_open", category: "drum" },
  { name: "drum_cymbal_pedal", category: "drum" },
  { name: "drum_cymbal_soft", category: "drum" },
  { name: "drum_heavy_kick", category: "drum" },
  { name: "drum_roll", category: "drum" },
  { name: "drum_snare_hard", category: "drum" },
  { name: "drum_snare_soft", category: "drum" },
  { name: "drum_splash_hard", category: "drum" },
  { name: "drum_splash_soft", category: "drum" },
  { name: "drum_tom_hi_hard", category: "drum" },
  { name: "drum_tom_hi_soft", category: "drum" },
  { name: "drum_tom_lo_hard", category: "drum" },
  { name: "drum_tom_lo_soft", category: "drum" },
  { name: "drum_tom_mid_hard", category: "drum" },
  { name: "drum_tom_mid_soft", category: "drum" },
  // Guitar
  { name: "guit_harmonics", category: "guitar" },
  { name: "guit_e_fifths", category: "guitar" },
  { name: "guit_e_slide", category: "guitar" },
  { name: "guit_em9", category: "guitar" },
  // Misc
  { name: "misc_burp", category: "misc" },
  { name: "misc_cineboom", category: "misc" },
  { name: "misc_crow", category: "misc" },
  // Ride cymbals
  { name: "ride_tri", category: "ride" },
  { name: "ride_via", category: "ride" },
  // Hi-hats (missing)
  { name: "hat_gnu", category: "hi-hat" },
  { name: "hat_gump", category: "hi-hat" },
  { name: "hat_hier", category: "hi-hat" },
  { name: "hat_len", category: "hi-hat" },
  { name: "hat_mess", category: "hi-hat" },
  { name: "hat_psych", category: "hi-hat" },
  { name: "hat_sci", category: "hi-hat" },
  { name: "hat_yosh", category: "hi-hat" },
  { name: "hat_zan", category: "hi-hat" },
  { name: "hat_zap", category: "hi-hat" },
  // Electronic (missing)
  { name: "elec_hi_snare", category: "electronic" },
  // Percussion (missing)
  { name: "perc_bell2", category: "percussion" },
  { name: "perc_door", category: "percussion" },
  { name: "perc_impact1", category: "percussion" },
  { name: "perc_impact2", category: "percussion" },
  { name: "perc_swash", category: "percussion" },
  // Bass (missing)
  { name: "bass_trance_c", category: "bass" },
  // Loops (missing)
  { name: "loop_3d_printer", category: "loop" },
  { name: "loop_drone_g_97", category: "loop" },
  { name: "loop_electric", category: "loop" },
  { name: "loop_mehackit1", category: "loop" },
  { name: "loop_mehackit2", category: "loop" },
  { name: "loop_perc1", category: "loop" },
  { name: "loop_perc2", category: "loop" },
  { name: "loop_weirdo", category: "loop" },
  // Glitch
  { name: "glitch_bass_g", category: "glitch" },
  { name: "glitch_perc1", category: "glitch" },
  { name: "glitch_perc2", category: "glitch" },
  { name: "glitch_perc3", category: "glitch" },
  { name: "glitch_perc4", category: "glitch" },
  { name: "glitch_perc5", category: "glitch" },
  { name: "glitch_robot1", category: "glitch" },
  { name: "glitch_robot2", category: "glitch" },
  // Mehackit
  { name: "mehackit_phone1", category: "mehackit" },
  { name: "mehackit_phone2", category: "mehackit" },
  { name: "mehackit_phone3", category: "mehackit" },
  { name: "mehackit_phone4", category: "mehackit" },
  { name: "mehackit_robot1", category: "mehackit" },
  { name: "mehackit_robot2", category: "mehackit" },
  { name: "mehackit_robot3", category: "mehackit" },
  { name: "mehackit_robot4", category: "mehackit" },
  { name: "mehackit_robot5", category: "mehackit" },
  { name: "mehackit_robot6", category: "mehackit" },
  { name: "mehackit_robot7", category: "mehackit" },
  // Arovane
  { name: "arovane_beat_a", category: "arovane" },
  { name: "arovane_beat_b", category: "arovane" },
  { name: "arovane_beat_c", category: "arovane" },
  { name: "arovane_beat_d", category: "arovane" },
  { name: "arovane_beat_e", category: "arovane" },
  // TBD (Thorsten Sideboard)
  { name: "tbd_fxbed_loop", category: "tbd" },
  { name: "tbd_highkey_c4", category: "tbd" },
  { name: "tbd_pad_1", category: "tbd" },
  { name: "tbd_pad_2", category: "tbd" },
  { name: "tbd_pad_3", category: "tbd" },
  { name: "tbd_pad_4", category: "tbd" },
  { name: "tbd_perc_blip", category: "tbd" },
  { name: "tbd_perc_hat", category: "tbd" },
  { name: "tbd_perc_tap_1", category: "tbd" },
  { name: "tbd_perc_tap_2", category: "tbd" },
  { name: "tbd_voctone", category: "tbd" }
];
function getCategories() {
  return [...new Set(SAMPLES.map((s) => s.category))];
}
function getSampleNames() {
  return SAMPLES.map((s) => s.name);
}

// ../../../sonicPiWeb/src/engine/CustomSampleStore.ts
var DB_NAME2 = "spw-custom-samples";
var DB_VERSION2 = 1;
var STORE_NAME2 = "samples";
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME2, DB_VERSION2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME2)) {
        db.createObjectStore(STORE_NAME2, { keyPath: "name" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function loadAllCustomSamples() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx3 = db.transaction(STORE_NAME2, "readonly");
    const request = tx3.objectStore(STORE_NAME2).getAll();
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// ../../../sonicPiWeb/src/engine/SonicPiEngine.ts
var randomSuffix = () => Math.random().toString(36).slice(2, 6);
var SonicPiEngine = class {
  constructor(options) {
    this.scheduler = null;
    this.bridge = null;
    this.eventStream = new SoundEventStream();
    this.initialized = false;
    this.playing = false;
    this.runtimeErrorHandler = null;
    this.printHandler = null;
    this.cueHandler = null;
    this.currentCode = "";
    this.currentStratum = 1 /* S1 */;
    /** Maps DSL nodeRef → SuperSonic nodeId for control messages */
    this.nodeRefMap = /* @__PURE__ */ new Map();
    /** Reusable inner FX nodes — persists across loop iterations. See issue #70. */
    this.reusableFx = /* @__PURE__ */ new Map();
    /** Pending volume to apply when bridge initializes */
    this.pendingVolume = null;
    /** Stored builder functions for capture/query path */
    this.loopBuilders = /* @__PURE__ */ new Map();
    /** Per-loop seed counters for deterministic random */
    this.loopSeeds = /* @__PURE__ */ new Map();
    /** Per-loop tick counters — persisted across iterations so ring.tick() advances correctly */
    this.loopTicks = /* @__PURE__ */ new Map();
    /** Tracks which loops have completed their initial sync — persists across hot-swaps. */
    this.loopSynced = /* @__PURE__ */ new Set();
    /** Persistent top-level FX state — keyed by scope ID, shared across loops in same with_fx. */
    this.persistentFx = /* @__PURE__ */ new Map();
    /** Maps loop name → FX scope ID (loops under same with_fx share a scope). */
    this.loopFxScope = /* @__PURE__ */ new Map();
    /** Maps FX scope ID → FX chain definition. */
    this.fxScopeChains = /* @__PURE__ */ new Map();
    /** Compile-once cache: source code → transpiled JS. Reused on hot-swap with unchanged code (#8). */
    this.transpileCache = /* @__PURE__ */ new Map();
    /**
     * MIDI I/O bridge — exposed for shell-level device management (listing devices,
     * opening ports, registering event handlers). Not intended for direct note
     * triggering from application code; use the DSL functions (`midi_note_on`,
     * `midi_cc`, etc.) inside `live_loop` blocks instead, so events are
     * scheduler-aware and time-stamped correctly.
     */
    this.midiBridge = new MidiBridge();
    /** Global key-value store — shared across all loops via get/set */
    this.globalStore = /* @__PURE__ */ new Map();
    /** Host-provided OSC send handler. Engine fires this; host wires to actual transport. */
    this.oscHandler = null;
    this.bridgeOptions = options?.bridge ?? {};
    this.schedAheadTime = options?.schedAheadTime ?? DEFAULT_SCHED_AHEAD_TIME;
  }
  get schedAhead() {
    return this.schedAheadTime;
  }
  /**
   * Initialize the engine. Must be called once before `evaluate()`.
   * Safe to call multiple times — subsequent calls are no-ops.
   *
   * Audio initializes via SuperSonic (WebAssembly). If that fails (e.g. in
   * test environments or when WebAssembly is blocked), the engine continues
   * without audio — the scheduler still runs and `capture` queries still work.
   * Check `hasAudio` after `init()` to know whether audio is available.
   */
  async init() {
    if (this.initialized) return;
    this.bridge = new SuperSonicBridge(this.bridgeOptions);
    const bridgeInit = this.bridge.init().then(() => {
      if (this.pendingVolume !== null) {
        this.bridge.setMasterVolume(this.pendingVolume);
      }
      this.bridge.setOscTraceHandler((msg) => {
        if (this.printHandler) this.printHandler(msg);
      });
    }).catch((err2) => {
      console.warn("[SonicPi] SuperSonic init failed, running without audio:", err2);
      this.bridge = null;
    });
    const isBrowser = typeof window !== "undefined";
    const treeSitterInit = isBrowser ? initTreeSitter().catch(() => {
    }) : Promise.resolve();
    await Promise.all([bridgeInit, treeSitterInit]);
    this.midiBridge.onMidiEvent((event) => {
      const sched = this.scheduler;
      if (!sched) return;
      const ch = event.channel ?? 1;
      sched.fireCue(`/midi:*:${ch}/${event.type}`, "__midi__", [event]);
      sched.fireCue(`/midi/${event.type}`, "__midi__", [event]);
    });
    this.initialized = true;
  }
  /** Whether audio output is available. False when SuperSonic failed to initialize. */
  get hasAudio() {
    return this.bridge !== null;
  }
  /**
   * Evaluate and schedule a Sonic Pi program.
   *
   * Accepts Ruby DSL syntax (auto-transpiled) or raw JS builder code.
   * On the first call, `play()` must be called afterward to start the scheduler.
   * On subsequent calls while playing, loops are hot-swapped in place.
   *
   * Returns `{ error }` on syntax or runtime errors during evaluation.
   * Does NOT throw — check the return value. Runtime errors inside `live_loop`
   * bodies after the scheduler has started are delivered via `setRuntimeErrorHandler`.
   */
  async evaluate(code) {
    if (!this.initialized) {
      return { error: new Error("SonicPiEngine not initialized \u2014 call init() first") };
    }
    try {
      this.currentCode = code;
      this.currentStratum = detectStratum(code);
      const isReEvaluate = this.scheduler !== null && this.playing;
      if (!isReEvaluate) {
        if (this.scheduler) {
          this.scheduler.dispose();
        }
        const audioCtx = this.bridge?.audioContext;
        this.scheduler = new VirtualTimeScheduler({
          getAudioTime: () => audioCtx?.currentTime ?? 0,
          schedAheadTime: this.schedAheadTime
        });
        this.scheduler.onLoopError((loopName, err2) => {
          const msg = `Error in loop '${loopName}': ${err2.message}`;
          if (this.runtimeErrorHandler) this.runtimeErrorHandler(err2);
          if (this.printHandler) this.printHandler(msg);
          else console.error("[SonicPi]", msg);
        });
        this.scheduler.onEvent((event) => {
          if (event.type === "cue" && this.cueHandler) {
            const name2 = event.params.name;
            this.cueHandler(name2, event.audioTime);
          }
        });
        this.loopBuilders.clear();
        this.loopSeeds.clear();
      }
      let transpiledCode;
      const cached = this.transpileCache.get(code);
      if (cached) {
        transpiledCode = cached;
      } else {
        const result = autoTranspileDetailed(code);
        if (result.hasError) {
          const errorMsg = result.errorMessage || "Unknown syntax error";
          return { error: new SyntaxError(errorMsg) };
        }
        transpiledCode = result.code;
        this.transpileCache.set(code, transpiledCode);
      }
      if (this.bridge) {
        const stillUsed = {
          sound_in: /['"]sound_in['"]/.test(transpiledCode),
          sound_in_stereo: /['"]sound_in_stereo['"]/.test(transpiledCode)
        };
        if (!stillUsed.sound_in) this.bridge.stopLiveAudio("sound_in");
        if (!stillUsed.sound_in_stereo) this.bridge.stopLiveAudio("sound_in_stereo");
      }
      let defaultBpm = 60;
      let defaultSynth = "beep";
      const scheduler = this.scheduler;
      const topLevelUseBpm = (bpm) => {
        defaultBpm = bpm;
      };
      const topLevelUseSynth = (name2) => {
        defaultSynth = name2;
      };
      const topLevelUseArgBpmScaling = (_enabled) => {
      };
      const topLevelWithArgBpmScaling = (_enabled, fn) => {
        fn();
      };
      const pendingLoops = /* @__PURE__ */ new Map();
      const pendingDefaults = /* @__PURE__ */ new Map();
      let currentVolume = 1;
      const set_volume = (vol) => {
        currentVolume = Math.max(0, Math.min(5, vol));
        this.bridge?.setMasterVolume(currentVolume / 5);
      };
      const current_synth_fn = () => defaultSynth;
      const current_volume_fn = () => currentVolume;
      const synth_names_fn = () => [
        "beep",
        "saw",
        "prophet",
        "tb303",
        "supersaw",
        "pluck",
        "pretty_bell",
        "piano",
        "dsaw",
        "dpulse",
        "dtri",
        "fm",
        "mod_fm",
        "mod_saw",
        "mod_pulse",
        "mod_tri",
        "sine",
        "square",
        "tri",
        "pulse",
        "noise",
        "pnoise",
        "bnoise",
        "gnoise",
        "cnoise",
        "chipbass",
        "chiplead",
        "chipnoise",
        "dark_ambience",
        "hollow",
        "growl",
        "zawa",
        "blade",
        "tech_saws",
        "bass_foundation"
      ];
      const fx_names_fn = () => [
        "reverb",
        "echo",
        "delay",
        "distortion",
        "slicer",
        "wobble",
        "ixi_techno",
        "compressor",
        "rlpf",
        "rhpf",
        "hpf",
        "lpf",
        "normaliser",
        "pan",
        "band_eq",
        "flanger",
        "krush",
        "bitcrusher",
        "ring_mod",
        "chorus",
        "octaver",
        "vowel",
        "tanh",
        "gverb",
        "pitch_shift",
        "whammy",
        "tremolo",
        "level",
        "mono",
        "ping_pong",
        "panslicer",
        // Filter variants — from synthinfo.rb FX classes
        "bpf",
        "rbpf",
        "nbpf",
        "nrbpf",
        "nlpf",
        "nrlpf",
        "nhpf",
        "nrhpf",
        "eq"
      ];
      const load_sample_fn = (_name) => {
      };
      const sample_info_fn = (name2) => {
        const dur = this.bridge?.getSampleDuration(name2);
        return dur !== void 0 ? { duration: dur } : null;
      };
      const all_sample_names_fn = () => sample_names();
      const topLevelPuts = (...args2) => {
        const msg = args2.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
        if (this.printHandler) this.printHandler(msg);
        else console.log("[SonicPi]", msg);
      };
      const topLevelStop = () => {
      };
      const stop_loop = (name2) => {
        scheduler.stopLoop(name2);
      };
      let scopeHandle = null;
      const wrappedLiveLoop = (name2, builderFnOrOpts, maybeFn) => {
        let builderFn;
        let syncTarget = null;
        if (typeof builderFnOrOpts === "function") {
          builderFn = builderFnOrOpts;
        } else {
          syncTarget = builderFnOrOpts.sync ?? null;
          builderFn = maybeFn;
        }
        const loopBus = this.bridge?.createLoopMonitor(name2) ?? 0;
        this.loopBuilders.set(name2, builderFn);
        if (!this.loopSeeds.has(name2)) {
          let hash = 0;
          for (let i2 = 0; i2 < name2.length; i2++) {
            hash = (hash << 5) - hash + name2.charCodeAt(i2) | 0;
          }
          this.loopSeeds.set(name2, Math.abs(hash));
        }
        const asyncFn = async () => {
          if (syncTarget && !this.loopSynced.has(name2)) {
            this.loopSynced.add(name2);
            await scheduler.waitForSync(syncTarget, name2);
          }
          const task = scheduler.getTask(name2);
          if (!task) return;
          const scopeId = this.loopFxScope.get(name2);
          if (scopeId && !this.persistentFx.has(scopeId) && this.bridge) {
            const fxChain = this.fxScopeChains.get(scopeId);
            if (fxChain && fxChain.length > 0) {
              const audioTime = task.virtualTime + this.schedAheadTime;
              let currentOutBus = task.outBus;
              const buses = [];
              const groups = [];
              for (const fx of fxChain) {
                const bus = this.bridge.allocateBus();
                const groupId = this.bridge.createFxGroup();
                const fxOpts = normalizeFxParams(fx.name, fx.opts, task.bpm);
                await this.bridge.applyFx(fx.name, audioTime, fxOpts, bus, currentOutBus);
                this.bridge.flushMessages();
                buses.push(bus);
                groups.push(groupId);
                currentOutBus = bus;
              }
              this.persistentFx.set(scopeId, { buses, groups, outBus: currentOutBus });
            }
          }
          if (scopeId) {
            const fxState = this.persistentFx.get(scopeId);
            if (fxState) {
              task.outBus = fxState.outBus;
            }
          }
          const seed = this.loopSeeds.get(name2) ?? 0;
          this.loopSeeds.set(name2, seed + 1);
          const builder = new ProgramBuilder(seed, this.loopTicks.get(name2));
          if (task.currentSynth && task.currentSynth !== "beep") {
            builder.use_synth(task.currentSynth);
          }
          scopeHandle?.enterScope(name2);
          try {
            builderFn(builder);
          } finally {
            scopeHandle?.exitScope();
          }
          this.loopTicks.set(name2, builder.getTicks());
          const program = builder.build();
          await runProgram(program, {
            bridge: this.bridge,
            scheduler,
            taskId: name2,
            eventStream: this.eventStream,
            schedAheadTime: this.schedAheadTime,
            printHandler: this.printHandler ?? void 0,
            nodeRefMap: this.nodeRefMap,
            reusableFx: this.reusableFx,
            globalStore: this.globalStore,
            oscHandler: this.oscHandler ?? void 0
          });
          scheduler.fireCue(name2, name2);
        };
        if (isReEvaluate) {
          pendingLoops.set(name2, asyncFn);
          pendingDefaults.set(name2, { bpm: defaultBpm, synth: defaultSynth });
        } else {
          scheduler.registerLoop(name2, asyncFn);
          const task = scheduler.getTask(name2);
          if (task) {
            task.bpm = defaultBpm;
            task.currentSynth = defaultSynth;
            task.outBus = loopBus;
          }
        }
      };
      const topFxStack = [];
      let currentFxScopeId = null;
      let fxScopeCounter = 0;
      const topLevelWithFx = (fxName, optsOrFn, maybeFn) => {
        let opts;
        let fn;
        if (typeof optsOrFn === "function") {
          opts = {};
          fn = optsOrFn;
        } else {
          opts = optsOrFn;
          fn = maybeFn;
        }
        topFxStack.push({ name: fxName, opts });
        const isOutermost = currentFxScopeId === null;
        if (isOutermost) {
          currentFxScopeId = `__fxscope_${fxScopeCounter++}`;
        }
        try {
          fn(null);
        } finally {
          topFxStack.pop();
          if (isOutermost) {
            currentFxScopeId = null;
          }
        }
      };
      const originalWrappedLiveLoop = wrappedLiveLoop;
      const fxAwareWrappedLiveLoop = (name2, builderFnOrOpts, maybeFn) => {
        let builderFn;
        let opts = null;
        if (typeof builderFnOrOpts === "function") {
          builderFn = builderFnOrOpts;
        } else {
          opts = builderFnOrOpts;
          builderFn = maybeFn;
        }
        if (topFxStack.length > 0 && currentFxScopeId) {
          const stackFingerprint = topFxStack.map(
            (f) => `${f.name}:${JSON.stringify(f.opts)}`
          ).join("|");
          const scopeId = `${currentFxScopeId}:${stackFingerprint}`;
          this.loopFxScope.set(name2, scopeId);
          if (!this.fxScopeChains.has(scopeId)) {
            this.fxScopeChains.set(scopeId, [...topFxStack]);
          }
          if (opts) {
            originalWrappedLiveLoop(name2, opts, builderFn);
          } else {
            originalWrappedLiveLoop(name2, builderFn);
          }
        } else {
          if (opts) {
            originalWrappedLiveLoop(name2, opts, builderFn);
          } else {
            originalWrappedLiveLoop(name2, builderFn);
          }
        }
      };
      let storedRandomSeed = null;
      const topLevelUseRandomSeed = (seed) => {
        storedRandomSeed = seed;
      };
      const topLevelInThread = (fn) => {
        const name2 = `__thread_${Date.now()}_${randomSuffix()}`;
        fxAwareWrappedLiveLoop(name2, (b) => {
          fn(b);
          b.stop();
        });
      };
      const topLevelAt = (times, values, fn) => {
        for (let i2 = 0; i2 < times.length; i2++) {
          const t = times[i2];
          const v = values ? values[i2] : void 0;
          const name2 = `__at_${Date.now()}_${i2}_${randomSuffix()}`;
          fxAwareWrappedLiveLoop(name2, (b) => {
            if (t > 0) b.sleep(t);
            if (v !== void 0) {
              fn(b, v);
            } else {
              fn(b);
            }
            b.stop();
          });
        }
      };
      const topLevelDensity = (_factor, fn) => {
        if (typeof _factor === "function") {
          ;
          _factor(null);
        } else if (typeof fn === "function") {
          fn(null);
        }
      };
      const set = (key, value) => {
        this.globalStore.set(key, value);
      };
      const storeGet = (key) => this.globalStore.get(key) ?? null;
      const getFn = (key) => storeGet(key);
      const get = new Proxy(getFn, {
        get(target, property, receiver) {
          if (typeof property === "symbol" || property in target) {
            return Reflect.get(target, property, receiver);
          }
          return storeGet(property);
        }
      });
      const get_cc = (controller, channel = 1) => this.midiBridge.getCCValue(controller, channel);
      const get_pitch_bend = (channel = 1) => this.midiBridge.getPitchBend(channel);
      const sample_names = () => getSampleNames();
      const sample_groups = () => getCategories();
      const sample_loaded = (name2) => {
        if (!this.bridge) return false;
        return this.bridge.isSampleLoaded(name2);
      };
      const sample_duration = (name2) => {
        if (!this.bridge) return 0;
        return this.bridge.getSampleDuration(name2) ?? 0;
      };
      const midi = (note2, opts = {}) => {
        const n = typeof note2 === "string" ? noteToMidi2(note2) : note2;
        const vel = opts.velocity ?? opts.vel ?? 100;
        const sus = opts.sustain ?? 1;
        this.midiBridge.noteOn(n, vel, opts.channel ?? 1);
        setTimeout(() => this.midiBridge.noteOff(n, opts.channel ?? 1), sus * 1e3);
      };
      const midi_note_on = (note2, velocity = 100, opts = {}) => {
        const n = typeof note2 === "string" ? noteToMidi2(note2) : note2;
        this.midiBridge.noteOn(n, velocity, opts.channel ?? 1);
      };
      const midi_note_off = (note2, opts = {}) => {
        const n = typeof note2 === "string" ? noteToMidi2(note2) : note2;
        this.midiBridge.noteOff(n, opts.channel ?? 1);
      };
      const midi_cc = (controller, value, opts = {}) => this.midiBridge.cc(controller, value, opts.channel ?? 1);
      const midi_pitch_bend = (val, opts = {}) => this.midiBridge.pitchBend(val, opts.channel ?? 1);
      const midi_channel_pressure = (val, opts = {}) => this.midiBridge.channelPressure(val, opts.channel ?? 1);
      const midi_poly_pressure = (note2, val, opts = {}) => this.midiBridge.polyPressure(note2, val, opts.channel ?? 1);
      const midi_prog_change = (program, opts = {}) => this.midiBridge.programChange(program, opts.channel ?? 1);
      const midi_clock_tick = () => this.midiBridge.clockTick();
      const midi_start = () => this.midiBridge.midiStart();
      const midi_stop = () => this.midiBridge.midiStop();
      const midi_continue = () => this.midiBridge.midiContinue();
      const midi_all_notes_off = (opts = {}) => this.midiBridge.allNotesOff(opts.channel ?? 1);
      const midi_notes_off = (opts = {}) => this.midiBridge.allNotesOff(opts.channel ?? 1);
      const midi_devices = () => this.midiBridge.getDevices();
      const get_note_on = (channel = 1) => this.midiBridge.getLastNoteOn(channel);
      const get_note_off = (channel = 1) => this.midiBridge.getLastNoteOff(channel);
      let oscDefaultHost = "localhost";
      let oscDefaultPort = 4560;
      const topLevelOscSend = (host, port, path, ...args2) => {
        if (this.oscHandler) {
          this.oscHandler(host, port, path, ...args2);
        } else {
          topLevelPuts(`[Warning] osc_send: no handler set \u2014 message to ${host}:${port}${path} dropped`);
        }
      };
      const use_osc = (host, port) => {
        oscDefaultHost = host;
        oscDefaultPort = port;
      };
      const osc = (path, ...args2) => topLevelOscSend(oscDefaultHost, oscDefaultPort, path, ...args2);
      const topLevelPrint = topLevelPuts;
      const current_bpm = () => defaultBpm;
      const quantise = (val, step) => Math.round(val / step) * step;
      const quantize = quantise;
      const octs = (n, numOctaves = 1) => Array.from({ length: numOctaves }, (_, i2) => n + i2 * 12);
      const topLevelBuilder = new ProgramBuilder();
      const dslNames = [
        "__b",
        "live_loop",
        "with_fx",
        "use_bpm",
        "use_synth",
        "use_random_seed",
        "use_arg_bpm_scaling",
        "with_arg_bpm_scaling",
        "in_thread",
        "at",
        "density",
        "ring",
        "knit",
        "range",
        "line",
        "spread",
        "chord",
        "scale",
        "chord_invert",
        "note",
        "note_range",
        "chord_degree",
        "degree",
        "chord_names",
        "scale_names",
        "noteToMidi",
        "midiToFreq",
        "noteToFreq",
        "hz_to_midi",
        "midi_to_hz",
        "quantise",
        "quantize",
        "octs",
        "current_bpm",
        "puts",
        "print",
        "stop",
        "stop_loop",
        // Volume & introspection
        "set_volume",
        "current_synth",
        "current_volume",
        // Catalog queries
        "synth_names",
        "fx_names",
        "all_sample_names",
        // Sample management
        "load_sample",
        "sample_info",
        // Global store
        "get",
        "set",
        // Sample catalog
        "sample_names",
        "sample_groups",
        "sample_loaded",
        "sample_duration",
        // MIDI input
        "get_cc",
        "get_pitch_bend",
        "get_note_on",
        "get_note_off",
        // MIDI output
        "midi",
        "midi_note_on",
        "midi_note_off",
        "midi_cc",
        "midi_pitch_bend",
        "midi_channel_pressure",
        "midi_poly_pressure",
        "midi_prog_change",
        "midi_clock_tick",
        "midi_start",
        "midi_stop",
        "midi_continue",
        "midi_all_notes_off",
        "midi_notes_off",
        "midi_devices",
        // OSC
        "use_osc",
        "osc",
        "osc_send",
        // Sample BPM
        "use_sample_bpm",
        // Debug (no-op in browser — silences log output in Desktop SP)
        "use_debug",
        // Latency — set schedule-ahead to 0 for responsive MIDI input (#149)
        "use_real_time"
      ];
      const dslValues = [
        topLevelBuilder,
        fxAwareWrappedLiveLoop,
        topLevelWithFx,
        topLevelUseBpm,
        topLevelUseSynth,
        topLevelUseRandomSeed,
        topLevelUseArgBpmScaling,
        topLevelWithArgBpmScaling,
        topLevelInThread,
        topLevelAt,
        topLevelDensity,
        ring,
        knit,
        range,
        line,
        spread,
        chord,
        scale,
        chord_invert,
        note,
        note_range,
        chord_degree,
        degree,
        chord_names,
        scale_names,
        noteToMidi2,
        midiToFreq5,
        noteToFreq2,
        hzToMidi,
        midiToFreq5,
        quantise,
        quantize,
        octs,
        current_bpm,
        topLevelPuts,
        topLevelPrint,
        topLevelStop,
        stop_loop,
        // Volume & introspection
        set_volume,
        current_synth_fn,
        current_volume_fn,
        // Catalog queries
        synth_names_fn,
        fx_names_fn,
        all_sample_names_fn,
        // Sample management
        load_sample_fn,
        sample_info_fn,
        // Global store
        get,
        set,
        // Sample catalog
        sample_names,
        sample_groups,
        sample_loaded,
        sample_duration,
        // MIDI input
        get_cc,
        get_pitch_bend,
        get_note_on,
        get_note_off,
        // MIDI output
        midi,
        midi_note_on,
        midi_note_off,
        midi_cc,
        midi_pitch_bend,
        midi_channel_pressure,
        midi_poly_pressure,
        midi_prog_change,
        midi_clock_tick,
        midi_start,
        midi_stop,
        midi_continue,
        midi_all_notes_off,
        midi_notes_off,
        midi_devices,
        // OSC
        use_osc,
        osc,
        topLevelOscSend,
        // Sample BPM
        (name2) => topLevelBuilder.use_sample_bpm(name2),
        // Debug (no-op in browser)
        (_val) => {
        },
        // Latency — no-op at top level; inside loops it's handled by ProgramBuilder + AudioInterpreter
        () => {
        }
      ];
      const codeWarnings = validateCode(transpiledCode);
      for (const warning of codeWarnings) {
        if (this.printHandler) this.printHandler(`[Warning] ${warning}`);
        else console.warn("[SonicPi]", warning);
      }
      const sandbox = createIsolatedExecutor(transpiledCode, dslNames);
      scopeHandle = sandbox.scopeHandle;
      await sandbox.execute(...dslValues);
      if (isReEvaluate) {
        const oldLoops = scheduler.getRunningLoopNames();
        const removedLoops = oldLoops.filter((name2) => !pendingLoops.has(name2));
        const hasNewLoops = [...pendingLoops.keys()].some((name2) => !oldLoops.includes(name2));
        scheduler.pauseTick();
        if (this.bridge) {
          this.bridge.freeAllNodes();
          this.nodeRefMap.clear();
          this.persistentFx.clear();
          this.reusableFx.clear();
          this.loopFxScope.clear();
          this.fxScopeChains.clear();
        }
        scheduler.reEvaluate(pendingLoops, { bpm: defaultBpm, synth: defaultSynth });
        for (const [name2, defaults] of pendingDefaults) {
          const task = scheduler.getTask(name2);
          if (task) {
            task.bpm = defaults.bpm;
            task.currentSynth = defaults.synth;
            task.outBus = this.bridge?.getLoopBus(name2) ?? 0;
          }
        }
        scheduler.resumeTick();
      }
      return {};
    } catch (err2) {
      const error = err2 instanceof Error ? err2 : new Error(String(err2));
      return { error };
    }
  }
  /** Start the scheduler. Call after the first `evaluate()`. */
  play() {
    if (!this.scheduler) return;
    if (this.playing) return;
    this.playing = true;
    this.scheduler.start();
  }
  /** Stop all loops and free audio resources. The next `evaluate()` starts fresh. */
  stop() {
    if (!this.playing) return;
    this.playing = false;
    this.scheduler?.stop();
    if (this.bridge) {
      this.bridge.freeAllNodes();
      this.bridge.stopAllLiveAudio();
    }
    this.nodeRefMap.clear();
    this.scheduler?.dispose();
    this.scheduler = null;
    this.loopBuilders.clear();
    this.loopSeeds.clear();
    this.loopTicks.clear();
    this.loopSynced.clear();
    this.globalStore.clear();
    this.persistentFx.clear();
    this.reusableFx.clear();
    this.loopFxScope.clear();
    this.fxScopeChains.clear();
  }
  dispose() {
    if (this.playing) this.stop();
    this.scheduler?.dispose();
    this.scheduler = null;
    this.eventStream.dispose();
    this.bridge?.dispose();
    this.bridge = null;
    this.initialized = false;
    this.currentStratum = 3 /* S3 */;
    this.loopBuilders.clear();
    this.loopSeeds.clear();
    this.globalStore.clear();
  }
  /** Register a handler for runtime errors inside `live_loop` bodies. */
  setRuntimeErrorHandler(handler) {
    this.runtimeErrorHandler = handler;
  }
  /** Register a handler for `puts` / `print` output from user code. */
  setPrintHandler(handler) {
    this.printHandler = handler;
  }
  /** Register a handler for cue events (for the CueLog panel). */
  setCueHandler(handler) {
    this.cueHandler = handler;
  }
  /**
   * Register a handler for `osc_send` calls in user code.
   * The engine fires this handler; the host wires it to actual transport
   * (e.g. WebSocket → UDP bridge). If no handler is set, osc_send logs a warning.
   */
  setOscHandler(handler) {
    this.oscHandler = handler;
  }
  /**
   * Set master volume. Range: 0 (silent) to 1 (full).
   * Safe to call before `init()` — applied when the audio bridge is ready.
   */
  setVolume(volume) {
    this.pendingVolume = volume;
    this.bridge?.setMasterVolume(volume);
  }
  /** Get a friendly version of the last error (for display in a log pane). */
  static formatError(err2) {
    return friendlyError(err2);
  }
  /** Format a friendly error as a display string. */
  static formatErrorString(err2) {
    return formatFriendlyError(friendlyError(err2));
  }
  /** Get SuperSonic scsynth metrics for diagnostics. */
  getMetrics() {
    return this.bridge?.getMetrics() ?? null;
  }
  /**
   * Register a custom user-uploaded sample with the audio engine.
   * The sample becomes playable as `sample :user_<name>` in code.
   * Requires engine to be initialized with audio support.
   */
  async registerCustomSample(name2, audioData) {
    if (!this.bridge) throw new Error("Audio engine not available \u2014 cannot register custom sample");
    await this.bridge.registerCustomSample(name2, audioData);
  }
  /**
   * Load all custom samples from IndexedDB into the audio engine.
   * Called automatically during init when audio is available.
   * Safe to call again after uploading new samples.
   */
  async loadCustomSamplesFromDB() {
    if (!this.bridge) return 0;
    try {
      const records = await loadAllCustomSamples();
      for (const record of records) {
        if (!this.bridge.isSampleLoaded(record.name)) {
          await this.bridge.registerCustomSample(record.name, record.audioData);
        }
      }
      return records.length;
    } catch {
      return 0;
    }
  }
  get components() {
    const result = {
      streaming: { eventStream: this.eventStream }
    };
    const audioCtx = this.bridge?.audioContext;
    const analyser = this.bridge?.analyser;
    if (audioCtx && analyser) {
      const trackAnalysers = this.bridge?.getAllTrackAnalysers();
      const analyserL = this.bridge?.analyserLeft ?? void 0;
      const analyserR = this.bridge?.analyserRight ?? void 0;
      result.audio = { analyser, analyserL, analyserR, audioCtx, trackAnalysers };
    }
    if (this.currentStratum <= 2 /* S2 */) {
      const loopBuilders = this.loopBuilders;
      const scheduler = this.scheduler;
      result.capture = {
        async queryRange(begin, end) {
          const events = [];
          for (const [name2, builderFn] of loopBuilders) {
            const task = scheduler?.getTask(name2);
            const bpm = task?.bpm ?? 60;
            const factory = (ticks, iteration) => {
              const builder = new ProgramBuilder(iteration ?? 0, ticks);
              if (task?.currentSynth && task.currentSynth !== "beep") {
                builder.use_synth(task.currentSynth);
              }
              builderFn(builder);
              return { program: builder.build(), ticks: builder.getTicks() };
            };
            events.push(...queryLoopProgram(factory, begin, end, bpm));
          }
          return events.sort((a, b) => a.time - b.time);
        }
      };
    }
    return result;
  }
};

// src/engine/sonicpi/adapter.ts
var SUPERSONIC_CDN = "https://unpkg.com/supersonic-scsynth@latest";
async function importFromCDN(url) {
  const load = new Function("url", "return import(url)");
  return load(url);
}
function parseVizRequests(code) {
  const requests = /* @__PURE__ */ new Map();
  const lines = code.split("\n");
  const loopPattern = /live_loop\s*(?:\(\s*["'](\w+)["']|:(\w+)\s)/;
  const loopBlocks = /* @__PURE__ */ new Map();
  for (let i2 = 0; i2 < lines.length; i2++) {
    const trimmed = lines[i2].trim();
    if (trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
    const loopMatch = trimmed.match(loopPattern);
    if (loopMatch) {
      const name2 = loopMatch[1] ?? loopMatch[2];
      const start2 = i2;
      let depth = 0;
      let end = lines.length - 1;
      for (let j = i2; j < lines.length; j++) {
        if (/\bdo\b/.test(lines[j])) depth++;
        if (/\bend\b/.test(lines[j])) depth--;
        depth += (lines[j].match(/[{(]/g) ?? []).length;
        depth -= (lines[j].match(/[})]/g) ?? []).length;
        if (depth <= 0 && j > i2) {
          end = j;
          break;
        }
      }
      loopBlocks.set(name2, { start: start2, end });
    }
  }
  const vizCallPattern = /\bviz\s+:(\w+)|viz\s*\(\s*["':]+(\w+)["']?\s*\)/;
  for (const [name2, block] of loopBlocks) {
    for (let i2 = block.start; i2 <= block.end; i2++) {
      const vizMatch = lines[i2].match(vizCallPattern);
      if (vizMatch) {
        requests.set(name2, {
          vizId: vizMatch[1] ?? vizMatch[2],
          afterLine: block.end + 1
        });
        break;
      }
    }
  }
  const commentVizPattern = /(?:\/\/|#)\s*@viz\s+(\w+)/;
  for (let i2 = 0; i2 < lines.length; i2++) {
    const vizMatch = lines[i2].match(commentVizPattern);
    if (vizMatch) {
      let trackName = null;
      for (let j = i2 - 1; j >= 0; j--) {
        const trimmed = lines[j].trim();
        if (trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
        const loopMatch = trimmed.match(loopPattern);
        if (loopMatch) {
          const name2 = loopMatch[1] ?? loopMatch[2];
          if (loopBlocks.has(name2)) {
            trackName = name2;
          }
          break;
        }
      }
      if (trackName && !requests.has(trackName)) {
        requests.set(trackName, { vizId: vizMatch[1], afterLine: i2 + 1 });
      }
    }
  }
  return requests;
}
function stripVizCalls(code) {
  return code.replace(/^[ \t]*viz[ \t]+:\w+[ \t]*$/gm, "").replace(/^[ \t]*viz[ \t]*\([ \t]*["']\w+["'][ \t]*\)[ \t]*$/gm, "").replace(/^[ \t]*(?:\/\/|#)[ \t]*@viz[ \t]+\w+[ \t]*$/gm, "");
}
var SonicPiEngine2 = class {
  constructor(options) {
    this.raw = null;
    this.hapStream = new HapStream();
    this.runtimeErrorHandler = null;
    this.vizRequests = /* @__PURE__ */ new Map();
    /** Original code lines + char offsets — for computing loc from srcLine */
    this.originalLines = [];
    this.lineOffsets = [];
    /** Per-track HapStreams for scoped inline viz (keyed by live_loop name) */
    this.trackStreams = /* @__PURE__ */ new Map();
    this.options = options ?? {};
  }
  async init() {
    if (this.raw) return;
    let SuperSonicClass;
    try {
      const mod = await importFromCDN(SUPERSONIC_CDN);
      SuperSonicClass = mod.SuperSonic ?? mod.default;
    } catch {
    }
    this.raw = new SonicPiEngine({
      ...this.options,
      bridge: SuperSonicClass ? { SuperSonicClass } : {}
    });
    await this.raw.init();
    this.raw.components.streaming?.eventStream.on(
      (e) => {
        let loc = null;
        if (e.srcLine && e.srcLine > 0 && e.srcLine <= this.originalLines.length) {
          const idx = e.srcLine - 1;
          const start2 = this.lineOffsets[idx];
          const end = start2 + this.originalLines[idx].length;
          loc = [{ start: start2, end }];
        }
        const event = {
          audioTime: e.audioTime,
          audioDuration: e.audioDuration,
          scheduledAheadMs: e.scheduledAheadMs,
          midiNote: e.midiNote,
          s: e.s,
          color: null,
          loc
        };
        this.hapStream.emitEvent(event);
        if (e.trackId) {
          this.trackStreams.get(e.trackId)?.emitEvent(event);
        }
      }
    );
    if (this.runtimeErrorHandler) {
      this.raw.setRuntimeErrorHandler(this.runtimeErrorHandler);
    }
  }
  async evaluate(code) {
    if (!this.raw) return { error: new Error("Call init() before evaluate()") };
    this.originalLines = code.split("\n");
    this.lineOffsets = [];
    let offset = 0;
    for (const line2 of this.originalLines) {
      this.lineOffsets.push(offset);
      offset += line2.length + 1;
    }
    this.vizRequests = parseVizRequests(code);
    const activeTrackIds = new Set(this.vizRequests.keys());
    for (const id of activeTrackIds) {
      if (!this.trackStreams.has(id)) {
        this.trackStreams.set(id, new HapStream());
      }
    }
    for (const [id, stream] of this.trackStreams) {
      if (!activeTrackIds.has(id)) {
        stream.dispose();
        this.trackStreams.delete(id);
      }
    }
    const cleanCode = stripVizCalls(code);
    const audioCtx = this.raw.components.audio?.audioCtx;
    const wasRunning = audioCtx?.state === "running";
    if (wasRunning) {
      await audioCtx.suspend();
    }
    const result = await this.raw.evaluate(cleanCode);
    if (wasRunning && audioCtx) {
      audioCtx.resume();
    }
    return result;
  }
  play() {
    this.raw?.play();
  }
  stop() {
    this.raw?.stop();
  }
  dispose() {
    this.hapStream.dispose();
    for (const stream of this.trackStreams.values()) stream.dispose();
    this.trackStreams.clear();
    this.raw?.dispose();
    this.raw = null;
    this.vizRequests.clear();
    this.originalLines = [];
    this.lineOffsets = [];
  }
  setRuntimeErrorHandler(handler) {
    this.runtimeErrorHandler = handler;
    this.raw?.setRuntimeErrorHandler(handler);
  }
  get components() {
    const bag = {
      streaming: { hapStream: this.hapStream }
    };
    if (!this.raw) return bag;
    const rawComponents = this.raw.components;
    if (rawComponents.audio) bag.audio = rawComponents.audio;
    if (this.vizRequests.size > 0) {
      bag.inlineViz = {
        vizRequests: this.vizRequests,
        trackStreams: this.trackStreams.size > 0 ? this.trackStreams : void 0
      };
    }
    return bag;
  }
};

// src/visualizers/mountVizRenderer.ts
function mountVizRenderer(container, source, components, size, onError) {
  const renderer = typeof source === "function" ? source() : source;
  renderer.mount(container, components, size, onError);
  let lastW = size.w;
  let lastH = size.h;
  const ro = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    if (width > 0 && height > 0 && (Math.abs(width - lastW) > 1 || Math.abs(height - lastH) > 1)) {
      lastW = width;
      lastH = height;
      renderer.resize(width, height);
    }
  });
  ro.observe(container);
  return {
    renderer,
    disconnect: () => ro.disconnect()
  };
}

// src/visualizers/useVizRenderer.ts
function useVizRenderer(containerRef, source, hapStream, analyser, scheduler) {
  const rendererRef = React.useRef(null);
  const components = {};
  if (hapStream) {
    components.streaming = { hapStream };
  }
  if (analyser) {
    components.audio = { analyser, audioCtx: analyser.context };
  }
  if (scheduler) {
    components.queryable = { scheduler, trackSchedulers: /* @__PURE__ */ new Map() };
  }
  if (rendererRef.current) {
    rendererRef.current.update(components);
  }
  React.useEffect(() => {
    if (!containerRef.current) return;
    const size = {
      w: containerRef.current.clientWidth || 400,
      h: containerRef.current.clientHeight || 200
    };
    const { renderer, disconnect } = mountVizRenderer(
      containerRef.current,
      source,
      components,
      size,
      console.error
    );
    rendererRef.current = renderer;
    return () => {
      disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [source]);
}
function VizPanel({ vizHeight = 200, hapStream, analyser, scheduler, source }) {
  const containerRef = React.useRef(null);
  useVizRenderer(containerRef, source, hapStream, analyser, scheduler);
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      ref: containerRef,
      "data-testid": "viz-panel",
      style: {
        height: vizHeight,
        background: "var(--background)",
        borderTop: "1px solid var(--border)",
        overflow: "hidden",
        position: "relative",
        flexShrink: 0
      }
    }
  );
}
function PianorollIcon() {
  return /* @__PURE__ */ jsxRuntime.jsxs("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [
    /* @__PURE__ */ jsxRuntime.jsx("rect", { x: "1", y: "3", width: "5", height: "2", rx: "0.5" }),
    /* @__PURE__ */ jsxRuntime.jsx("rect", { x: "4", y: "7", width: "6", height: "2", rx: "0.5" }),
    /* @__PURE__ */ jsxRuntime.jsx("rect", { x: "2", y: "11", width: "4", height: "2", rx: "0.5" })
  ] });
}
function ScopeIcon() {
  return /* @__PURE__ */ jsxRuntime.jsx("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: /* @__PURE__ */ jsxRuntime.jsx("path", { d: "M1 7 Q3.5 2 7 7 Q10.5 12 13 7" }) });
}
function SpectrumIcon() {
  return /* @__PURE__ */ jsxRuntime.jsxs("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "2", y1: "12", x2: "2", y2: "6" }),
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "5", y1: "12", x2: "5", y2: "3" }),
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "8", y1: "12", x2: "8", y2: "5" }),
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "11", y1: "12", x2: "11", y2: "8" })
  ] });
}
function SpiralIcon() {
  return /* @__PURE__ */ jsxRuntime.jsx("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: /* @__PURE__ */ jsxRuntime.jsx("path", { d: "M7 7 Q7 4 9 4 Q12 4 12 7 Q12 11 7 11 Q2 11 2 7 Q2 2 7 2" }) });
}
function PitchwheelIcon() {
  return /* @__PURE__ */ jsxRuntime.jsxs("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [
    /* @__PURE__ */ jsxRuntime.jsx("circle", { cx: "7", cy: "7", r: "5" }),
    /* @__PURE__ */ jsxRuntime.jsx("circle", { cx: "7", cy: "3", r: "1", fill: "currentColor", stroke: "none" })
  ] });
}
function FscopeIcon() {
  return /* @__PURE__ */ jsxRuntime.jsxs("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "1", y1: "10", x2: "1", y2: "7" }),
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "3", y1: "10", x2: "3", y2: "5" }),
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "5", y1: "10", x2: "5", y2: "4" }),
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "7", y1: "10", x2: "7", y2: "3" }),
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "9", y1: "10", x2: "9", y2: "5" }),
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "11", y1: "10", x2: "11", y2: "7" }),
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "13", y1: "10", x2: "13", y2: "9" })
  ] });
}
function WordfallIcon() {
  return /* @__PURE__ */ jsxRuntime.jsxs("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [
    /* @__PURE__ */ jsxRuntime.jsx("rect", { x: "1", y: "2", width: "3", height: "4", rx: "0.5" }),
    /* @__PURE__ */ jsxRuntime.jsx("rect", { x: "6", y: "5", width: "3", height: "4", rx: "0.5" }),
    /* @__PURE__ */ jsxRuntime.jsx("rect", { x: "10", y: "1", width: "3", height: "3", rx: "0.5" })
  ] });
}
function HydraIcon() {
  return /* @__PURE__ */ jsxRuntime.jsxs("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [
    /* @__PURE__ */ jsxRuntime.jsx("circle", { cx: "7", cy: "7", r: "3" }),
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "7", y1: "1", x2: "7", y2: "4" }),
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "7", y1: "10", x2: "7", y2: "13" }),
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "1", y1: "7", x2: "4", y2: "7" }),
    /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "10", y1: "7", x2: "13", y2: "7" })
  ] });
}
var ICON_MAP = {
  pianoroll: /* @__PURE__ */ jsxRuntime.jsx(PianorollIcon, {}),
  wordfall: /* @__PURE__ */ jsxRuntime.jsx(WordfallIcon, {}),
  scope: /* @__PURE__ */ jsxRuntime.jsx(ScopeIcon, {}),
  fscope: /* @__PURE__ */ jsxRuntime.jsx(FscopeIcon, {}),
  spectrum: /* @__PURE__ */ jsxRuntime.jsx(SpectrumIcon, {}),
  spiral: /* @__PURE__ */ jsxRuntime.jsx(SpiralIcon, {}),
  pitchwheel: /* @__PURE__ */ jsxRuntime.jsx(PitchwheelIcon, {}),
  hydra: /* @__PURE__ */ jsxRuntime.jsx(HydraIcon, {}),
  "pianoroll:hydra": /* @__PURE__ */ jsxRuntime.jsx(HydraIcon, {}),
  "scope:hydra": /* @__PURE__ */ jsxRuntime.jsx(HydraIcon, {}),
  "kaleidoscope:hydra": /* @__PURE__ */ jsxRuntime.jsx(HydraIcon, {})
};
function VizPicker({ descriptors, activeId, onIdChange, showVizPicker = true, availableComponents }) {
  if (!showVizPicker) return null;
  const isEnabled = (d) => {
    if (!availableComponents || !d.requires?.length) return true;
    return d.requires.every((req) => availableComponents.includes(req));
  };
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      "data-testid": "viz-picker",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 4,
        height: 32,
        padding: "0 8px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        fontFamily: "var(--font-mono)"
      },
      children: descriptors.map((descriptor) => {
        const isActive = descriptor.id === activeId;
        const enabled = isEnabled(descriptor);
        return /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            "data-testid": `viz-btn-${descriptor.id}`,
            "data-active": isActive ? "true" : void 0,
            "data-disabled": !enabled ? "true" : void 0,
            title: descriptor.label,
            onClick: enabled ? () => onIdChange(descriptor.id) : void 0,
            disabled: !enabled,
            style: {
              width: 32,
              height: 24,
              borderRadius: 4,
              border: "none",
              cursor: enabled ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isActive ? "var(--accent-dim)" : "transparent",
              outline: isActive ? "1px solid var(--accent)" : "none",
              color: isActive ? "var(--foreground)" : "var(--foreground-muted)",
              opacity: enabled ? 1 : 0.3,
              padding: 0
            },
            children: ICON_MAP[descriptor.id] ?? descriptor.label.charAt(0)
          },
          descriptor.id
        );
      })
    }
  );
}
function VizDropdown({
  descriptors,
  activeId,
  onIdChange,
  onNewViz,
  availableComponents
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  const activeDescriptor = descriptors.find((d) => d.id === activeId);
  const activeLabel = activeDescriptor?.label ?? activeId;
  const groups = /* @__PURE__ */ new Map();
  for (const d of descriptors) {
    const key = d.renderer ?? "other";
    const arr = groups.get(key) ?? [];
    arr.push(d);
    groups.set(key, arr);
  }
  const isEnabled = (d) => {
    if (!availableComponents || !d.requires?.length) return true;
    return d.requires.every((req) => availableComponents.includes(req));
  };
  const builtinIds = /* @__PURE__ */ new Set([
    "pianoroll",
    "wordfall",
    "scope",
    "fscope",
    "spectrum",
    "spiral",
    "pitchwheel",
    "hydra",
    "pianoroll:hydra",
    "scope:hydra",
    "kaleidoscope:hydra"
  ]);
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      ref,
      "data-testid": "viz-dropdown",
      style: {
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 4,
        height: 32,
        padding: "0 8px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        fontFamily: "var(--font-mono)",
        fontSize: 12
      },
      children: [
        /* @__PURE__ */ jsxRuntime.jsx("span", { style: { color: "var(--foreground-muted)", fontSize: 11, marginRight: 2 }, children: "Viz:" }),
        /* @__PURE__ */ jsxRuntime.jsxs(
          "button",
          {
            onClick: () => setOpen((prev) => !prev),
            style: {
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--foreground)",
              cursor: "pointer",
              padding: "2px 8px",
              fontSize: 12,
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 4,
              minWidth: 120,
              justifyContent: "space-between"
            },
            children: [
              /* @__PURE__ */ jsxRuntime.jsx("span", { children: activeLabel }),
              /* @__PURE__ */ jsxRuntime.jsx("span", { style: { fontSize: 8, opacity: 0.6 }, children: "\u25BC" })
            ]
          }
        ),
        open && /* @__PURE__ */ jsxRuntime.jsxs(
          "div",
          {
            style: {
              position: "absolute",
              top: "100%",
              left: 8,
              zIndex: 100,
              background: "var(--surface, #1a1a2e)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              minWidth: 200,
              maxHeight: 320,
              overflow: "auto",
              padding: "4px 0"
            },
            children: [
              [...groups.entries()].map(([renderer, items]) => /* @__PURE__ */ jsxRuntime.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntime.jsx(
                  "div",
                  {
                    style: {
                      padding: "4px 12px 2px",
                      fontSize: 10,
                      color: "var(--foreground-muted)",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      borderTop: "1px solid var(--border)",
                      marginTop: 2
                    },
                    children: renderer
                  }
                ),
                items.map((d) => {
                  const enabled = isEnabled(d);
                  const isCustom = !builtinIds.has(d.id);
                  return /* @__PURE__ */ jsxRuntime.jsxs(
                    "button",
                    {
                      onClick: () => {
                        if (enabled) {
                          onIdChange(d.id);
                          setOpen(false);
                        }
                      },
                      disabled: !enabled,
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "5px 12px",
                        border: "none",
                        background: d.id === activeId ? "rgba(117,186,255,0.12)" : "transparent",
                        color: enabled ? "var(--foreground)" : "var(--foreground-muted)",
                        opacity: enabled ? 1 : 0.4,
                        cursor: enabled ? "pointer" : "not-allowed",
                        fontSize: 12,
                        fontFamily: "inherit",
                        textAlign: "left"
                      },
                      children: [
                        /* @__PURE__ */ jsxRuntime.jsx("span", { children: d.label }),
                        isCustom && /* @__PURE__ */ jsxRuntime.jsx("span", { style: { color: "#FFCA28", fontSize: 10 }, children: "\u2605" })
                      ]
                    },
                    d.id
                  );
                })
              ] }, renderer)),
              onNewViz && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
                /* @__PURE__ */ jsxRuntime.jsx("div", { style: { borderTop: "1px solid var(--border)", margin: "2px 0" } }),
                /* @__PURE__ */ jsxRuntime.jsx(
                  "button",
                  {
                    onClick: () => {
                      onNewViz();
                      setOpen(false);
                    },
                    style: {
                      display: "block",
                      width: "100%",
                      padding: "5px 12px",
                      border: "none",
                      background: "transparent",
                      color: "var(--accent, #75baff)",
                      cursor: "pointer",
                      fontSize: 12,
                      fontFamily: "inherit",
                      textAlign: "left"
                    },
                    children: "+ New Viz..."
                  }
                )
              ] })
            ]
          }
        )
      ]
    }
  );
}

// src/workspace/preview/vizPresetBridge.ts
function workspaceFileIdForPreset(presetId) {
  return `viz:${presetId}`;
}
function languageForPresetRenderer(renderer) {
  return renderer === "hydra" ? "hydra" : "p5js";
}
function seedFromPreset(preset) {
  const id = workspaceFileIdForPreset(preset.id);
  const path = `${preset.name}.${preset.renderer}`;
  const language = languageForPresetRenderer(preset.renderer);
  createWorkspaceFile(id, path, preset.code, language, {
    presetId: preset.id
  });
  return id;
}
async function seedFromPresetId(presetId) {
  const preset = await VizPresetStore.get(presetId);
  if (!preset) return void 0;
  return seedFromPreset(preset);
}
async function flushToPreset(fileId, presetId) {
  const file = getFile(fileId);
  if (!file) return;
  const existing = await VizPresetStore.get(presetId);
  const now = Date.now();
  const renderer = file.language === "hydra" ? "hydra" : "p5";
  const preset = {
    ...existing,
    // preserve cropRegion + any future fields
    id: presetId,
    name: existing?.name ?? file.path.replace(/\.[^.]+$/, ""),
    renderer: existing?.renderer ?? renderer,
    code: file.content,
    requires: existing?.requires ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  await VizPresetStore.put(preset);
}
function getPresetIdForFile(file) {
  const metaId = file.meta?.presetId;
  return typeof metaId === "string" ? metaId : void 0;
}
function VizEditor({
  components: _components,
  hapStream: _hapStream,
  analyser: _analyser,
  scheduler: _scheduler,
  onPresetSaved,
  height = 400,
  previewHeight: _previewHeight = 200,
  theme = "dark"
}) {
  const containerRef = React.useRef(null);
  const [initialTabs, setInitialTabs] = React.useState(null);
  React.useEffect(() => {
    if (containerRef.current) applyTheme(containerRef.current, theme);
  }, [theme]);
  React.useEffect(() => {
    VizPresetStore.getAll().then((presets) => {
      const tabs = [];
      for (const preset of presets) {
        const fileId = seedFromPreset(preset);
        tabs.push({
          kind: "editor",
          id: `editor-${fileId}`,
          fileId
        });
        tabs.push({
          kind: "preview",
          id: `preview-${fileId}`,
          fileId,
          sourceRef: { kind: "none" }
        });
      }
      setInitialTabs(tabs.length > 0 ? tabs : []);
    });
  }, []);
  const handleSaveFile = React.useCallback(
    (tab) => {
      const file = getFile(tab.fileId);
      if (!file) return;
      const presetId = getPresetIdForFile(file);
      if (!presetId) return;
      flushToPreset(file.id, presetId).then(() => {
        VizPresetStore.get(presetId).then((preset) => {
          if (preset) onPresetSaved?.(preset);
        });
      });
    },
    [onPresetSaved]
  );
  const previewProviderFor = React.useCallback(
    (tab) => {
      const file = getFile(tab.fileId);
      if (!file) return void 0;
      return getPreviewProviderForLanguage(file.language) ?? void 0;
    },
    []
  );
  if (initialTabs === null) return null;
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      ref: containerRef,
      "data-testid": "viz-editor",
      "data-stave-theme": typeof theme === "string" ? theme : "custom",
      style: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: typeof height === "number" ? height + 40 : height
      },
      children: /* @__PURE__ */ jsxRuntime.jsx(
        WorkspaceShell,
        {
          initialTabs,
          theme,
          height: "100%",
          previewProviderFor,
          onSaveFile: handleSaveFile
        }
      )
    }
  );
}

// src/visualizers/p5Compiler.ts
function isFullLifecycleSketch(code) {
  return /\bfunction\s+draw\s*\(/.test(code);
}
function compileP5Code(code) {
  return (hapStreamRef, analyserRef, schedulerRef, containerSizeRef = {
    current: { w: 400, h: 300 }
  }) => {
    const body2 = isFullLifecycleSketch(code) ? buildFullLifecycleBody(code) : buildLegacyBody(code);
    return (p) => {
      const stave = {
        get scheduler() {
          return schedulerRef.current;
        },
        get analyser() {
          return analyserRef.current;
        },
        get hapStream() {
          return hapStreamRef.current;
        },
        get width() {
          return containerSizeRef.current?.w ?? 400;
        },
        get height() {
          return containerSizeRef.current?.h ?? 300;
        }
      };
      let lifecycle;
      try {
        const compile = new Function("p", "stave", body2);
        lifecycle = compile(p, stave);
      } catch (err2) {
        installErrorSketch(p, err2.message ?? String(err2));
        return;
      }
      installLifecycle(p, lifecycle);
    };
  };
}
function buildFullLifecycleBody(userCode) {
  return `
with (p) {
  ${userCode}
  return {
    setup: typeof setup === 'function' ? setup : undefined,
    draw: typeof draw === 'function' ? draw : undefined,
    preload: typeof preload === 'function' ? preload : undefined,
  }
}
  `;
}
function buildLegacyBody(userCode) {
  return `
with (p) {
  return {
    setup: function () {
      createCanvas(p.windowWidth, p.windowHeight)
      colorMode(RGB)
    },
    draw: function () {
      const scheduler = stave.scheduler
      const analyser = stave.analyser
      const hapStream = stave.hapStream
      ${userCode}
    },
    preload: undefined,
  }
}
  `;
}
function installLifecycle(p, lifecycle) {
  const pi = p;
  if (lifecycle.preload) pi.preload = lifecycle.preload;
  pi.setup = lifecycle.setup ?? function() {
    pi.createCanvas(pi.windowWidth, pi.windowHeight);
  };
  if (lifecycle.draw) pi.draw = lifecycle.draw;
}
function installErrorSketch(p, message) {
  const pi = p;
  pi.setup = function() {
    pi.createCanvas(pi.windowWidth || 400, 160);
  };
  pi.draw = function() {
    pi.background(20, 20, 24);
    pi.noStroke();
    pi.fill(255, 120, 120);
    pi.textFont("monospace");
    pi.textSize(12);
    pi.text("p5 viz compile error:", 12, 24);
    pi.fill(230);
    pi.textSize(11);
    pi.text(message, 12, 48, pi.width - 24, pi.height - 60);
  };
}

// src/visualizers/vizCompiler.ts
function compilePreset(preset) {
  const { id, name: name2, renderer, code, requires } = preset;
  if (renderer === "hydra") {
    return {
      id,
      label: name2,
      renderer: "hydra",
      requires,
      factory: () => new HydraVizRenderer(compileHydraCode(code))
    };
  }
  if (renderer === "p5") {
    return {
      id,
      label: name2,
      renderer: "p5",
      requires,
      factory: () => new P5VizRenderer(compileP5Code(code))
    };
  }
  throw new Error(`Unknown renderer: ${renderer}`);
}
function compileHydraCode(code) {
  return (s) => {
    const fn = new Function("s", code);
    fn(s);
  };
}
var DB_NAME3 = "stave-snapshots";
var DB_VERSION3 = 1;
var STORE_NAME3 = "snapshots";
var AUTO_SNAPSHOT_PREFIX = "Auto \u2014 ";
function openDb2() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME3, DB_VERSION3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME3)) {
        const store = db.createObjectStore(STORE_NAME3, { keyPath: "id" });
        store.createIndex("byProject", "projectId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function wrap2(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
var MAX_AUTO_SNAPSHOTS = 10;
async function saveSnapshot(projectId, label, kind = "manual") {
  const doc = getActiveDoc();
  const bytes = Y4__namespace.encodeStateAsUpdate(doc);
  const meta = {
    id: crypto.randomUUID(),
    projectId,
    label: label.trim() || "Untitled snapshot",
    createdAt: Date.now(),
    kind
  };
  const record = { ...meta, bytes };
  const db = await openDb2();
  await wrap2(
    db.transaction(STORE_NAME3, "readwrite").objectStore(STORE_NAME3).put(record)
  );
  if (kind === "auto") {
    const index = db.transaction(STORE_NAME3, "readonly").objectStore(STORE_NAME3).index("byProject");
    const all = await wrap2(index.getAll(projectId));
    const autos = all.filter(
      (r) => r.kind === "auto" || r.label.startsWith(AUTO_SNAPSHOT_PREFIX)
    ).sort((a, b) => b.createdAt - a.createdAt);
    const toDelete = autos.slice(MAX_AUTO_SNAPSHOTS);
    if (toDelete.length > 0) {
      const wstore = db.transaction(STORE_NAME3, "readwrite").objectStore(STORE_NAME3);
      for (const r of toDelete) await wrap2(wstore.delete(r.id));
    }
  }
  db.close();
  return meta;
}
async function listSnapshots(projectId) {
  const db = await openDb2();
  const index = db.transaction(STORE_NAME3, "readonly").objectStore(STORE_NAME3).index("byProject");
  const all = await wrap2(index.getAll(projectId));
  db.close();
  return all.map(({ bytes: _bytes, ...meta }) => meta).sort((a, b) => b.createdAt - a.createdAt);
}
async function deleteSnapshot(id) {
  const db = await openDb2();
  await wrap2(
    db.transaction(STORE_NAME3, "readwrite").objectStore(STORE_NAME3).delete(id)
  );
  db.close();
}
async function restoreSnapshot(id) {
  const db = await openDb2();
  const stored = await wrap2(
    db.transaction(STORE_NAME3, "readonly").objectStore(STORE_NAME3).get(id)
  );
  db.close();
  if (!stored) throw new Error(`snapshot ${id} not found`);
  const snapDoc = new Y4__namespace.Doc();
  Y4__namespace.applyUpdate(snapDoc, stored.bytes);
  const snapFiles = snapDoc.getMap("files");
  const snapOrder = snapDoc.getMap("fileOrder");
  const snapSubOrder = snapDoc.getMap("subfolderOrder");
  const activeDoc2 = getActiveDoc();
  const activeFiles = activeDoc2.getMap("files");
  const activeOrder = activeDoc2.getMap("fileOrder");
  const activeSubOrder = activeDoc2.getMap("subfolderOrder");
  activeDoc2.transact(() => {
    for (const key of Array.from(activeFiles.keys())) activeFiles.delete(key);
    for (const key of Array.from(activeOrder.keys())) activeOrder.delete(key);
    for (const key of Array.from(activeSubOrder.keys())) activeSubOrder.delete(key);
    for (const [fid, snapFile] of snapFiles.entries()) {
      const clone = new Y4__namespace.Map();
      clone.set("id", snapFile.get("id"));
      clone.set("path", snapFile.get("path"));
      clone.set("language", snapFile.get("language"));
      const meta = snapFile.get("meta");
      if (meta !== void 0) clone.set("meta", meta);
      const content = new Y4__namespace.Text();
      const srcText = snapFile.get("content");
      content.insert(0, srcText.toString());
      clone.set("content", content);
      activeFiles.set(fid, clone);
    }
    for (const [folder, arr] of snapOrder.entries()) {
      const next = new Y4__namespace.Array();
      next.push(arr.toArray());
      activeOrder.set(folder, next);
    }
    for (const [folder, arr] of snapSubOrder.entries()) {
      const next = new Y4__namespace.Array();
      next.push(arr.toArray());
      activeSubOrder.set(folder, next);
    }
  });
  snapDoc.destroy();
}

// src/workspace/projectRegistry.ts
var DB_NAME4 = "stave-projects";
var DB_VERSION4 = 1;
var STORE_NAME4 = "projects";
function openDb3() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME4, DB_VERSION4);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME4)) {
        db.createObjectStore(STORE_NAME4, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx2(db, mode) {
  return db.transaction(STORE_NAME4, mode).objectStore(STORE_NAME4);
}
function wrap3(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function listProjects() {
  const db = await openDb3();
  const all = await wrap3(tx2(db, "readonly").getAll());
  db.close();
  return all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}
async function getProject(id) {
  const db = await openDb3();
  const result = await wrap3(tx2(db, "readonly").get(id));
  db.close();
  return result;
}
async function getLastOpenedProject() {
  const list = await listProjects();
  return list[0];
}
async function createProject(name2) {
  const meta = {
    id: crypto.randomUUID(),
    name: name2,
    createdAt: Date.now(),
    lastOpenedAt: Date.now()
  };
  const db = await openDb3();
  await wrap3(tx2(db, "readwrite").put(meta));
  db.close();
  return meta;
}
async function touchProject(id) {
  const db = await openDb3();
  const store = tx2(db, "readwrite");
  const existing = await wrap3(store.get(id));
  if (existing) {
    await wrap3(store.put({ ...existing, lastOpenedAt: Date.now() }));
  }
  db.close();
}
async function renameProject(id, name2) {
  const db = await openDb3();
  const store = tx2(db, "readwrite");
  const existing = await wrap3(store.get(id));
  if (existing) {
    await wrap3(store.put({ ...existing, name: name2 }));
  }
  db.close();
}
async function deleteProject(id) {
  const db = await openDb3();
  await wrap3(tx2(db, "readwrite").delete(id));
  db.close();
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(`stave-${id}`);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
async function duplicateProject(id) {
  const source = await getProject(id);
  if (!source) return void 0;
  return createProject(`${source.name} (copy)`);
}
function LiveModeToggle({
  autoRefresh,
  onToggle
}) {
  const baseStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 8px",
    borderRadius: 3,
    fontSize: 10,
    fontFamily: "inherit",
    cursor: "pointer",
    userSelect: "none"
  };
  const activeStyle = {
    ...baseStyle,
    background: "var(--accent-dim)",
    color: "var(--accent-strong, var(--accent))",
    border: "1px solid var(--accent-dim)"
  };
  const inactiveStyle = {
    ...baseStyle,
    background: "none",
    color: "var(--foreground-muted)",
    border: "1px solid var(--border)"
  };
  return /* @__PURE__ */ jsxRuntime.jsx(
    "button",
    {
      "data-testid": "strudel-chrome-live-toggle",
      "data-live-mode": autoRefresh ? "on" : "off",
      onClick: onToggle,
      title: autoRefresh ? "Live mode ON \u2014 auto re-evaluate on code change while playing" : "Live mode OFF \u2014 click to auto re-evaluate on change",
      style: autoRefresh ? activeStyle : inactiveStyle,
      children: autoRefresh ? "\u27F3 live" : "\u27F3"
    }
  );
}
function StrudelChrome(ctx) {
  const {
    isPlaying,
    error,
    bpm,
    onPlay,
    onStop,
    chromeExtras,
    autoRefresh,
    onToggleAutoRefresh
  } = ctx;
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      "data-strudel-runtime-chrome": "root",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 40,
        padding: "0 12px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        fontFamily: "var(--font-mono)",
        fontSize: 12
      },
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            "data-testid": "strudel-chrome-transport",
            onClick: isPlaying ? onStop : onPlay,
            title: isPlaying ? "Stop (Ctrl+.)" : "Play (Ctrl+Enter)",
            style: {
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              background: isPlaying ? "rgba(139,92,246,0.15)" : "var(--accent)",
              color: isPlaying ? "var(--accent)" : "#fff",
              outline: isPlaying ? "1px solid var(--accent)" : "none"
            },
            children: isPlaying ? "\u25A0 Stop" : "\u25B6 Play"
          }
        ),
        bpm != null && /* @__PURE__ */ jsxRuntime.jsxs(
          "span",
          {
            "data-testid": "strudel-chrome-bpm",
            style: { color: "var(--foreground-muted)", fontSize: 11 },
            children: [
              bpm,
              " BPM"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx("div", { style: { flex: 1 } }),
        error && /* @__PURE__ */ jsxRuntime.jsx(
          "span",
          {
            "data-testid": "strudel-chrome-error",
            title: error.message,
            style: {
              maxWidth: 240,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "#f87171",
              fontSize: 11,
              padding: "2px 8px",
              background: "rgba(248,113,113,0.1)",
              borderRadius: 4,
              border: "1px solid rgba(248,113,113,0.3)"
            },
            children: error.message
          }
        ),
        onToggleAutoRefresh && /* @__PURE__ */ jsxRuntime.jsx(
          LiveModeToggle,
          {
            autoRefresh: autoRefresh ?? false,
            onToggle: onToggleAutoRefresh
          }
        ),
        chromeExtras && /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            "data-testid": "strudel-chrome-extras",
            style: { display: "flex", alignItems: "center", gap: 4 },
            children: chromeExtras
          }
        )
      ]
    }
  );
}
var STRUDEL_RUNTIME = {
  extensions: [".strudel"],
  language: "strudel",
  createEngine: () => new StrudelEngine(),
  renderChrome: (ctx) => /* @__PURE__ */ jsxRuntime.jsx(StrudelChrome, { ...ctx })
};
function SonicPiChrome(ctx) {
  const { isPlaying, error, bpm, onPlay, onStop, chromeExtras } = ctx;
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      "data-sonicpi-runtime-chrome": "root",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 40,
        padding: "0 12px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        fontFamily: "var(--font-mono)",
        fontSize: 12
      },
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            "data-testid": "sonicpi-chrome-transport",
            onClick: isPlaying ? onStop : onPlay,
            title: isPlaying ? "Stop (Ctrl+.)" : "Play (Ctrl+Enter)",
            style: {
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              background: isPlaying ? "rgba(139,92,246,0.15)" : "var(--accent)",
              color: isPlaying ? "var(--accent)" : "#fff",
              outline: isPlaying ? "1px solid var(--accent)" : "none"
            },
            children: isPlaying ? "\u25A0 Stop" : "\u25B6 Play"
          }
        ),
        bpm != null && /* @__PURE__ */ jsxRuntime.jsxs(
          "span",
          {
            "data-testid": "sonicpi-chrome-bpm",
            style: { color: "var(--foreground-muted)", fontSize: 11 },
            children: [
              bpm,
              " BPM"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx("div", { style: { flex: 1 } }),
        error && /* @__PURE__ */ jsxRuntime.jsx(
          "span",
          {
            "data-testid": "sonicpi-chrome-error",
            title: error.message,
            style: {
              maxWidth: 240,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "#f87171",
              fontSize: 11,
              padding: "2px 8px",
              background: "rgba(248,113,113,0.1)",
              borderRadius: 4,
              border: "1px solid rgba(248,113,113,0.3)"
            },
            children: error.message
          }
        ),
        chromeExtras && /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            "data-testid": "sonicpi-chrome-extras",
            style: { display: "flex", alignItems: "center", gap: 4 },
            children: chromeExtras
          }
        )
      ]
    }
  );
}
var SONICPI_RUNTIME = {
  extensions: [".sonicpi"],
  language: "sonicpi",
  createEngine: () => new SonicPiEngine2(),
  renderChrome: (ctx) => /* @__PURE__ */ jsxRuntime.jsx(SonicPiChrome, { ...ctx })
};
var btnStyle = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 3,
  color: "var(--foreground-muted)",
  cursor: "pointer",
  padding: "2px 8px",
  fontSize: 10,
  fontFamily: "inherit"
};
var primaryBtnStyle = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 10px",
  borderRadius: 4,
  border: "none",
  cursor: "pointer",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  background: "var(--accent)",
  color: "#fff"
};
function refToString(ref) {
  if (ref.kind === "default") return "default";
  if (ref.kind === "none") return "none";
  return `file:${ref.fileId}`;
}
function stringToRef(value) {
  if (value === "default") return { kind: "default" };
  if (value === "none") return { kind: "none" };
  if (value.startsWith("file:")) {
    return { kind: "file", fileId: value.slice("file:".length) };
  }
  return { kind: "default" };
}
function VizEditorChrome({
  file,
  onOpenPreview,
  onToggleBackground,
  onSave,
  previewOpen,
  previewPaused,
  onTogglePausePreview,
  onChangePreviewSource
}) {
  const ext = file.language === "p5js" ? "p5" : file.language;
  const [selectedSource, setSelectedSource] = React.useState({
    kind: "default"
  });
  const [, forceSourcesRerender] = React.useState(0);
  React.useEffect(() => {
    const unsub = workspaceAudioBus.onSourcesChanged(() => {
      forceSourcesRerender((n) => n + 1);
    });
    return unsub;
  }, []);
  const handlePrimaryButtonClick = React.useCallback(() => {
    if (previewOpen && onTogglePausePreview) {
      onTogglePausePreview();
      return;
    }
    if (selectedSource.kind === "file") {
      const builtin = findBuiltinExampleSource(selectedSource.fileId);
      if (builtin) builtin.startIfIdle();
    }
    onOpenPreview(selectedSource);
  }, [onOpenPreview, onTogglePausePreview, previewOpen, selectedSource]);
  const buttonState = !previewOpen ? "closed" : previewPaused ? "paused" : "running";
  const buttonLabel = buttonState === "closed" ? "\u25B6 Preview" : buttonState === "paused" ? "\u25B6 Play" : "\u25A0 Stop";
  const buttonTitle = buttonState === "closed" ? "Open preview to side (Cmd+K V)" : buttonState === "paused" ? "Resume preview rendering" : "Pause preview rendering (tab stays open)";
  const busSources = workspaceAudioBus.listSources();
  const patternSources = busSources.filter(
    (s) => !BUILTIN_SOURCE_IDS.has(s.sourceId)
  );
  const handleSourceChange = React.useCallback(
    (e) => {
      const ref = stringToRef(e.target.value);
      const prevBuiltin = selectedSource.kind === "file" ? findBuiltinExampleSource(selectedSource.fileId) : void 0;
      const nextBuiltin = ref.kind === "file" ? findBuiltinExampleSource(ref.fileId) : void 0;
      setSelectedSource(ref);
      if (previewOpen && onChangePreviewSource) {
        if (nextBuiltin && !previewPaused) {
          nextBuiltin.startIfIdle();
        }
        if (prevBuiltin && prevBuiltin !== nextBuiltin) {
          prevBuiltin.stopIfRunning();
        }
        onChangePreviewSource(ref);
      }
    },
    [previewOpen, previewPaused, onChangePreviewSource, selectedSource]
  );
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      "data-workspace-chrome": "viz",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 40,
        padding: "0 12px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        fontSize: 11,
        flexShrink: 0
      },
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            "data-testid": "viz-chrome-open-preview",
            "data-button-state": buttonState,
            onClick: handlePrimaryButtonClick,
            title: buttonTitle,
            style: primaryBtnStyle,
            children: buttonLabel
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          "span",
          {
            style: {
              background: "rgba(117,186,255,0.1)",
              color: "#75baff",
              padding: "1px 6px",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5
            },
            children: ext
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx("div", { style: { width: 1, height: 14, background: "var(--border)" } }),
        /* @__PURE__ */ jsxRuntime.jsx(
          "label",
          {
            htmlFor: `viz-chrome-source-${file.id}`,
            style: { color: "var(--foreground-muted)", fontSize: 10 },
            children: "source:"
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsxs(
          "select",
          {
            id: `viz-chrome-source-${file.id}`,
            "data-testid": "viz-chrome-source",
            value: refToString(selectedSource),
            onChange: handleSourceChange,
            style: {
              background: "var(--surface-elevated)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "2px 6px",
              fontSize: 10,
              fontFamily: "inherit",
              cursor: "pointer"
            },
            children: [
              /* @__PURE__ */ jsxRuntime.jsx("option", { value: "default", children: "default (follow most recent)" }),
              /* @__PURE__ */ jsxRuntime.jsx("optgroup", { label: "built-in examples", children: BUILTIN_EXAMPLE_SOURCES.map((src) => /* @__PURE__ */ jsxRuntime.jsx(
                "option",
                {
                  value: `file:${src.sourceId}`,
                  children: src.label
                },
                src.sourceId
              )) }),
              patternSources.length > 0 && /* @__PURE__ */ jsxRuntime.jsx("optgroup", { label: "playing patterns", children: patternSources.map((source) => /* @__PURE__ */ jsxRuntime.jsxs(
                "option",
                {
                  value: `file:${source.sourceId}`,
                  children: [
                    source.playing ? "\u25CF " : "\u25CB ",
                    source.label
                  ]
                },
                source.sourceId
              )) }),
              /* @__PURE__ */ jsxRuntime.jsx("option", { value: "none", children: "none (demo mode)" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx("div", { style: { width: 1, height: 14, background: "var(--border)" } }),
        /* @__PURE__ */ jsxRuntime.jsxs(
          "button",
          {
            "data-testid": "viz-chrome-background",
            onClick: onToggleBackground,
            title: "Toggle background preview (Cmd+K B)",
            style: btnStyle,
            children: [
              "\u25A2",
              " Background"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx("div", { style: { flex: 1 } }),
        /* @__PURE__ */ jsxRuntime.jsxs(
          "span",
          {
            "data-testid": "viz-chrome-live-indicator",
            title: "Hot reload is on \u2014 preview updates as you type",
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 3,
              fontSize: 10,
              fontFamily: "inherit",
              background: "var(--accent-dim)",
              color: "var(--accent-strong, var(--accent))",
              border: "1px solid var(--accent-dim)",
              userSelect: "none"
            },
            children: [
              "\u27F3",
              " live"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsxs(
          "button",
          {
            onClick: onSave,
            title: "Save (Cmd+S)",
            style: btnStyle,
            children: [
              "\u2318",
              "S"
            ]
          }
        )
      ]
    }
  );
}
function createCompiledVizProvider(opts) {
  return {
    extensions: opts.extensions,
    label: opts.label,
    keepRunningWhenHidden: false,
    // D-03
    reload: "debounced",
    // D-07
    debounceMs: 300,
    // D-07
    render: (ctx) => {
      return /* @__PURE__ */ jsxRuntime.jsx(
        CompiledVizMount,
        {
          file: ctx.file,
          rendererType: opts.renderer,
          audioSource: ctx.audioSource,
          hidden: ctx.hidden,
          paused: ctx.paused ?? false,
          fileId: ctx.file.id
        }
      );
    },
    renderEditorChrome: (ctx) => {
      return /* @__PURE__ */ jsxRuntime.jsx(VizEditorChrome, { ...ctx });
    }
  };
}
function CompiledVizMount(props) {
  const { file, rendererType, audioSource, hidden, paused, fileId } = props;
  const { descriptor, compileError } = React.useMemo(() => {
    try {
      const preset = {
        id: file.id,
        name: file.path,
        renderer: rendererType,
        code: file.content,
        requires: [],
        createdAt: 0,
        updatedAt: 0
      };
      return { descriptor: compilePreset(preset), compileError: null };
    } catch (err2) {
      return {
        descriptor: null,
        compileError: err2 instanceof Error ? err2.message : String(err2)
      };
    }
  }, [file.id, file.content, file.language, rendererType]);
  const containerRef = React.useRef(null);
  const rendererRef = React.useRef(null);
  const components = React.useMemo(() => {
    const bag = {};
    if (audioSource?.hapStream) {
      bag.streaming = { hapStream: audioSource.hapStream };
    }
    if (audioSource?.analyser) {
      bag.audio = {
        analyser: audioSource.analyser,
        audioCtx: audioSource.analyser.context
      };
    }
    if (audioSource?.scheduler) {
      bag.queryable = {
        scheduler: audioSource.scheduler,
        trackSchedulers: /* @__PURE__ */ new Map()
      };
    }
    if (audioSource?.inlineViz) {
      bag.inlineViz = audioSource.inlineViz;
    }
    return bag;
  }, [audioSource]);
  React.useEffect(() => {
    if (!descriptor) return;
    const el = containerRef.current;
    if (!el) return;
    const size = {
      w: el.clientWidth || 400,
      h: el.clientHeight || 300
    };
    let mounted = null;
    try {
      mounted = mountVizRenderer(
        el,
        descriptor.factory,
        components,
        size,
        (e) => {
          console.error("[compiledVizProvider] renderer error:", e);
        }
      );
      rendererRef.current = mounted;
    } catch (err2) {
      console.error(
        "[compiledVizProvider] mountVizRenderer threw:",
        err2
      );
    }
    return () => {
      rendererRef.current = null;
      if (mounted) {
        try {
          mounted.disconnect();
          mounted.renderer.destroy();
        } catch {
        }
      }
    };
  }, [descriptor]);
  React.useEffect(() => {
    const r = rendererRef.current?.renderer;
    if (!r || !r.update) return;
    try {
      r.update(components);
    } catch {
    }
  }, [components]);
  React.useEffect(() => {
    const r = rendererRef.current?.renderer;
    if (!r) return;
    if (hidden) {
      try {
        r.pause();
      } catch {
      }
    } else {
      try {
        r.resume();
      } catch {
      }
    }
  }, [hidden]);
  React.useEffect(() => {
    const r = rendererRef.current?.renderer;
    if (!r) return;
    if (paused) {
      try {
        r.pause();
      } catch {
      }
    } else if (!hidden) {
      try {
        r.resume();
      } catch {
      }
    }
  }, [paused, hidden]);
  if (compileError !== null) {
    return /* @__PURE__ */ jsxRuntime.jsx(
      "div",
      {
        "data-testid": `compiled-viz-error-${fileId}`,
        "data-compiled-viz-error": "true",
        style: {
          padding: 12,
          color: "#ff6b6b",
          fontSize: 12,
          whiteSpace: "pre-wrap",
          fontFamily: "var(--font-mono)",
          background: "rgba(255,107,107,0.05)",
          height: "100%",
          boxSizing: "border-box",
          overflow: "auto"
        },
        children: compileError
      }
    );
  }
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      ref: containerRef,
      "data-testid": `compiled-viz-mount-${fileId}`,
      "data-compiled-viz-mount": "true",
      "data-renderer": descriptor?.renderer ?? "unknown",
      style: {
        width: "100%",
        height: "100%",
        background: "var(--background)",
        overflow: "hidden",
        position: "relative"
      }
    }
  );
}

// src/workspace/preview/hydraViz.tsx
var HYDRA_VIZ = createCompiledVizProvider({
  extensions: ["hydra"],
  label: "Hydra Visualization",
  renderer: "hydra"
});

// src/workspace/preview/p5Viz.tsx
var P5_VIZ = createCompiledVizProvider({
  extensions: ["p5"],
  label: "p5 Visualization",
  renderer: "p5"
});

// src/workspace/preview/namedVizBridge.ts
function registerPresetAsNamedViz(preset) {
  try {
    const descriptor = compilePreset(preset);
    registerNamedViz(preset.name, descriptor);
    return true;
  } catch {
    unregisterNamedViz(preset.name);
    return false;
  }
}

exports.AUTO_SNAPSHOT_PREFIX = AUTO_SNAPSHOT_PREFIX;
exports.BUNDLED_PREFIX = BUNDLED_PREFIX;
exports.BufferedScheduler = BufferedScheduler;
exports.DARK_THEME_TOKENS = DARK_THEME_TOKENS;
exports.DEFAULT_VIZ_CONFIG = DEFAULT_VIZ_CONFIG;
exports.DEFAULT_VIZ_DESCRIPTORS = DEFAULT_VIZ_DESCRIPTORS;
exports.DemoEngine = DemoEngine;
exports.EditorView = EditorView;
exports.HYDRA_VIZ = HYDRA_VIZ;
exports.HapStream = HapStream;
exports.HydraVizRenderer = HydraVizRenderer;
exports.IR = IR;
exports.IREventCollectSystem = IREventCollectSystem;
exports.LIGHT_THEME_TOKENS = LIGHT_THEME_TOKENS;
exports.LiveCodingEditor = LiveCodingEditor;
exports.LiveCodingRuntime = LiveCodingRuntime;
exports.LiveRecorder = LiveRecorder;
exports.OfflineRenderer = OfflineRenderer;
exports.P5VizRenderer = P5VizRenderer;
exports.P5_VIZ = P5_VIZ;
exports.PATTERN_IR_SCHEMA_VERSION = PATTERN_IR_SCHEMA_VERSION;
exports.PianorollSketch = PianorollSketch;
exports.PitchwheelSketch = PitchwheelSketch;
exports.PreviewView = PreviewView;
exports.SAMPLE_SOUND_LABEL = SAMPLE_SOUND_LABEL;
exports.SAMPLE_SOUND_SOURCE_ID = SAMPLE_SOUND_SOURCE_ID;
exports.SONICPI_RUNTIME = SONICPI_RUNTIME;
exports.STRUDEL_RUNTIME = STRUDEL_RUNTIME;
exports.ScopeSketch = ScopeSketch;
exports.SonicPiEngine = SonicPiEngine2;
exports.SpectrumSketch = SpectrumSketch;
exports.SpiralSketch = SpiralSketch;
exports.SplitPane = SplitPane;
exports.StrudelEditor = StrudelEditor;
exports.StrudelEngine = StrudelEngine;
exports.StrudelParseSystem = StrudelParseSystem;
exports.VizDropdown = VizDropdown;
exports.VizEditor = VizEditor;
exports.VizPanel = VizPanel;
exports.VizPicker = VizPicker;
exports.VizPresetStore = VizPresetStore;
exports.WavEncoder = WavEncoder;
exports.WorkspaceShell = WorkspaceShell;
exports.applyPersistedTheme = applyPersistedTheme;
exports.applyTheme = applyTheme;
exports.bumpEditorFontSize = bumpEditorFontSize;
exports.bundledPresetId = bundledPresetId;
exports.canRedo = canRedo;
exports.canUndo = canUndo;
exports.collect = collect;
exports.compilePreset = compilePreset;
exports.createProject = createProject;
exports.createVizConfig = createVizConfig;
exports.createWorkspaceFile = createWorkspaceFile;
exports.cycleEditorTheme = cycleEditorTheme;
exports.deleteProject = deleteProject;
exports.deleteSnapshot = deleteSnapshot;
exports.deleteWorkspaceFile = deleteWorkspaceFile;
exports.duplicateProject = duplicateProject;
exports.filter = filter;
exports.flushToPreset = flushToPreset;
exports.generateUniquePresetId = generateUniquePresetId;
exports.getActiveProjectId = getActiveProjectId;
exports.getChildOrder = getChildOrder;
exports.getEditorFontSize = getEditorFontSize;
exports.getEditorMinimap = getEditorMinimap;
exports.getEditorTheme = getEditorTheme;
exports.getFile = getFile;
exports.getFolderOrder = getFolderOrder;
exports.getLastOpenedProject = getLastOpenedProject;
exports.getNamedViz = getNamedViz;
exports.getPresetIdForFile = getPresetIdForFile;
exports.getPreviewProviderForExtension = getPreviewProviderForExtension;
exports.getPreviewProviderForLanguage = getPreviewProviderForLanguage;
exports.getProject = getProject;
exports.getResolvedTheme = getResolvedTheme;
exports.getRuntimeProviderForExtension = getRuntimeProviderForExtension;
exports.getRuntimeProviderForLanguage = getRuntimeProviderForLanguage;
exports.getSubfolderOrder = getSubfolderOrder;
exports.getVizConfig = getVizConfig;
exports.hydraKaleidoscope = hydraKaleidoscope;
exports.hydraPianoroll = hydraPianoroll;
exports.hydraScope = hydraScope;
exports.initProjectDoc = initProjectDoc;
exports.initProjectDocSync = initProjectDocSync;
exports.isBundledPresetId = isBundledPresetId;
exports.isDocReady = isDocReady;
exports.isSampleSoundPlaying = isSampleSoundPlaying;
exports.listNamedVizEntries = listNamedVizEntries;
exports.listNamedVizNames = listNamedVizNames;
exports.listProjects = listProjects;
exports.listSnapshots = listSnapshots;
exports.listWorkspaceFiles = listWorkspaceFiles;
exports.liveCodingRuntimeRegistry = liveCodingRuntimeRegistry;
exports.merge = merge;
exports.mountVizRenderer = mountVizRenderer;
exports.normalizeStrudelHap = normalizeStrudelHap;
exports.noteToMidi = noteToMidi;
exports.onNamedVizChanged = onNamedVizChanged;
exports.onThemeChange = onThemeChange;
exports.parseMini = parseMini;
exports.parseStrudel = parseStrudel;
exports.patternFromJSON = patternFromJSON;
exports.patternToJSON = patternToJSON;
exports.previewProviderRegistry = previewProviderRegistry;
exports.propagate = propagate;
exports.redo = redo;
exports.registerNamedViz = registerNamedViz;
exports.registerPresetAsNamedViz = registerPresetAsNamedViz;
exports.registerPreviewProvider = registerPreviewProvider;
exports.registerRuntimeProvider = registerRuntimeProvider;
exports.renameProject = renameProject;
exports.renameWorkspaceFile = renameWorkspaceFile;
exports.resetFileStore = resetFileStore;
exports.resetUndoManager = resetUndoManager;
exports.resolveDescriptor = resolveDescriptor;
exports.restoreSnapshot = restoreSnapshot;
exports.revealLineInFile = revealLineInFile;
exports.sanitizePresetName = sanitizePresetName;
exports.saveSnapshot = saveSnapshot;
exports.scaleGain = scaleGain;
exports.seedFromPreset = seedFromPreset;
exports.seedFromPresetId = seedFromPresetId;
exports.seedWorkspaceFile = seedWorkspaceFile;
exports.setChildOrder = setChildOrder;
exports.setContent = setContent;
exports.setEditorFontSize = setEditorFontSize;
exports.setEditorTheme = setEditorTheme;
exports.setFolderOrder = setFolderOrder;
exports.setSubfolderOrder = setSubfolderOrder;
exports.setVizConfig = setVizConfig;
exports.startSampleSound = startSampleSound;
exports.stopSampleSound = stopSampleSound;
exports.subscribeToDocUpdate = subscribeToDocUpdate;
exports.subscribeToFileList = subscribeToFileList;
exports.subscribeToFolderOrder = subscribeToFolderOrder;
exports.subscribeToUndoState = subscribeToUndoState;
exports.subscribeToWorkspaceFile = subscribe;
exports.switchProject = switchProject;
exports.timestretch = timestretch;
exports.toStrudel = toStrudel;
exports.toggleEditorMinimap = toggleEditorMinimap;
exports.touchProject = touchProject;
exports.transpose = transpose;
exports.undo = undo;
exports.unregisterNamedViz = unregisterNamedViz;
exports.useWorkspaceFile = useWorkspaceFile;
exports.withStructBatch = withStructBatch;
exports.workspaceAudioBus = workspaceAudioBus;
exports.workspaceFileIdForPreset = workspaceFileIdForPreset;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map