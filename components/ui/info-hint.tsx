'use client'

import { useState } from 'react'
import { HelpCircle, Info, Lightbulb, AlertCircle } from 'lucide-react'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'

type Variant = 'help' | 'info' | 'tip' | 'warning'

interface InfoHintProps {
  /** Kısa başlık */
  title?: string
  /** Detaylı açıklama (markdown destekler: **kalın**, satır sonu) */
  content: string
  /** Variant - default 'help' */
  variant?: Variant
  /** Örnek değer (kullanıcıya kopyalanabilir gösterilir) */
  example?: string
  /** Class name override */
  className?: string
  /** Icon size, default 14 */
  size?: number
}

const ICONS = {
  help: HelpCircle,
  info: Info,
  tip: Lightbulb,
  warning: AlertCircle,
}

const COLORS = {
  help: 'text-muted-foreground hover:text-foreground',
  info: 'text-blue-500 hover:text-blue-600',
  tip: 'text-yellow-500 hover:text-yellow-600',
  warning: 'text-orange-500 hover:text-orange-600',
}

export function InfoHint({
  title,
  content,
  variant = 'help',
  example,
  className = '',
  size = 14,
}: InfoHintProps) {
  const Icon = ICONS[variant]
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center ${COLORS[variant]} transition-colors cursor-help ${className}`}
          aria-label={title || 'Yardım'}
        >
          <Icon style={{ width: size, height: size }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start">
        {title && (
          <div className="font-semibold mb-2 flex items-center gap-1.5">
            <Icon className={`w-4 h-4 ${COLORS[variant]}`} />
            {title}
          </div>
        )}
        <div
          className="text-muted-foreground space-y-2"
          dangerouslySetInnerHTML={{
            __html: content
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>')
              .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-[12px]">$1</code>')
              .replace(/\n/g, '<br>'),
          }}
        />
        {example && (
          <div className="mt-3 p-2 rounded bg-muted/50 border">
            <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Örnek</p>
            <code className="text-xs font-mono break-all">{example}</code>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
