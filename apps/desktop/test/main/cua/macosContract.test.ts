import { describe, expect, it } from "vitest";

import {
  findDisallowedDarwinLoadPaths,
  isAllowedDarwinLoadPath,
  parseDarwinLinkedLibraries,
  parseDarwinRpaths,
} from "../../../../../scripts/cua-macos-contract.mjs";

describe("parseDarwinRpaths", () => {
  it("parses LC_RPATH load commands", () => {
    const output = [
      "Load command 3",
      "          cmd LC_RPATH",
      "      cmdsize 40",
      "         path /build/rustdeps (offset 12)",
    ].join("\n");

    expect(parseDarwinRpaths(output)).toEqual(["/build/rustdeps"]);
  });

  it("ignores path entries from other load commands", () => {
    const output = [
      "Load command 1",
      "          cmd LC_LOAD_DYLIB",
      "      cmdsize 96",
      "         path /usr/lib/libSystem.B.dylib (offset 24)",
    ].join("\n");

    expect(parseDarwinRpaths(output)).toEqual([]);
  });
});

describe("parseDarwinLinkedLibraries", () => {
  it("parses linked library entries", () => {
    const output = [
      "/bin/ls:",
      "\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1361.0.0)",
      "\t/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation (compatibility version 150.0.0, current version 2076.0.0)",
    ].join("\n");

    expect(parseDarwinLinkedLibraries(output)).toEqual([
      "/usr/lib/libSystem.B.dylib",
      "/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation",
    ]);
  });
});

describe("isAllowedDarwinLoadPath", () => {
  it("allows runtime-relative and system paths", () => {
    expect(isAllowedDarwinLoadPath("@executable_path/../Frameworks/libfoo.dylib")).toBe(true);
    expect(isAllowedDarwinLoadPath("@rpath/libbar.dylib")).toBe(true);
    expect(isAllowedDarwinLoadPath("/usr/lib/libz.1.dylib")).toBe(true);
    expect(isAllowedDarwinLoadPath("/System/Library/Frameworks/CoreFoundation.framework/A")).toBe(true);
  });

  it("rejects build-machine and traversal paths", () => {
    expect(isAllowedDarwinLoadPath("/home/build/.rustup/toolchains/libstd.dylib")).toBe(false);
    expect(isAllowedDarwinLoadPath("@loader_path/../../weird/lib.dylib")).toBe(false);
    expect(isAllowedDarwinLoadPath("")).toBe(false);
  });
});

describe("findDisallowedDarwinLoadPaths", () => {
  it("returns only disallowed entries and dedupes", () => {
    const paths = [
      "@rpath/libc.so",
      "/build/machine/libnative.dylib",
      "/build/machine/libnative.dylib",
      "/usr/lib/libSystem.B.dylib",
    ];
    expect(findDisallowedDarwinLoadPaths(paths)).toEqual(["/build/machine/libnative.dylib"]);
  });
});
