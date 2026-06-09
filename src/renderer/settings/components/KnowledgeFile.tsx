import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@shadcn/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shadcn/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@shadcn/components/ui/tooltip'
import { toast } from '@/components/use-toast'
import { ScrollArea } from '@shadcn/components/ui/scroll-area'
import { Input } from '@shadcn/components/ui/input'
import { useLegacyPresenter } from '@api/legacy/presenters'
import KnowledgeFileItem from './KnowledgeFileItem'
import type { BuiltinKnowledgeConfig, KnowledgeFileMessage } from '@shared/presenter'
import { RAG_EVENTS } from '@/events'

interface KnowledgeFileProps {
  builtinKnowledgeDetail: BuiltinKnowledgeConfig
  onHideKnowledgeFile: () => void
}

export default function KnowledgeFile({
  builtinKnowledgeDetail,
  onHideKnowledgeFile
}: KnowledgeFileProps) {
  const knowledgePresenter = useLegacyPresenter('knowledgePresenter')
  const [fileList, setFileList] = useState<KnowledgeFileMessage[]>([])
  const [acceptExts, setAcceptExts] = useState<string[]>([])
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchKey, setSearchKey] = useState('')
  const [searchResult, setSearchResult] = useState<any[]>([])
  const [copyId, setCopyId] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const defaultSupported = ['txt', 'md', 'markdown', 'docx', 'pptx', 'pdf']

  const ctrlBtn = useMemo(() => {
    if (fileList.length > 0) {
      if (fileList.find((f) => f.status === 'processing')) return 'processing'
      if (fileList.find((f) => f.status === 'paused')) return 'paused'
    }
    return null
  }, [fileList])

  const loadList = useCallback(async () => {
    const list = (await knowledgePresenter.listFiles(builtinKnowledgeDetail.id)) || []
    setFileList(list)
  }, [knowledgePresenter, builtinKnowledgeDetail.id])

  const loadSupportedExtensions = useCallback(async () => {
    try {
      const extensions = await knowledgePresenter.getSupportedFileExtensions()
      const uniqueExts = extensions.filter((ext: string) => !defaultSupported.includes(ext))
      setAcceptExts([...defaultSupported, ...uniqueExts])
    } catch {
      setAcceptExts([...defaultSupported])
    }
  }, [knowledgePresenter])

  const toggleStatus = async (run: boolean) => {
    if (run) {
      await knowledgePresenter.resumeAllPausedTasks(builtinKnowledgeDetail.id)
    } else {
      await knowledgePresenter.pauseAllRunningTasks(builtinKnowledgeDetail.id)
    }
    loadList()
  }

  const handleFileUpload = async (files: File[]) => {
    for (const file of files) {
      try {
        const path = window.api.getPathForFile(file)
        const validationResult = await knowledgePresenter.validateFile(path)
        if (!validationResult.isSupported) {
          toast({
            title: `"${file.name}" upload error`,
            description: validationResult.error,
            variant: 'destructive',
            duration: 3000
          })
          continue
        }
        const result = await knowledgePresenter.addFile(builtinKnowledgeDetail.id, path)
        if (result.error) {
          toast({
            title: `${file.name} upload error`,
            description: result.error,
            variant: 'destructive',
            duration: 3000
          })
          continue
        }
        if (result.data) {
          const existing = fileList.find((f) => f.id === result.data.id)
          if (!existing) {
            setFileList((prev) => [result.data, ...prev])
          }
        }
      } catch (error) {
        toast({
          title: `${file.name} upload error`,
          description: (error as Error).message,
          variant: 'destructive',
          duration: 3000
        })
      }
    }
  }

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      await handleFileUpload(Array.from(files))
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      await handleFileUpload(Array.from(e.dataTransfer.files))
    }
  }

  const deleteFile = async (fileId: string) => {
    await knowledgePresenter.deleteFile(builtinKnowledgeDetail.id, fileId)
    toast({ title: 'Deleted successfully', duration: 3000 })
    loadList()
  }

  const reAddFile = async (file: KnowledgeFileMessage) => {
    const result = await knowledgePresenter.reAddFile(builtinKnowledgeDetail.id, file.id)
    setFileList((prev) => prev.map((f) => (f.id === file.id ? { ...f, status: 'processing' } : f)))
    if (result.error) {
      toast({
        title: `${file.name} upload error`,
        description: result.error,
        variant: 'destructive',
        duration: 3000
      })
    }
  }

  const handleSearch = async () => {
    if (!searchKey) return
    setCopyId('')
    setLoading(true)
    try {
      const res = await knowledgePresenter.similarityQuery(builtinKnowledgeDetail.id, searchKey)
      setSearchResult(res || [])
    } catch {
      toast({ title: 'Search failed', variant: 'destructive', duration: 3000 })
      setSearchResult([])
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (content: string, id: string) => {
    setCopyId(id)
    window.api.copyText(content)
  }

  const openSearchDialog = () => {
    setIsSearchDialogOpen(true)
    setSearchKey('')
    setSearchResult([])
    setCopyId('')
    setLoading(false)
  }

  useEffect(() => {
    Promise.all([loadList(), loadSupportedExtensions()])
    const handler = (_: unknown, data: any) => {
      setFileList((prev) => prev.map((f) => (f.id === data.id ? { ...f, ...data } : f)))
    }
    window.electron?.ipcRenderer.on(RAG_EVENTS.FILE_UPDATED, handler)
    return () => {
      window.electron?.ipcRenderer?.removeAllListeners(RAG_EVENTS.FILE_UPDATED)
    }
  }, [])

  return (
    <div className="w-full h-full flex flex-col gap-1.5 p-2">
      <div className="flex flex-row justify-between items-center gap-2">
        <div className="flex flex-row items-center gap-2">
          <ReactIcon icon="lucide:book-marked" className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-bold">
            {builtinKnowledgeDetail.description}
            <span className="text-xs px-2 py-0.5 rounded-md ml-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
              {builtinKnowledgeDetail.embedding.modelId}
            </span>
          </span>
        </div>
        <div className="flex flex-row gap-2 shrink-0">
          {ctrlBtn === 'paused' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleStatus(true)}
              title="Resume all paused tasks"
            >
              <ReactIcon icon="lucide:play" className="w-4 h-4 text-green-500" />
            </Button>
          )}
          {ctrlBtn === 'processing' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleStatus(false)}
              title="Pause all running tasks"
            >
              <ReactIcon icon="lucide:pause" className="w-4 h-4 text-yellow-500" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={openSearchDialog}>
            <ReactIcon icon="lucide:search" className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onHideKnowledgeFile}>
            <ReactIcon icon="lucide:corner-down-left" className="w-4 h-4" />
            Back
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg px-4 pb-2">
        <div className="text-sm p-2">
          Files
          <span className="text-xs px-2 py-0.5 rounded-md ml-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            {fileList.length}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="upload">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                handleDrop(e)
              }}
              className="h-20 border border-border rounded-lg text-muted-foreground hover:bg-muted/0 transition-colors"
            >
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <div className="flex items-center gap-1">
                  <ReactIcon icon="lucide:file-up" className="w-4 h-4" />
                  <span className="text-sm">Drag files here or click to upload</span>
                </div>
                <div className="flex items-center gap-1">
                  <ReactIcon icon="lucide:clipboard" className="w-4 h-4" />
                  <span className="text-sm" title={acceptExts.join(', ')}>
                    Supports: {acceptExts.slice(0, 5).join(', ')} ({acceptExts.length} types)
                  </span>
                </div>
              </div>
            </div>
          </label>
          <input
            ref={fileInputRef}
            multiple
            type="file"
            id="upload"
            onChange={handleChange}
            accept={acceptExts.map((ext) => '.' + ext).join(',')}
            className="hidden"
          />
          {fileList.map((file) => (
            <KnowledgeFileItem
              key={file.id}
              file={file}
              onDelete={() => deleteFile(file.id)}
              onReAdd={() => reAddFile(file)}
            />
          ))}
        </div>
      </div>

      <Dialog open={isSearchDialogOpen} onOpenChange={setIsSearchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Search Knowledge Base</DialogTitle>
          </DialogHeader>
          <div className="flex w-full items-center gap-1 relative">
            <Input
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
              placeholder="Enter search query"
            />
            {searchKey && (
              <Button
                size="sm"
                variant="ghost"
                className="absolute right-16 text-xs text-muted-foreground rounded-full w-6 h-6 flex items-center justify-center hover:bg-zinc-200"
                onClick={() => setSearchKey('')}
              >
                <ReactIcon icon="lucide:x" className="w-4 h-4 text-muted-foreground" />
              </Button>
            )}
            <Button onClick={handleSearch}>
              <ReactIcon icon="lucide:search" className="w-4 h-4" />
            </Button>
          </div>
          <ScrollArea className="max-h-[calc(100vh-200px)]">
            <div className="relative min-h-[180px]">
              {loading && (
                <div className="absolute h-full w-full flex items-center justify-center">
                  <div className="text-center">
                    <ReactIcon
                      icon="lucide:loader"
                      className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">Loading...</p>
                  </div>
                </div>
              )}
              {searchResult.length > 0 &&
                searchResult.map((item: any) => (
                  <div
                    key={item.id}
                    className="relative px-6 py-4 mt-2 bg-card border border-border rounded-sm bg-secondary"
                  >
                    <div className="absolute right-10 top-1 text-xs text-white p-1 rounded-sm bg-primary-600">
                      score:{(item.distance * 100).toFixed(2) + '%'}
                    </div>
                    <TooltipProvider>
                      <Tooltip delayDuration={200}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-2 top-1 h-6 w-6 flex items-center justify-center rounded-sm hover:bg-primary/80 hover:text-white transition-colors"
                            onClick={() => handleCopy(item.metadata.content, item.id)}
                          >
                            <ReactIcon icon={copyId === item.id ? 'lucide:check' : 'lucide:copy'} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{copyId === item.id ? 'Copied' : 'Copy'}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <div className="text-xs">{item.metadata.content}</div>
                    <div className="border-t border-gray-300 pt-2 mt-2 text-xs text-muted-foreground">
                      Source: {item.metadata.from}
                    </div>
                  </div>
                ))}
              {searchResult.length === 0 && !loading && (
                <div className="text-center text-muted-foreground py-12">
                  <ReactIcon
                    icon="lucide:book-open-text"
                    className="w-12 h-12 mx-auto mb-4 opacity-50"
                  />
                  <p className="text-sm mt-1">No data</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
