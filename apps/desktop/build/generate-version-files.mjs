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
  console.error('错误: 缺少版本号参数 (--version=X.Y.Z)')
  console.log(
    '使用方法: node update-version.js --version=0.0.6 [--notes="版本更新说明"] [--date="2023-06-15"]'
  )
  process.exit(1)
}

// Ensure version number format is valid
if (!versionRegex.test(params.version)) {
  console.error('错误: 版本号格式不正确，应为 X.Y.Z 格式')
  process.exit(1)
}

const template = {
  version: params.version,
  releaseDate: params.date || new Date().toISOString().split('T')[0],
  releaseNotes: params.notes || '测试版本',
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
  // Start of Selection
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
  console.log(`已生成 ${platform}.json`)
})

console.log('所有版本信息文件生成完成！')
