import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@shadcn/components/ui/button'
import { Badge } from '@shadcn/components/ui/badge'
import { ScrollArea } from '@shadcn/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@shadcn/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@shadcn/components/ui/select'
import { useMcpStore } from '@/stores/mcp'

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}

import McpJsonViewer from './McpJsonViewer'
import type { MCPToolDefinition } from '@shared/presenter'

interface McpToolPanelProps {
  serverName: string
  open: boolean
  onOpenChange: (value: boolean) => void
}

export const McpToolPanel: React.FC<McpToolPanelProps> = ({ serverName, open, onOpenChange }) => {
  const mcpStore = useMcpStore()

  const [selectedTool, setSelectedTool] = useState<MCPToolDefinition | null>(null)
  const [selectedToolName, setSelectedToolName] = useState('')
  const [localToolInputs, setLocalToolInputs] = useState<Record<string, string>>({})
  const [localToolResults, setLocalToolResults] = useState<Record<string, string>>({})
  const [jsonError, setJsonError] = useState<Record<string, boolean>>({})
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const [isParametersExpanded, setIsParametersExpanded] = useState(false)

  const serverTools = useMemo(
    () => mcpStore.tools.filter((tool) => tool.server.name === serverName),
    [mcpStore.tools, serverName]
  )

  const isLgScreen = useMediaQuery('(min-width: 1024px)')
  const showTopSelector = useMemo(
    () => !isLgScreen.value || serverTools.length === 0,
    [isLgScreen.value, serverTools.length]
  )

  useEffect(() => {
    if (open) setSelectedToolName('')
  }, [open])

  useEffect(() => {
    if (selectedToolName) {
      const tool = serverTools.find((t) => t.function.name === selectedToolName)
      setSelectedTool(tool || null)
      if (!localToolInputs[selectedToolName]) {
        setLocalToolInputs((prev) => ({ ...prev, [selectedToolName]: '{}' }))
      }
      setJsonError((prev) => ({ ...prev, [selectedToolName]: false }))
      setIsDescriptionExpanded(false)
      setIsParametersExpanded(false)
    } else {
      setSelectedTool(null)
    }
  }, [selectedToolName])

  const validateJson = (input: string, toolName: string): boolean => {
    try {
      JSON.parse(input)
      setJsonError((prev) => ({ ...prev, [toolName]: false }))
      return true
    } catch {
      setJsonError((prev) => ({ ...prev, [toolName]: true }))
      return false
    }
  }

  const callTool = async (toolName: string) => {
    if (!validateJson(localToolInputs[toolName], toolName)) return
    try {
      const params = JSON.parse(localToolInputs[toolName])
      mcpStore.toolInputs[toolName] = params
      const result = await mcpStore.callTool(toolName)
      if (result) {
        setLocalToolResults((prev) => ({ ...prev, [toolName]: result.content || '' }))
      }
      return result
    } catch (error) {
      console.error('Tool call error:', error)
      setLocalToolResults((prev) => ({ ...prev, [toolName]: String(error) }))
    }
  }

  const formatToolInput = (toolName: string) => {
    try {
      const formatted = JSON.stringify(JSON.parse(localToolInputs[toolName]), null, 2)
      setLocalToolInputs((prev) => ({ ...prev, [toolName]: formatted }))
    } catch {}
  }

  const toolParametersDescription = useMemo(() => {
    if (!selectedTool?.function.parameters?.properties) return []
    const properties = selectedTool.function.parameters.properties
    const required = selectedTool.function.parameters.required || []
    return Object.entries(properties).map(([key, prop]) => ({
      name: key,
      description: prop.description || '',
      type: prop.enum
        ? 'enum'
        : prop.type === 'array' && prop.items?.enum
          ? 'array[enum]'
          : prop.type || 'unknown',
      originalType: prop.type || 'unknown',
      required: required.includes(key),
      annotations: prop.annotations,
      enum: prop.enum || null,
      items: prop.items || null
    }))
  }, [selectedTool])

  const selectTool = (tool: MCPToolDefinition) => {
    setSelectedToolName(tool.function.name)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-4/5 min-w-[80vw] max-w-[80vw] p-0 bg-white dark:bg-black h-screen flex flex-col gap-0"
      >
        <SheetHeader className="px-4 py-3 border-b bg-card shrink-0 window-no-drag-region">
          <SheetTitle className="flex items-center space-x-2">
            <Icon icon="lucide:wrench" className="h-5 w-5 text-primary" />
            <span>Tools - {serverName}</span>
          </SheetTitle>
          <SheetDescription>Debug and test MCP tools</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          {showTopSelector && (
            <div className="shrink-0 px-4 py-4">
              <Select value={selectedToolName} onValueChange={setSelectedToolName}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a tool to debug" />
                </SelectTrigger>
                <SelectContent>
                  {serverTools.map((tool) => (
                    <SelectItem key={tool.function.name} value={tool.function.name}>
                      <div className="flex items-center space-x-2">
                        <Icon icon="lucide:function-square" className="h-3 w-3 text-primary" />
                        <span>{tool.function.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden min-h-0">
            {!showTopSelector && (
              <div className="flex w-1/3 border-r flex-col">
                <div className="p-4 border-b shrink-0">
                  <h3 className="text-sm font-medium text-foreground">Tool List</h3>
                </div>
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-2 space-y-1">
                    {serverTools.map((tool) => (
                      <Button
                        key={tool.function.name}
                        variant="ghost"
                        className={[
                          'w-full justify-start h-auto p-3 text-left',
                          selectedToolName === tool.function.name
                            ? 'bg-accent text-accent-foreground'
                            : ''
                        ].join(' ')}
                        onClick={() => selectTool(tool)}
                      >
                        <div className="flex items-start space-x-2 w-full">
                          <Icon
                            icon="lucide:function-square"
                            className="h-4 w-4 text-primary mt-0.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{tool.function.name}</div>
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            <div className="flex-1 flex flex-col overflow-hidden lg:w-2/3 min-h-0">
              {!selectedTool && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="mx-auto w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center mb-3">
                      <Icon
                        icon="lucide:mouse-pointer-click"
                        className="h-5 w-5 text-muted-foreground"
                      />
                    </div>
                    <h3 className="text-base font-medium text-foreground mb-2">
                      Select a tool to debug
                    </h3>
                  </div>
                </div>
              )}

              {selectedTool && (
                <div className="h-full flex flex-col overflow-hidden min-h-0">
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="px-4 py-4 space-y-4 pb-8">
                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <Icon icon="lucide:function-square" className="h-5 w-5 text-primary" />
                          <h2 className="text-lg font-semibold">Function Description</h2>
                        </div>
                        <p className="text-sm text-secondary-foreground">
                          {selectedTool.function.description || selectedTool.function.name}
                        </p>
                      </div>

                      {toolParametersDescription.length > 0 && (
                        <div className="border rounded-lg">
                          <Button
                            variant="ghost"
                            className="w-full justify-between p-3 h-auto"
                            onClick={() => setIsParametersExpanded(!isParametersExpanded)}
                          >
                            <span className="font-medium">
                              Parameters ({toolParametersDescription.length})
                            </span>
                            <Icon
                              icon={
                                isParametersExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'
                              }
                              className="h-4 w-4"
                            />
                          </Button>
                          {isParametersExpanded && (
                            <div className="px-3 pb-3 space-y-2">
                              {toolParametersDescription.map((param) => (
                                <div
                                  key={param.name}
                                  className="p-2 bg-muted/30 rounded-md border border-border/30"
                                >
                                  <div className="flex items-center space-x-1 mb-1">
                                    <code className="text-xs font-mono font-medium text-foreground">
                                      {param.name}
                                    </code>
                                    {param.required && (
                                      <Badge variant="destructive" className="text-xs px-1 py-0">
                                        Required
                                      </Badge>
                                    )}
                                    <Badge
                                      variant={
                                        param.type === 'enum' || param.type === 'array[enum]'
                                          ? 'default'
                                          : 'outline'
                                      }
                                      className={[
                                        'text-xs px-1 py-0',
                                        param.type === 'enum' || param.type === 'array[enum]'
                                          ? 'bg-blue-500 text-white'
                                          : ''
                                      ].join(' ')}
                                    >
                                      {param.type === 'enum'
                                        ? `enum(${param.originalType})`
                                        : param.type === 'array[enum]'
                                          ? `array[enum(${param.items?.type || 'string'})]`
                                          : param.type}
                                    </Badge>
                                  </div>
                                  {param.description && (
                                    <p className="text-xs text-muted-foreground">
                                      {param.description}
                                    </p>
                                  )}
                                  {param.enum && param.enum.length > 0 && (
                                    <div className="mt-1">
                                      <p className="text-xs font-medium text-foreground mb-1">
                                        Allowed values:
                                      </p>
                                      <div className="flex flex-wrap gap-1">
                                        {param.enum.map((enumValue) => (
                                          <Badge
                                            key={enumValue}
                                            variant="secondary"
                                            className="text-xs px-1.5 py-0.5 font-mono"
                                          >
                                            {enumValue}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium text-foreground">Input</h3>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => formatToolInput(selectedTool.function.name)}
                          >
                            <Icon icon="lucide:align-left" className="mr-1 h-3 w-3" />
                            Format
                          </Button>
                        </div>

                        <div className="relative">
                          <textarea
                            value={localToolInputs[selectedTool.function.name] || '{}'}
                            onChange={(e) => {
                              const val = e.target.value
                              setLocalToolInputs((prev) => ({
                                ...prev,
                                [selectedTool.function.name]: val
                              }))
                              validateJson(val, selectedTool.function.name)
                            }}
                            className={[
                              'flex h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                              jsonError[selectedTool.function.name] ? 'border-destructive' : ''
                            ].join(' ')}
                            placeholder="{}"
                          />
                          {jsonError[selectedTool.function.name] && (
                            <div className="absolute right-3 top-3 text-xs text-destructive">
                              Invalid JSON
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Enter JSON parameters for the tool
                        </p>

                        <Button
                          className="w-full"
                          disabled={
                            mcpStore.toolLoadingStates[selectedTool.function.name] ||
                            jsonError[selectedTool.function.name]
                          }
                          onClick={() => callTool(selectedTool.function.name)}
                        >
                          {mcpStore.toolLoadingStates[selectedTool.function.name] ? (
                            <Icon icon="lucide:loader" className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Icon icon="lucide:play" className="mr-2 h-4 w-4" />
                          )}
                          {mcpStore.toolLoadingStates[selectedTool.function.name]
                            ? 'Running...'
                            : 'Execute'}
                        </Button>
                      </div>

                      {localToolResults[selectedTool.function.name] && (
                        <McpJsonViewer
                          content={localToolResults[selectedTool.function.name]}
                          title="Result"
                          readonly
                        />
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default McpToolPanel
