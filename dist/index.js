"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const core = __importStar(require("@actions/core"));
const run = (cmd, cwd) => (0, node_child_process_1.execSync)(cmd, { encoding: 'utf8', stdio: 'inherit', cwd });
const getPlatform = () => {
    switch (process.platform) {
        case 'darwin':
            return 'mac';
        case 'win32':
            return 'windows';
        default:
            return 'linux';
    }
};
const runAction = () => {
    const platform = getPlatform();
    const pkgRoot = core.getInput('package_root', { required: true });
    const buildScriptName = core.getInput('build_script_name', { required: true });
    const release = core.getBooleanInput('release');
    const skipBuild = core.getBooleanInput('skip_build');
    const useVueCli = core.getBooleanInput('use_vue_cli');
    const args = core.getInput('args');
    const maxAttempts = parseInt(core.getInput('max_attempts')) || 1;
    core.setSecret('GH_TOKEN');
    // Set environment variables
    core.exportVariable('ADBLOCK', 'true');
    core.exportVariable('GH_TOKEN', core.getInput('github_token', { required: true }));
    // Set environment variables for code signing
    if (platform === 'mac') {
        core.exportVariable('CSC_LINK', core.getInput('mac_certs'));
        core.exportVariable('CSC_KEY_PASSWORD', core.getInput('mac_certs_password'));
    }
    else if (platform === 'windows') {
        core.exportVariable('CSC_LINK', core.getInput('windows_certs'));
        core.exportVariable('CSC_KEY_PASSWORD', core.getInput('windows_certs_password'));
    }
    const useNpm = (0, node_fs_1.existsSync)((0, node_path_1.join)(pkgRoot, 'package-lock.json'));
    core.info(`Installing dependencies using ${useNpm ? 'npm' : 'yarn'} in directory "${pkgRoot}"`);
    // Install dependencies
    run(`${useNpm ? 'npm install' : 'yarn'}`, pkgRoot);
    core.startGroup('Build node');
    if (!skipBuild) {
        core.info('Running the build script…');
        const pkgJsonPath = (0, node_path_1.join)(pkgRoot, 'package.json');
        if (!(0, node_fs_1.existsSync)(pkgJsonPath)) {
            core.setFailed(`No package.json found at "${pkgJsonPath}"`);
            return;
        }
        const pkgJson = JSON.parse((0, node_fs_1.readFileSync)(pkgJsonPath, 'utf8'));
        if (pkgJson.scripts && pkgJson.scripts[buildScriptName]) {
            run(`${useNpm ? 'npm run' : 'yarn run'} ${buildScriptName}`, pkgRoot);
        }
    }
    else {
        core.info('Skipping build script because `skip_build` option is set.');
    }
    core.endGroup();
    core.startGroup('Build electron app');
    core.info(`Building${release ? ' and releasing' : ''} the Electron app`);
    const cmd = useVueCli ? 'vue-cli-service electron:build' : 'electron-builder';
    core.debug(`running ${cmd} in ${pkgRoot} with args: ${args}`);
    for (let i = 0; i < maxAttempts; i++) {
        try {
            run(`${useNpm ? 'npx --no-install' : 'yarn run'} ${cmd} --${platform} ${release ? '--publish always' : ''} ${args}`, pkgRoot);
            break;
        }
        catch (error) {
            if (error instanceof Error) {
                if (i < maxAttempts - 1) {
                    core.error(`Attempt ${i + 1} failed: ${error.message}`);
                }
                else {
                    core.setFailed(error.message);
                }
            }
        }
    }
    core.endGroup();
};
runAction();
