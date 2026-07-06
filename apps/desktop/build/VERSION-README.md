# Version Update Tool Instructions

This directory contains tool scripts for managing app version information, used to replace the previous auto-update mechanism.

## File Descriptions

- `version-template.json`: version information template file
- `generate-version-files.mjs`: script that generates platform-specific version information files based on the template
- `update-version.mjs`: convenience script that updates version information and generates per-platform files

## Usage

### 1. Update Version Information

Use the `update-version.mjs` script to quickly update version information and generate per-platform version files:

```bash
node generate-version-files.mjs  --version=0.0.6 --notes="Release notes"  --date="2023-06-15"
```

Parameter descriptions:
- `--version`: new version number (required, format X.Y.Z)
- `--notes`: release notes (optional)
- `--date`: release date (optional, defaults to the current date)

### 2. Generated Files

The script generates the following platform version files:

- `winx64.json`: Windows x64 version
- `winarm.json`: Windows ARM64 version
- `macx64.json`: macOS x64 version
- `macarm.json`: macOS ARM64 version
- `linuxx64.json`: Linux x64 version
- `linuxarm.json`: Linux ARM64 version

### 4. Deploying Files

The generated files need to be uploaded to the server's `/versions/` directory. The app checks for updates at the following URL:

```
https://argos.thinkinai.xyz/auth/{platform}.json
```

where `{platform}` is the identifier of the currently running platform (e.g., `winx64`, `macarm`, etc.).

## Version Information Format

The version information JSON file contains the following fields:

```json
{
  "version": "0.0.5",
  "releaseDate": "2023-06-01",
  "releaseNotes": "Release notes",
  "githubUrl": "https://github.com/dvaJi/argos/releases/tag/v0.0.5",
  "downloadUrl": "https://argos.thinkinai.xyz/#/download"
}
```

- `version`: version number, format X.Y.Z
- `releaseDate`: release date
- `releaseNotes`: release notes (supports Markdown)
- `githubUrl`: GitHub release page link
- `downloadUrl`: download link
