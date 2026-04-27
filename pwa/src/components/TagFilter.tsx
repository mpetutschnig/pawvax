import React, { useState } from 'react'
import { X } from 'lucide-react'

interface TagFilterProps {
  selectedTags: string[]
  onTagsChange: (tags: string[]) => void
  availableTags: Array<{ id: string; name: string }>
  placeholder?: string
}

export function TagFilter({
  selectedTags,
  onTagsChange,
  availableTags,
  placeholder = 'Filter by tags...'
}: TagFilterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = availableTags.filter(tag =>
    tag.name.toLowerCase().includes(search.toLowerCase())
  )

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      onTagsChange(selectedTags.filter(t => t !== tagId))
    } else {
      onTagsChange([...selectedTags, tagId])
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
        padding: 'var(--space-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--surface)',
        cursor: 'pointer',
        minHeight: '40px',
        alignItems: 'center'
      }}
        onClick={() => setOpen(!open)}
      >
        {selectedTags.length === 0 ? (
          <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
            {placeholder}
          </span>
        ) : (
          selectedTags.map(tagId => {
            const tag = availableTags.find(t => t.id === tagId)
            return (
              <div
                key={tagId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  padding: '2px 8px',
                  backgroundColor: 'var(--primary-100)',
                  color: 'var(--primary-700)',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 500
                }}
              >
                {tag?.name || tagId}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleTag(tagId)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: 'inherit',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )
          })
        )}
      </div>

      {open && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50
            }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 'var(--space-2)',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            zIndex: 51,
            maxHeight: '300px',
            overflow: 'auto',
            boxShadow: 'var(--shadow-md)'
          }}>
            <input
              type="text"
              placeholder="Search tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: 'var(--space-2)',
                border: 'none',
                borderBottom: '1px solid var(--border-subtle)',
                fontSize: 'var(--font-size-sm)',
                backgroundColor: 'transparent',
                boxSizing: 'border-box'
              }}
            />
            {filtered.map(tag => (
              <label
                key={tag.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-subtle)',
                  backgroundColor: selectedTags.includes(tag.id) ? 'var(--surface)' : 'transparent',
                  transition: 'background var(--t-fast)'
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag.id)}
                  onChange={() => toggleTag(tag.id)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: 'var(--font-size-sm)' }}>{tag.name}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
