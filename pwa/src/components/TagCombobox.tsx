import { useState } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface TagComboboxProps {
  existingTags: string[]
  currentTags: string[]
  placeholder: string
  addLabel: string
  onAdd: (tag: string) => void
}

export function TagCombobox({ existingTags, currentTags, placeholder, addLabel, onAdd }: TagComboboxProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')

  const suggestions = existingTags.filter(t => !currentTags.includes(t))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="btn btn-ghost"
          style={{
            width: '100%',
            justifyContent: 'space-between',
            color: 'var(--text-tertiary)',
            fontWeight: 400,
          }}
        >
          {placeholder}
          <ChevronsUpDown size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        style={{
          width: 'var(--radix-popover-trigger-width)',
          padding: 0,
          border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-elevated)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <Command>
          <CommandInput
            placeholder={placeholder}
            value={input}
            onValueChange={setInput}
          />
          <CommandList>
            <CommandEmpty>
              {input.trim() && (
                <button
                  className="btn btn-secondary"
                  style={{
                    margin: 'var(--space-2)',
                    width: 'calc(100% - 16px)',
                  }}
                  onClick={() => {
                    onAdd(input.trim())
                    setInput('')
                    setOpen(false)
                  }}
                >
                  <Plus size={14} /> "{input.trim()}" {addLabel}
                </button>
              )}
            </CommandEmpty>
            {suggestions.length > 0 && (
              <CommandGroup>
                {suggestions
                  .filter(t => t.toLowerCase().includes(input.toLowerCase()))
                  .map(tag => (
                    <CommandItem
                      key={tag}
                      value={tag}
                      onSelect={() => {
                        onAdd(tag)
                        setInput('')
                        setOpen(false)
                      }}
                    >
                      <Check
                        size={14}
                        style={{ opacity: currentTags.includes(tag) ? 1 : 0 }}
                      />
                      {tag}
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
