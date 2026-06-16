import { notarize } from '@electron/notarize'

export default async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  const releaseFlag = process.env.build_for_release
  console.info('releaseFlag', releaseFlag)
  if (!releaseFlag) {
    console.info('Skipping notarization as build_for_release is not set')
    return
  }
  if (electronPlatformName !== 'darwin') {
    return
  }
  console.info('start notarize mac app', appOutDir)
  if (releaseFlag === '2') {
    // Use the preset appid, teamid, and the password from environment variables
    const appleId = process.env.ARGOS_APPLE_NOTARY_USERNAME
    const teamId = process.env.ARGOS_APPLE_NOTARY_TEAM_ID
    const appleIdPassword = process.env.ARGOS_APPLE_NOTARY_PASSWORD

    return await notarize({
      appPath: `${appOutDir}/Argos.app`,
      appleId,
      appleIdPassword,
      teamId
    })
  } else {
    return await notarize({
      appPath: `${appOutDir}/Argos.app`,
      keychainProfile: 'Argos' // replace with your keychain
    })
  }
}
