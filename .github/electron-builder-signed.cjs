// Optional future entry point. The default preview workflow never loads this
// file, imports a certificate, or submits anything to Apple's notary service.
const path = require('node:path');
const identity = process.env.EASYMD_DEVELOPER_IDENTITY;
if (!identity || !identity.startsWith('Developer ID Application:')) {
  throw new Error('Set EASYMD_DEVELOPER_IDENTITY to your Developer ID Application certificate name before using the signed release configuration.');
}

module.exports = {
  extends: path.resolve(__dirname, '../electron-builder.yml'),
  forceCodeSigning: true,
  mac: {
    identity,
    hardenedRuntime: true,
    notarize: true,
  },
  dmg: { sign: true },
};
