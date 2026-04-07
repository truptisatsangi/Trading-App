import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

function readArtifact(relativePathFromConfig) {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const artifactPath = path.resolve(here, relativePathFromConfig);
  const raw = readFileSync(artifactPath, "utf8");
  return JSON.parse(raw);
}

function eventOnlyAbi(artifact) {
  return (artifact.abi || []).filter((item) => item.type === "event");
}

export const positionManagerArtifact = readArtifact(
  "../../abis/PositionManager.json"
);
export const anyPositionManagerArtifact = readArtifact(
  "../../abis/AnyPositionManager.json"
);
export const memecoinArtifact = readArtifact(
  "../../abis/Memecoin.json"
);
export const flaunchArtifact = readArtifact(
  "../../abis/Flaunch.json"
);

export const positionManagerEventsAbi = eventOnlyAbi(positionManagerArtifact);
export const anyPositionManagerEventsAbi = eventOnlyAbi(anyPositionManagerArtifact);
export const memecoinEventsAbi = eventOnlyAbi(memecoinArtifact);
export const flaunchEventsAbi = eventOnlyAbi(flaunchArtifact);
