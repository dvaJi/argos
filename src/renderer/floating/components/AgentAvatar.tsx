import React, { useMemo } from 'react'
import type { FloatingWidgetSessionAgent } from '@shared/types/floating-widget'
import deepchatLogo from '../../src/assets/logo.png'

interface AgentAvatarProps {
  agent: FloatingWidgetSessionAgent
  className?: string
  fallbackClassName?: string
  theme?: 'dark' | 'light'
}

export default function AgentAvatar({
  agent,
  className = 'h-4 w-4',
  fallbackClassName = 'rounded-md',
  theme
}: AgentAvatarProps) {
  const isDarkTheme = theme ? theme === 'dark' : true

  const initials = useMemo(() => {
    const name = agent.name.trim()
    if (!name) return '?'
    const latin = name.match(/[A-Za-z]/g)
    if (latin && latin.length > 0) {
      return latin.slice(0, 2).join('').toUpperCase()
    }
    return name.slice(0, 1)
  }, [agent.name])

  const monogramBackground =
    agent.avatar?.kind === 'monogram' ? agent.avatar.backgroundColor : undefined

  const lucideColor = useMemo(() => {
    if (agent.avatar?.kind !== 'lucide') return undefined
    return isDarkTheme ? agent.avatar.darkColor : agent.avatar.lightColor
  }, [agent.avatar, isDarkTheme])

  const showBuiltinDeepChatLogo = agent.id === 'deepchat' && !agent.avatar && !agent.icon

  const showAcpIcon = agent.type === 'acp' && Boolean(agent.icon?.trim())

  const showImageIcon =
    Boolean(agent.icon?.trim()) &&
    !showBuiltinDeepChatLogo &&
    !showAcpIcon &&
    agent.avatar?.kind !== 'lucide'

  if (showAcpIcon) {
    return <img src={agent.icon} alt={agent.name} className={`object-contain ${className}`} />
  }

  if (showBuiltinDeepChatLogo || showImageIcon) {
    return (
      <img
        src={showBuiltinDeepChatLogo ? deepchatLogo : agent.icon}
        alt={agent.name}
        className={`object-contain ${className}`}
      />
    )
  }

  if (agent.avatar?.kind === 'lucide') {
    return (
      <span
        className={`inline-flex items-center justify-center text-foreground ${className} ${fallbackClassName}`}
        style={lucideColor ? { color: lucideColor } : undefined}
      >
        <span className={`h-full w-full ${className}`}>{agent.avatar.icon}</span>
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center justify-center bg-muted/70 text-[0.72em] font-semibold text-foreground ${className} ${fallbackClassName}`}
      style={monogramBackground ? { backgroundColor: monogramBackground } : undefined}
    >
      {agent.avatar?.kind === 'monogram' ? agent.avatar.text : initials}
    </span>
  )
}
