#!/usr/bin/env node

/**
 * Version info file generation script
 *
 * This script generates version info JSON files for each platform
 * Usage: node generate-version-files.mjs
 */

import fs from 'fs'
import path from 'path'

const versionRegex = /^\d+\.\d+\.\d+$/

// Platform list
const platforms = [
  'winx64', // Windows x64
  'winarm', // Windows ARM64
  'macx64', // macOS x64
  'macarm', // macOS ARM64
  'linuxx64', // Linux x64
  'linuxarm' // Linux ARM64
]
// Parse command-line arguments
const args = process.argv.slice(2)
const params = {}
args.forEach((arg) => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.substring(2).split('=')
    params[key] = value
  }
})

// Check required parameters
if (!params.version) {
  console.error('Error: missing version argument (--version=X.Y.Z)')
  console.log(
    'Usage: node update-version.js --version=0.0.6 [--notes="Release notes"] [--date="2023-06-15"]'
  )
  process.exit(1)
}

// Ensure version number format is valid
if (!versionRegex.test(params.version)) {
  console.error('Error: invalid version format, expected X.Y.Z')
  process.exit(1)
}

const template = {
  version: params.version,
  releaseDate: params.date || new Date().toISOString().split('T')[0],
  releaseNotes: params.notes || 'Test release',
  githubUrl: `https://github.com/dvaJi/argos/releases/tag/v${params.version}`,
  downloadUrl: `https://argos.thinkinai.xyz/#/download`
}

// Generate version info file for each platform
platforms.forEach((platform) => {
  // Copy template object
  const platformData = { ...template }
  let os = 'windows'
  if (platform.includes('mac')) {
    os = 'mac'
  } else if (platform.includes('linux')) {
    os = 'linux'
  }
  let arch = 'x64'
  if (platform.includes('arm')) {
    arch = 'arm64'
  }
  if (os === 'windows') {
    platformData.githubUrl = `https://github.com/dvaJi/argos/releases/download/v${params.version}/Argos-${params.version}-windows-${arch}.exe`
  } else if (os === 'mac') {
    platformData.githubUrl = `https://github.com/dvaJi/argos/releases/download/v${params.version}/Argos-${params.version}-mac-${arch}.dmg`
  } else if (os === 'linux') {
    platformData.githubUrl = `https://github.com/dvaJi/argos/releases/download/v${params.version}/Argos-${params.version}-linux-${arch}.tar.gz`
  }
  // Write file
  const outputPath = path.join(process.cwd(), `${platform}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(platformData, null, 2), 'utf8')
  console.log(`Generated ${platform}.json`)
})

console.log('All version info files generated!')
