import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as core from '@actions/core'

const run = (cmd: string, cwd: string): string =>
	execSync(cmd, { encoding: 'utf8', stdio: 'inherit', cwd })

const getPlatform = (): 'mac' | 'windows' | 'linux' => {
	switch (process.platform) {
		case 'darwin':
			return 'mac'
		case 'win32':
			return 'windows'
		default:
			return 'linux'
	}
}

const runAction = (): void => {
	const platform = getPlatform()

	const pkgRoot = core.getInput('package_root', { required: true })
	const buildScriptName = core.getInput('build_script_name', { required: true })
	const release = core.getBooleanInput('release')
	const skipBuild = core.getBooleanInput('skip_build')
	const useVueCli = core.getBooleanInput('use_vue_cli')
	const args = core.getInput('args')
	const maxAttempts = parseInt(core.getInput('max_attempts')) || 1

	core.setSecret('GH_TOKEN')

	// Set environment variables
	core.exportVariable('ADBLOCK', 'true')
	core.exportVariable(
		'GH_TOKEN',
		core.getInput('github_token', { required: true })
	)

	// Set environment variables for code signing
	if (platform === 'mac') {
		core.exportVariable('CSC_LINK', core.getInput('mac_certs'))
		core.exportVariable('CSC_KEY_PASSWORD', core.getInput('mac_certs_password'))
	} else if (platform === 'windows') {
		core.exportVariable('CSC_LINK', core.getInput('windows_certs'))
		core.exportVariable(
			'CSC_KEY_PASSWORD',
			core.getInput('windows_certs_password')
		)
	}

	const useNpm = existsSync(join(pkgRoot, 'package-lock.json'))
	core.info(
		`Installing dependencies using ${
			useNpm ? 'npm' : 'yarn'
		} in directory "${pkgRoot}"`
	)

	// Install dependencies
	run(`${useNpm ? 'npm install' : 'yarn'}`, pkgRoot)

	core.startGroup('Build node')
	if (!skipBuild) {
		core.info('Running the build script…')
		const pkgJsonPath = join(pkgRoot, 'package.json')
		if (!existsSync(pkgJsonPath)) {
			core.setFailed(`No package.json found at "${pkgJsonPath}"`)
			return
		}

		const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
		if (pkgJson.scripts && pkgJson.scripts[buildScriptName]) {
			run(`${useNpm ? 'npm run' : 'yarn run'} ${buildScriptName}`, pkgRoot)
		}
	} else {
		core.info('Skipping build script because `skip_build` option is set.')
	}
	core.endGroup()

	core.startGroup('Build electron app')
	core.info(`Building${release ? ' and releasing' : ''} the Electron app`)
	const cmd = useVueCli ? 'vue-cli-service electron:build' : 'electron-builder'
	core.debug(`running ${cmd} in ${pkgRoot} with args: ${args}`)
	for (let i = 0; i < maxAttempts; i++) {
		try {
			run(
				`${useNpm ? 'npx --no-install' : 'yarn run'} ${cmd} --${platform} ${
					release ? '--publish always' : ''
				} ${args}`,
				pkgRoot
			)
			break
		} catch (error) {
			if (error instanceof Error) {
				if (i < maxAttempts - 1) {
					core.error(`Attempt ${i + 1} failed: ${error.message}`)
				} else {
					core.setFailed(error.message)
				}
			}
		}
	}
	core.endGroup()
}

runAction()
