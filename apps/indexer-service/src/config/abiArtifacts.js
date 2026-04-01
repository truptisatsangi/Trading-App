import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

function readArtifact(relativePathFromConfig) {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const artifactPath = path.resolve(here, relativePathFromConfig);
  const raw = readFileSync(artifactPath, "utf8");
  return JSON.parse(raw);
}

export const positionManagerArtifact = readArtifact(
  "../../../../flaunch-contracts/abi/PositionManager.json"
);
export const anyPositionManagerArtifact = readArtifact(
  "../../../../flaunch-contracts/abi/AnyPositionManager.json"
);
export const memecoinArtifact = readArtifact(
  "../../../../flaunch-contracts/abi/Memecoin.json"
);
