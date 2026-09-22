// Offline notice checks shared by the source-build and packaged Windows smoke.
const { createHash } = require('node:crypto');
const { lstat, readFile } = require('node:fs/promises');
const { join } = require('node:path');

async function verifyGoNotices(root, builds) {
  const inventory = JSON.parse(await readFile(join(root, 'modules.json'), 'utf8'));
  if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.modules) || !inventory.modules.length ||
      !Array.isArray(inventory.toolchainNotices) || !Array.isArray(inventory.supplementalNotices) || !builds.length) {
    throw new Error('Invalid Go notice inventory.');
  }
  const modules = inventory.modules;
  const names = new Set();
  for (const module of modules) {
    if (!/^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)+$/.test(module.path) || module.path.split('/').some((part) => part === '.' || part === '..') ||
        names.has(module.path) || !/^v[0-9A-Za-z.+-]+$/.test(module.version) || !/^h1:[A-Za-z0-9+/]{43}=$/.test(module.sum) ||
        !/^[a-f0-9]{64}$/.test(module.archiveSha256) ||
        module.archiveUrl !== `https://proxy.golang.org/${module.path}/@v/${module.version}.zip` ||
        !Array.isArray(module.notices) || !module.notices.length) throw new Error('Invalid Go module notice entry.');
    names.add(module.path);
    const sources = new Set();
    for (const notice of module.notices) {
      if (typeof notice.sourcePath !== 'string' || !notice.sourcePath ||
          /[\\\r\n\x00]/.test(notice.sourcePath) || notice.sourcePath.split('/').some((part) => !part || part === '.' || part === '..') ||
          sources.has(notice.sourcePath)) throw new Error('Invalid Go notice source path.');
      sources.add(notice.sourcePath);
    }
  }
  for (const build of builds) {
    if (build.goVersion !== inventory.goVersion || build.version !== inventory.go2rtcVersion ||
        build.dependencies.length !== modules.length || build.dependencies.some((dep) =>
          !modules.some((module) => module.path === dep.path && module.version === dep.version && module.sum === dep.sum))) {
      throw new Error('Go notice inventory does not match binary build information.');
    }
  }
  const expectedToolchain = ['LICENSE', 'PATENTS'].map((name) => `https://raw.githubusercontent.com/golang/go/${inventory.goVersion}/${name}`);
  if (inventory.toolchainNotices.length !== expectedToolchain.length || expectedToolchain.some((url) =>
    inventory.toolchainNotices.filter((notice) => notice.sourceUrl === url).length !== 1)) throw new Error('Missing Go toolchain notices.');
  // These pinned modules need the complete Apache text as well as their headers.
  const apacheModules = ['github.com/tadglines/go-pkgs', 'gopkg.in/yaml.v3'].filter((name) => names.has(name));
  const apacheUrl = 'https://www.apache.org/licenses/LICENSE-2.0.txt';
  if (inventory.supplementalNotices.length !== (apacheModules.length ? 1 : 0) ||
      (apacheModules.length && (inventory.supplementalNotices[0].sourceUrl !== apacheUrl ||
        !Array.isArray(inventory.supplementalNotices[0].modules) ||
        inventory.supplementalNotices[0].modules.length !== apacheModules.length ||
        apacheModules.some((name) => !inventory.supplementalNotices[0].modules.includes(name))))) {
    throw new Error('Missing supplemental Go module license text.');
  }
  const paho = modules.find((module) => module.path === 'github.com/eclipse/paho.mqtt.golang');
  if (paho && ['LICENSE', 'NOTICE.md', 'edl-v10', 'epl-v20'].some((source) => !paho.notices.some((notice) => notice.sourcePath === source))) {
    throw new Error('Missing Paho dual-license notices.');
  }
  const directory = await lstat(join(root, 'notices'));
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Invalid Go notice directory.');
  const seen = new Set();
  for (const notice of [...modules.flatMap((module) => module.notices), ...inventory.toolchainNotices, ...inventory.supplementalNotices]) {
    if (!/^notices\/[A-Za-z0-9][A-Za-z0-9_.-]*\.txt$/.test(notice.file) || !/^[a-f0-9]{64}$/.test(notice.sha256) || seen.has(notice.file.toLowerCase())) {
      throw new Error('Invalid Go notice file entry.');
    }
    seen.add(notice.file.toLowerCase());
    const path = join(root, notice.file);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 1024 * 1024) throw new Error('Invalid Go notice file type/size.');
    const bytes = await readFile(path);
    if (createHash('sha256').update(bytes).digest('hex') !== notice.sha256) throw new Error(`Go notice SHA-256 mismatch: ${notice.file}`);
  }
  const index = await readFile(join(root, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  if (modules.some((module) => !index.includes(`\`${module.path}\` | \`${module.version}\``)) ||
      [...seen].some((file) => !index.toLowerCase().includes(`](${file})`))) throw new Error('Incomplete Go notice index.');
  return { modules: modules.length, notices: seen.size };
}

module.exports = { verifyGoNotices };
