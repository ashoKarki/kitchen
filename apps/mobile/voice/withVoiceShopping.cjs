const { withDangerousMod, withXcodeProject, IOSConfig } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const files = ["ShoppingIntent.swift", "VoiceShoppingModule.m"];

module.exports = function withVoiceShopping(config) {
  config = withDangerousMod(config, ["ios", async (mod) => {
    const destination = path.join(mod.modRequest.platformProjectRoot, mod.modRequest.projectName);
    for (const file of files) {
      fs.copyFileSync(path.join(__dirname, file), path.join(destination, file));
    }
    return mod;
  }]);
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const projectName = mod.modRequest.projectName;
    IOSConfig.XcodeUtils.ensureGroupRecursively(project, projectName);
    const group = project.findPBXGroupKey({ name: projectName });
    if (!group) throw new Error("Could not find the iOS app source group for Siri.");
    for (const file of files) {
      const filePath = `${projectName}/${file}`;
      if (!project.hasFile(filePath)) project.addSourceFile(filePath, { target: project.getFirstTarget().uuid }, group);
    }
    return mod;
  });
};
