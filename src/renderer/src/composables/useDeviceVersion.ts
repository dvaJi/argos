import { useState, useEffect } from 'react'

import { createDeviceClient } from '@api/DeviceClient'

export function useDeviceVersion() {
  const [isWinMacOS, setIsWinMacOS] = useState(false)
  const [isMacOS, setIsMacOS] = useState(false)

  useEffect(() => {
    const deviceClient = createDeviceClient()
    deviceClient.getDeviceInfo().then((deviceInfo) => {
      const isMacOSPlatform = deviceInfo.platform === 'darwin'
      setIsMacOS(isMacOSPlatform)

      let isWin11Plus = false
      if (deviceInfo.platform === 'win32') {
        const buildNumber = parseInt(deviceInfo.osVersion.split('.')[2] || '0', 10)
        const win11Metadata = deviceInfo.osVersionMetadata.find((v) => v.name === 'Windows 11')
        isWin11Plus = win11Metadata ? buildNumber >= win11Metadata.build : false
      }

      setIsWinMacOS(isMacOSPlatform || isWin11Plus)
    })
  }, [])

  return {
    isWinMacOS,
    isMacOS
  }
}
