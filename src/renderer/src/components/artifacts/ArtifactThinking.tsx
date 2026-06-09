import React, { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { createConfigClient } from '@api/ConfigClient'

export function ArtifactThinking() {
  const configClient = createConfigClient()
  const [collapse, setCollapse] = useState(false)

  useEffect(() => {
    configClient.getSetting('artifact_think_collapse').then((val) => {
      setCollapse(Boolean(val))
    })
  }, [])

  useEffect(() => {
    void configClient.setSetting('artifact_think_collapse', collapse)
  }, [collapse])

  return (
    <div className="text-xs text-muted-foreground rounded-lg flex flex-row gap-2 px-2 py-2">
      <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" />
      Generating artifact...
    </div>
  )
}
