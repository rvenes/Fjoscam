const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const EXPECTED_APP_ID = 'no.fjoscam.viewer';
const EXPECTED_AUTHORITY = 'Apple Development: rune@venes.org (X788384FY7)';
const EXPECTED_TEAM_ID = 'JWLWQF223D';

function runCodesign(args) {
  const result = spawnSync('codesign', args, { encoding: 'utf8' });
  const output = `${result.stdout || ''}${result.stderr || ''}`;

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`codesign ${args.join(' ')} failed:\n${output.trim()}`);
  }

  return output;
}

module.exports = async function verifyMacSignature(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  runCodesign(['--verify', '--deep', '--strict', '--verbose=2', appPath]);

  const details = runCodesign(['-dvvv', appPath]);
  const requirement = runCodesign(['-dr', '-', appPath]);
  const expectedDetails = [
    `Identifier=${EXPECTED_APP_ID}`,
    `Authority=${EXPECTED_AUTHORITY}`,
    `TeamIdentifier=${EXPECTED_TEAM_ID}`,
  ];
  const expectedRequirement = [
    `identifier "${EXPECTED_APP_ID}"`,
    `certificate leaf[subject.CN] = "${EXPECTED_AUTHORITY}"`,
  ];
  const missing = [
    ...expectedDetails.filter((value) => !details.includes(value)),
    ...expectedRequirement.filter((value) => !requirement.includes(value)),
  ];

  if (missing.length > 0) {
    throw new Error(
      `Refusing to package a macOS update with an unexpected code-signing identity. Missing: ${missing.join(', ')}`,
    );
  }

  console.log(`Verified macOS update signature: ${EXPECTED_AUTHORITY}, team ${EXPECTED_TEAM_ID}`);
};
