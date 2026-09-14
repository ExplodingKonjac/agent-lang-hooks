import { existsSync, statSync } from "node:fs";
import path from "node:path";

const CMAKE_BUILD_DIRS = [
  "build",
  "cmake-build-debug",
  "cmake-build-release",
  path.join("out", "build"),
];
export function findCMakeBuildDir(projectDir) {
  return findCMakeBuildDirWithMarker(projectDir, null);
}

export function findCMakeBuildDirWithMarker(projectDir, marker) {
  for (const buildName of CMAKE_BUILD_DIRS) {
    const buildDir = path.join(projectDir, buildName);
    try {
      if (!statSync(buildDir).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    if (marker === null || existsSync(path.join(buildDir, marker))) {
      return buildDir;
    }
  }

  return null;
}

export function findCMakeProjectRoots(startDir) {
  const roots = [];
  let currentDir = path.resolve(startDir);

  while (true) {
    if (existsSync(path.join(currentDir, "CMakeLists.txt"))) {
      roots.push(currentDir);
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return roots;
}

export function findConfiguredCMakeRoot(startDir) {
  const roots = findCMakeProjectRoots(startDir);
  return (
    roots.find((root) =>
      ["CMakeCache.txt", "CTestTestfile.cmake", "compile_commands.json"].some(
        (marker) => findCMakeBuildDirWithMarker(root, marker),
      ),
    ) || roots[0] || null
  );
}
