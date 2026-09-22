// electron-builder afterPack: select a verified binary before platform signing.
// No shared config mutation, source changes, deletion, or architecture fallback.
const { constants } = require('node:fs');
const { chmod, copyFile, lstat, mkdir, realpath } = require('node:fs/promises');
const { dirname, isAbsolute, join, relative, resolve, sep } = require('node:path');
const { Arch } = require('electron-builder');
const { verifyVendor, verifyPackagedVendor, vendorTarget } = require('./verifyVendor.cjs');

function within(parent, child) {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

module.exports = async function packageVendor(context) {
  const platform = context.electronPlatformName;
  const arch = Arch[context.arch];
  const binary = vendorTarget(platform, arch); // Reject universal/unsupported targets.
  const projectDir = resolve(context.packager.projectDir);
  const appOutDir = resolve(context.appOutDir);
  const resourcesDir = resolve(context.packager.getResourcesDir(appOutDir));
  if (appOutDir === projectDir || within(appOutDir, projectDir) || !within(appOutDir, resourcesDir)) {
    throw new Error('Unsafe go2rtc package output directory.');
  }
  const source = join(projectDir, 'vendor/go2rtc');
  if (appOutDir === source || within(source, appOutDir)) throw new Error('Cannot package go2rtc inside its source directory.');
  // The files rule has copied only notices/metadata into this unpacked folder.
  // Reject links along the destination path before making any changes.
  let current = appOutDir;
  for (const part of ['', ...relative(appOutDir, join(resourcesDir, 'app.asar.unpacked/vendor/go2rtc')).split(sep)]) {
    current = part ? join(current, part) : current;
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe go2rtc package directory type.');
  }
  const destination = current;
  if (await realpath(source) === await realpath(destination)) throw new Error('Cannot package go2rtc into its source directory.');
  await verifyVendor(source);
  // Exclusive directory/file creation fails on stale or accidentally unfiltered
  // output. Never remove or overwrite an existing binary to make packaging pass.
  const outputFile = join(destination, binary);
  await mkdir(dirname(outputFile));
  await copyFile(join(source, binary), outputFile, constants.COPYFILE_EXCL);
  if (platform === 'darwin') await chmod(outputFile, 0o755);
  const result = await verifyPackagedVendor(destination, platform, arch);
  console.log(`Packaged go2rtc: ${result.verified[0]}; ${result.modules} modules, ${result.notices} notices`);
};
