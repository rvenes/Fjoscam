// Offline reader for the inline build-info format used by our pinned Go >=1.18
// binaries. Not a general PE/Mach-O parser; binary integrity is checked first.
// Format reference: https://go.dev/src/debug/buildinfo/buildinfo.go
const magic = Buffer.from('\xff Go buildinf:', 'latin1');

function readGoBuildInfo(bytes) {
  const start = bytes.indexOf(magic);
  if (start < 0 || start % 16 !== 0 || start + 32 > bytes.length || bytes[start + 15] !== 2) {
    throw new Error('Unsupported Go build information.');
  }
  let offset = start + 32;
  const readString = () => {
    let length = 0;
    for (let shift = 0; shift <= 28; shift += 7) {
      if (offset >= bytes.length) break;
      const byte = bytes[offset++];
      length += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) {
        if (length > 1024 * 1024 || offset + length > bytes.length) break;
        const value = bytes.subarray(offset, offset + length); offset += length; return value;
      }
    }
    throw new Error('Invalid Go build information length.');
  };
  const goVersion = readString().toString('utf8');
  const framed = readString();
  if (!/^go\d+\.\d+\.\d+$/.test(goVersion) || framed.length < 33 || framed[framed.length - 17] !== 10) {
    throw new Error('Invalid Go build information framing.');
  }
  const dependencies = [];
  const settings = {};
  let modulePath; let version;
  for (const line of framed.subarray(16, -16).toString('utf8').trimEnd().split('\n')) {
    const [kind, path, moduleVersion, sum] = line.split('\t');
    if (kind === 'mod') {
      if (modulePath || !path || !moduleVersion) throw new Error('Invalid Go main module information.');
      modulePath = path; version = moduleVersion;
    }
    else if (kind === 'dep') {
      if (!path || !moduleVersion || !/^h1:[A-Za-z0-9+/]{43}=$/.test(sum ?? '') || dependencies.some((item) => item.path === path)) {
        throw new Error('Invalid Go dependency information.');
      }
      dependencies.push({ path, version: moduleVersion, sum });
    } else if (kind === 'build') {
      const equals = path?.indexOf('=') ?? -1;
      if (equals < 1 || Object.hasOwn(settings, path.slice(0, equals))) throw new Error('Invalid Go build setting.');
      settings[path.slice(0, equals)] = path.slice(equals + 1);
    } else if (kind !== 'path') throw new Error('Unsupported Go module information.');
  }
  if (!modulePath || !version || !dependencies.length) throw new Error('Missing Go module information.');
  return { goVersion, modulePath, version, dependencies, settings };
}

module.exports = { readGoBuildInfo };
