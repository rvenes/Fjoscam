"""Collect notices from exact Go module ZIPs, without extracting or running code.

Maintenance-only network tool (Python standard library). The destination must
be new; review its output before copying it into vendor/go2rtc. Normal builds
never invoke this script. Go h1 format: golang.org/x/mod/sumdb/dirhash.
"""
import argparse
import base64
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import urllib.request
import zipfile


def download(url):
    with urllib.request.urlopen(url, timeout=45) as response:
        data = response.read(64 * 1024 * 1024 + 1)
    if len(data) > 64 * 1024 * 1024:
        raise ValueError("Download exceeds collection limit")
    return data


def sha(data):
    return hashlib.sha256(data).hexdigest()


def notice_index(inventory, revision):
    text = f'''# Third-party notices for bundled go2rtc

This directory accompanies go2rtc {inventory['go2rtcVersion']} (source commit
`{revision}`), built with {inventory['goVersion']}.
The go2rtc MIT notice is in [LICENSE](LICENSE).

All {len(inventory['modules'])} dependency modules below are reported in the embedded build information
of each bundled Windows x64, macOS x64 and macOS arm64 binary. Exact versions,
Go `h1` sums, source archive URLs/SHA-256 and original notice paths/SHA-256 are
recorded in [modules.json](modules.json). Each complete module ZIP was checked
against the binary's embedded `h1` sum before collecting these unmodified texts.
The archive links below also provide the corresponding module source code.

This is a module-level inventory, not a claim that every file in each module is
linked into the executable. Nested notices (including WebRTC test-wasm) are
retained conservatively. It does not replace a per-file/per-symbol assessment
of copied code or a license review of Electron, npm dependencies, codecs,
assets or the entire application. The Go toolchain entries below cover its
root license and patent grant, not every attribution in the Go source tree.

Paho's original LICENSE, NOTICE and both full license texts are retained.
Its NOTICE declares a dual-license choice; the upstream texts remain
unchanged. The full Apache 2.0 text supplements the headers in go-pkgs and
yaml.v3; it does not replace their copyright/NOTICE text.

## Modules and original notices

| Module | Version | Original notice files | Source archive |
|---|---|---|---|
'''
    for module in inventory['modules']:
        links = ', '.join(f"[{n['sourcePath']}]({n['file']})" for n in module['notices'])
        text += f"| `{module['path']}` | `{module['version']}` | {links} | [ZIP]({module['archiveUrl']}) |\n"
    text += '\n## Go toolchain and supplemental texts\n\n'
    for notice in inventory['toolchainNotices'] + inventory['supplementalNotices']:
        text += f"- [{notice['file'].split('/')[-1]}]({notice['file']}) ([source]({notice['sourceUrl']}))"
        if 'modules' in notice:
            text += '; applies to ' + ', '.join(f'`{module}`' for module in notice['modules'])
        text += '\n'
    return text + '\nSee [README.md](README.md) for verification and controlled regeneration.\n'


def collect_module(pair, destination):
    index, module = pair
    module_path, version = module['path'], module['version']
    if not re.fullmatch(r'[a-z0-9./_-]+', module_path) or '..' in module_path.split('/') or not re.fullmatch(r'v[0-9A-Za-z.+-]+', version):
        raise ValueError("Unsupported module path/version; review it explicitly")
    url = f'https://proxy.golang.org/{module_path}/@v/{version}.zip'
    data = download(url)
    (destination / f'module-{index:02d}.zip').write_bytes(data)
    prefix = f'{module_path}@{version}/'
    notices = []
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        files = archive.infolist()
        if len(files) > 50000 or len({item.filename for item in files}) != len(files) or sum(item.file_size for item in files) > 256 * 1024 * 1024:
            raise ValueError(f'Unsafe archive size/duplicates: {module_path}')
        summary = hashlib.sha256()
        for item in sorted(files, key=lambda item: item.filename):
            if not item.filename.startswith(prefix) or '\n' in item.filename or '..' in PurePosixPath(item.filename).parts:
                raise ValueError(f'Invalid archive entry: {module_path}')
            contents = archive.read(item)
            summary.update(f'{sha(contents)}  {item.filename}\n'.encode())
            relative = item.filename[len(prefix):]
            # Paho uses these names for its complete dual-license texts.
            extra = module_path == 'github.com/eclipse/paho.mqtt.golang' and relative in ('edl-v10', 'epl-v20')
            if extra or re.fullmatch(r'(LICENSE|LICENCE|COPYING|NOTICE|PATENTS)([._-].*)?', PurePosixPath(relative).name, re.I):
                if not contents or len(contents) > 1024 * 1024:
                    raise ValueError(f'Invalid notice size: {module_path}')
                contents.decode('utf-8')  # Preserve original bytes, reject opaque data.
                notices.append((relative, contents))
        actual = 'h1:' + base64.b64encode(summary.digest()).decode()
        if actual != module['sum']:
            raise ValueError(f'Go module checksum mismatch: {module_path}')
    if not notices:
        raise ValueError(f'No license/notice found: {module_path}')
    records = []
    for ordinal, (relative, contents) in enumerate(notices):
        name = f'notices/module-{index:02d}-{ordinal:02d}.txt'
        (destination / name).write_bytes(contents)
        records.append({'sourcePath': relative, 'file': name, 'sha256': sha(contents)})
    print(f"Verified {module_path}@{version}: {len(records)} notices", flush=True)
    return {**module, 'archiveUrl': url, 'archiveSha256': sha(data), 'notices': records}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-info', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    builds = json.loads(args.build_info.read_text(encoding='utf-8'))
    if len(builds) != 3 or any(any(build[key] != builds[0][key] for key in ('dependencies', 'goVersion', 'modulePath', 'version')) for build in builds):
        raise ValueError('Review platform-specific module differences before collecting notices')
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output / 'notices').mkdir()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        modules = list(pool.map(lambda pair: collect_module(pair, args.output), enumerate(builds[0]['dependencies'])))
    version = builds[0]['goVersion']
    if not re.fullmatch(r'go\d+\.\d+\.\d+', version):
        raise ValueError('Unsupported Go version')
    toolchain_notices = []
    for name in ['LICENSE', 'PATENTS']:
        url = f'https://raw.githubusercontent.com/golang/go/{version}/{name}'
        data = download(url)
        if not data or len(data) > 1024 * 1024:
            raise ValueError('Invalid toolchain notice size')
        data.decode('utf-8')
        file = f'notices/go-{name}.txt'
        (args.output / file).write_bytes(data)
        toolchain_notices.append({'sourceUrl': url, 'file': file, 'sha256': sha(data)})
    # These two modules include the Apache grant/header, but not its full text.
    apache_url = 'https://www.apache.org/licenses/LICENSE-2.0.txt'
    apache = download(apache_url)
    if not apache or len(apache) > 1024 * 1024 or 'END OF TERMS AND CONDITIONS' not in apache.decode('utf-8'):
        raise ValueError('Invalid Apache license text')
    apache_file = 'notices/Apache-2.0.txt'
    (args.output / apache_file).write_bytes(apache)
    supplemental = [{'sourceUrl': apache_url, 'file': apache_file, 'sha256': sha(apache),
                     'modules': ['github.com/tadglines/go-pkgs', 'gopkg.in/yaml.v3']}]
    inventory = {'schemaVersion': 1, 'go2rtcVersion': builds[0]['version'], 'goVersion': version,
                 'modules': modules, 'toolchainNotices': toolchain_notices, 'supplementalNotices': supplemental}
    (args.output / 'modules.json').write_text(json.dumps(inventory, indent=2) + '\n', encoding='utf-8')
    (args.output / 'THIRD-PARTY-NOTICES.md').write_text(notice_index(inventory, builds[0]['settings']['vcs.revision']), encoding='utf-8')
    print(f'Collected {len(modules)} verified modules; review before vendoring.', flush=True)


if __name__ == '__main__':
    main()
