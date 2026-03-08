import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import type { VersionTags } from '../../preload/index'
import { compareSemver } from '../utils/version'

interface VersionTimelineProps {
  versions: string[]
  fromVersion: string
  toVersion: string
  tags?: VersionTags
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
}

export default function VersionTimeline({
  versions,
  fromVersion,
  toVersion,
  tags,
  onFromChange,
  onToChange
}: VersionTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const dragging = useRef<'from' | 'to' | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Sort versions ascending
  const allSorted = useMemo(() => [...versions].sort(compareSemver), [versions])

  // Determine active major version from from/to selection, fallback to latest
  const activeMajor = useMemo(() => {
    const ref = toVersion || fromVersion
    if (ref) return parseInt(ref.split('.')[0], 10)
    if (allSorted.length > 0) return parseInt(allSorted[allSorted.length - 1].split('.')[0], 10)
    return null
  }, [fromVersion, toVersion, allSorted])

  // Filter to active major only
  const sorted = useMemo(() => {
    if (activeMajor === null) return allSorted
    return allSorted.filter((v) => parseInt(v.split('.')[0], 10) === activeMajor)
  }, [allSorted, activeMajor])

  // Group by major version (should be single group after filtering)
  const groups = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const v of sorted) {
      const major = parseInt(v.split('.')[0], 10)
      if (!map.has(major)) map.set(major, [])
      map.get(major)!.push(v)
    }
    return map
  }, [sorted])

  // In-range calculation
  const inRangeSet = useMemo(() => {
    const set = new Set<string>()
    if (!fromVersion || !toVersion) return set
    const fromIdx = sorted.indexOf(fromVersion)
    const toIdx = sorted.indexOf(toVersion)
    if (fromIdx === -1 || toIdx === -1) return set
    const lo = Math.min(fromIdx, toIdx)
    const hi = Math.max(fromIdx, toIdx)
    for (let i = lo; i <= hi; i++) {
      set.add(sorted[i])
    }
    return set
  }, [sorted, fromVersion, toVersion])

  // Scroll selected nodes into view
  useEffect(() => {
    const target = toVersion || fromVersion
    if (!target) return
    const el = nodeRefs.current.get(target)
    if (el) {
      el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }
  }, [fromVersion, toVersion])

  // Find closest version node to a mouse X position
  const findVersionAtX = useCallback(
    (clientX: number): string | null => {
      let closest: string | null = null
      let closestDist = Infinity
      for (const [v, el] of nodeRefs.current) {
        if (!sorted.includes(v)) continue
        const rect = el.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const dist = Math.abs(clientX - centerX)
        if (dist < closestDist) {
          closestDist = dist
          closest = v
        }
      }
      return closest
    },
    [sorted]
  )

  // Drag handlers
  const handleMouseDown = useCallback(
    (version: string, e: React.MouseEvent) => {
      if (version === fromVersion) {
        dragging.current = 'from'
      } else if (version === toVersion) {
        dragging.current = 'to'
      } else {
        return // only drag from/to nodes
      }
      e.preventDefault()
      setIsDragging(true)
    },
    [fromVersion, toVersion]
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const v = findVersionAtX(e.clientX)
      if (!v) return
      if (dragging.current === 'from' && v !== fromVersion && v !== toVersion) {
        onFromChange(v)
      } else if (dragging.current === 'to' && v !== toVersion && v !== fromVersion) {
        onToChange(v)
      }
    }

    const handleMouseUp = () => {
      dragging.current = null
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, fromVersion, toVersion, findVersionAtX, onFromChange, onToChange])

  const handleClick = useCallback(
    (version: string) => {
      if (isDragging) return // don't click during drag

      // Same node click → deselect
      if (version === fromVersion) {
        onFromChange('')
        return
      }
      if (version === toVersion) {
        onToChange('')
        return
      }

      // Both empty → set from
      if (!fromVersion && !toVersion) {
        onFromChange(version)
        return
      }

      // Only from set → set to
      if (fromVersion && !toVersion) {
        onToChange(version)
        return
      }

      // Only to set → set from
      if (!fromVersion && toVersion) {
        onFromChange(version)
        return
      }

      // Both set → replace closer one
      const idx = sorted.indexOf(version)
      const fromIdx = sorted.indexOf(fromVersion)
      const toIdx = sorted.indexOf(toVersion)
      if (Math.abs(idx - fromIdx) <= Math.abs(idx - toIdx)) {
        onFromChange(version)
      } else {
        onToChange(version)
      }
    },
    [isDragging, fromVersion, toVersion, sorted, onFromChange, onToChange]
  )

  // Latest version per environment, filtered to active major
  const envVersions = useMemo(() => {
    if (!tags) return null
    const latest = (arr: unknown) => {
      if (!Array.isArray(arr) || arr.length === 0) return null
      let filtered = arr as string[]
      if (activeMajor !== null) {
        filtered = filtered.filter((v) => parseInt(v.split('.')[0], 10) === activeMajor)
      }
      if (filtered.length === 0) return null
      return [...filtered].sort(compareSemver).pop() as string
    }
    const result = {
      staging: latest(tags.staging),
      production: latest(tags.production),
      stable: latest(tags.stable)
    }
    return result.staging || result.production || result.stable ? result : null
  }, [tags, activeMajor])

  const groupEntries = Array.from(groups.entries())

  return (
    <div className={`version-timeline${isDragging ? ' dragging' : ''}`}>
      {envVersions && (
        <div className="version-timeline-env">
          {envVersions.staging && <span className="version-env-item env-staging">Staging: v{envVersions.staging}</span>}
          {envVersions.production && (
            <span className="version-env-item env-production">Production: v{envVersions.production}</span>
          )}
          {envVersions.stable && <span className="version-env-item env-stable">Stable: v{envVersions.stable}</span>}
        </div>
      )}
      <div className="version-timeline-scroll" ref={scrollRef}>
        <div className="version-timeline-track">
          {groupEntries.map(([major, groupVersions], gi) => (
            <React.Fragment key={major}>
              {gi > 0 && <div className="version-timeline-separator" />}
              <div className="version-timeline-group">
                <div className="version-timeline-group-label">{major}.x</div>
                <div className="version-timeline-group-nodes">
                  {groupVersions.map((v, vi) => {
                    const isFrom = v === fromVersion
                    const isTo = v === toVersion
                    const isInRange = inRangeSet.has(v) && !isFrom && !isTo
                    return (
                      <div
                        key={v}
                        className="version-timeline-item"
                        ref={(el) => {
                          if (el) nodeRefs.current.set(v, el)
                        }}
                        onClick={() => handleClick(v)}
                        onMouseDown={(e) => handleMouseDown(v, e)}
                        title={`v${v}`}
                      >
                        {vi > 0 && (
                          <div
                            className={`version-timeline-line${inRangeSet.has(groupVersions[vi - 1]) && inRangeSet.has(v) ? ' in-range' : ''}`}
                          />
                        )}
                        <div
                          className={`version-node${isFrom ? ' selected-from' : ''}${isTo ? ' selected-to' : ''}${isInRange ? ' in-range' : ''}`}
                        >
                          <div className="version-node-dot" />
                          {(isFrom || isTo) && <span className="version-node-role">{isFrom ? 'FROM' : 'TO'}</span>}
                        </div>
                        <div className="version-label">v{v}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
