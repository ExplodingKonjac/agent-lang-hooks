import { existsSync, statSync } from "node:fs";
import path from "node:path";

const CMAKE_BUILD_DIRS = [
  "build",
  "cmake-build-debug",
  "cmake-build-release",
  path.join("out", "build"),
];
const CMAKE_BUILD_MARKERS = [
  "CTestTestfile.cmake",
  "compile_commands.json",
  "CMakeCache.txt",
];

export function findCMakeBuildDir(projectDir) {
  for (const buildName of CMAKE_BUILD_DIRS) {
    const buildDir = path.join(projectDir, buildName);
    try {
      if (!statSync(buildDir).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    if (
      CMAKE_BUILD_MARKERS.some((marker) =>
        existsSync(path.join(buildDir, marker)),
      )
    ) {
      return buildDir;
    }
  }

  return null;
}
