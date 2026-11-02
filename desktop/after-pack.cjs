'use strict';

exports.default = async context => {
  const path = require('node:path');
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  await flipFuses(path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`), {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
};
