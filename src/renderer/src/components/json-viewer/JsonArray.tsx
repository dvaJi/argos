import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { JsonValue } from './JsonValue'

interface JsonArrayProps {
  data: unknown[]
}

export const JsonArray: React.FC<JsonArrayProps> = ({ data }) => {
  const [isExpanded, setIsExpanded] = useState(true)

  if (data.length === 0) {
    return <span className="text-xs text-muted-foreground">[ ]</span>
  }

  return (
    <div className="w-full">
      <div className="flex items-center mb-1">
        <button
          className="p-0.5 rounded hover:bg-muted mr-1"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <span className="text-xs text-muted-foreground">{`Array [${data.length}]`}</span>
      </div>

      {isExpanded && (
        <div className="pl-2 border-l border-border/40">
          {data.map((item, index) => (
            <div key={index} className="mb-2">
              <div className="flex flex-wrap items-start gap-2">
                <span className="inline-flex px-2 py-1 min-w-20 max-w-20 truncate rounded-md text-muted-foreground text-xs font-medium leading-6">
                  {String(index)}
                </span>
                <div className="flex-1 py-1 px-2 bg-background border rounded-md">
                  <JsonValue value={item} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
