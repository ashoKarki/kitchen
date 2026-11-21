import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import configPlugins from "expo/config-plugins";
import withVoiceShopping from "./withVoiceShopping.cjs";

const { compileModsAsync } = configPlugins;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iosRoot = path.join(projectRoot, "ios");

async function main() {
  if (!fs.existsSync(iosRoot)) {
    console.log("No iOS project exists yet; Expo will apply the Siri plugin when it generates one.");
    return;
  }
  const { expo } = JSON.parse(fs.readFileSync(path.join(projectRoot, "app.json"), "utf8"));
  const config = withVoiceShopping(expo);
  await compileModsAsync(config, { projectRoot, platforms: ["ios"] });
  console.log("Siri shopping sources are registered in the iOS project.");
}

main().catch((error) => {
  console.error("Could not sync Siri shopping into the iOS project:", error);
  process.exitCode = 1;
});
