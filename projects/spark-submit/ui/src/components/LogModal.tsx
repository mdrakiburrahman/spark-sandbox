'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Dismiss24Regular, Search20Regular, ArrowUp16Regular, ArrowDown16Regular, Dismiss16Regular } from '@fluentui/react-icons'

interface LogModalProps {
    isOpen: boolean
    onClose: () => void
    jobName: string
    output: string
    error: string
    isDark: boolean
}

export default function LogModal({ isOpen, onClose, jobName, output, error, isDark }: LogModalProps) {
    const outputRef = useRef<HTMLPreElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

    const logContent = useMemo(() => {
        if (output && error) return output + '\n\n━━━ stderr ━━━\n\n' + error
        return output || error || 'No output yet. Run the job to see output here.'
    }, [output, error])

    // Compute match count for current search (uses exec loop to avoid allocating full match array)
    const matchCount = useMemo(() => {
        if (!searchTerm) return 0
        try {
            const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const regex = new RegExp(escaped, 'gi')
            let count = 0
            while (regex.exec(logContent) !== null) {
                count++
            }
            return count
        } catch {
            return 0
        }
    }, [searchTerm, logContent])

    // Reset match index when search changes or count changes
    useEffect(() => {
        if (currentMatchIndex !== 0) {
            setCurrentMatchIndex(0)
        }
    }, [searchTerm, matchCount, currentMatchIndex])

    // Scroll to current highlighted match
    const scrollToMatch = useCallback((index: number) => {
        if (!outputRef.current) return
        const marks = outputRef.current.querySelectorAll('mark[data-search-match]')
        if (marks.length === 0) return
        const clamped = Math.max(0, Math.min(index, marks.length - 1))

        // Remove "current" styling from all, apply to target
        marks.forEach((m, i) => {
            const el = m as HTMLElement
            if (i === clamped) {
                el.style.outline = '2px solid #FF6600'
                el.style.outlineOffset = '1px'
                el.scrollIntoView({ block: 'center', inline: 'nearest' })
            } else {
                el.style.outline = 'none'
                el.style.outlineOffset = '0'
            }
        })
    }, [])

    // Scroll to match whenever currentMatchIndex changes
    useEffect(() => {
        if (matchCount > 0) {
            // Small delay to let React render the marks
            const t = setTimeout(() => scrollToMatch(currentMatchIndex), 0)
            return () => clearTimeout(t)
        }
    }, [currentMatchIndex, matchCount, scrollToMatch, logContent])

    const goToNextMatch = useCallback(() => {
        if (matchCount === 0) return
        setCurrentMatchIndex((prev) => (prev + 1) % matchCount)
    }, [matchCount])

    const goToPrevMatch = useCallback(() => {
        if (matchCount === 0) return
        setCurrentMatchIndex((prev) => (prev - 1 + matchCount) % matchCount)
    }, [matchCount])

    const clearSearch = useCallback(() => {
        setSearchTerm('')
        setCurrentMatchIndex(0)
    }, [])

    // Build highlighted content
    const highlightedContent = useMemo(() => {
        if (!searchTerm) return logContent
        try {
            const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const regex = new RegExp(`(${escaped})`, 'gi')
            const parts = logContent.split(regex)
            let matchIdx = 0
            return parts.map((part, i) => {
                if (regex.test(part)) {
                    regex.lastIndex = 0 // reset since we use .test
                    const idx = matchIdx++
                    return (
                        <mark
                            key={i}
                            data-search-match=""
                            style={{
                                background: '#FFE500',
                                color: '#000000',
                                fontWeight: 700,
                                borderRadius: '2px',
                                padding: '0 1px',
                            }}
                        >
                            {part}
                        </mark>
                    )
                }
                return part
            })
        } catch {
            return logContent
        }
    }, [searchTerm, logContent])

    // Auto-scroll to bottom when output changes (only when not searching)
    useEffect(() => {
        if (outputRef.current && !searchTerm) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight
        }
    }, [output, error, searchTerm])

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (searchTerm) {
                    clearSearch()
                } else {
                    onClose()
                }
            }
            // Ctrl/Cmd+F to focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault()
                searchInputRef.current?.focus()
            }
            // Enter to go to next match, Shift+Enter for previous
            if (e.key === 'Enter' && document.activeElement === searchInputRef.current) {
                e.preventDefault()
                if (e.shiftKey) {
                    goToPrevMatch()
                } else {
                    goToNextMatch()
                }
            }
        }

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown)
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [isOpen, onClose, searchTerm, clearSearch, goToNextMatch, goToPrevMatch])

    // Reset search when modal closes
    useEffect(() => {
        if (!isOpen) {
            setSearchTerm('')
            setCurrentMatchIndex(0)
        }
    }, [isOpen])

    if (!isOpen) return null

    return createPortal(
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(4px)',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '96vw',
                    height: '94vh',
                    maxWidth: 'none',
                    maxHeight: 'none',
                    background: isDark ? 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)' : 'linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%)',
                    borderRadius: '16px',
                    border: `2px solid ${isDark ? 'rgba(249, 115, 22, 0.4)' : 'rgba(249, 115, 22, 0.6)'}`,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(249, 115, 22, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 24px',
                        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        background: isDark ? 'rgba(249, 115, 22, 0.1)' : 'rgba(249, 115, 22, 0.05)',
                    }}
                >
                    <div>
                        <h2
                            style={{
                                margin: 0,
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '18px',
                                fontWeight: 700,
                                color: isDark ? '#ffffff' : '#242424',
                            }}
                        >
                            📋 Logs: {jobName}
                        </h2>
                        <p
                            style={{
                                margin: '4px 0 0 0',
                                fontSize: '12px',
                                color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                            }}
                        >
                            Press ESC or click outside to close · Ctrl+F to search
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '40px',
                            height: '40px',
                            borderRadius: '8px',
                            border: 'none',
                            background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            color: isDark ? '#ffffff' : '#242424',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                        title="Close (ESC)"
                    >
                        <Dismiss24Regular />
                    </button>
                </div>

                {/* Search bar */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 24px',
                        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                        background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                    }}
                >
                    <Search20Regular style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', flexShrink: 0 }} />
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search logs..."
                        style={{
                            flex: 1,
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
                            background: isDark ? 'rgba(0,0,0,0.3)' : '#ffffff',
                            color: isDark ? '#ffffff' : '#242424',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '13px',
                            outline: 'none',
                        }}
                    />
                    {searchTerm && (
                        <>
                            <span
                                style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: '12px',
                                    color: matchCount > 0 ? (isDark ? '#FFE500' : '#B8860B') : isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    minWidth: '60px',
                                    textAlign: 'center',
                                }}
                            >
                                {matchCount > 0 ? `${currentMatchIndex + 1} / ${matchCount}` : 'No results'}
                            </span>
                            <button
                                onClick={goToPrevMatch}
                                disabled={matchCount === 0}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                                    color: isDark ? '#ffffff' : '#242424',
                                    cursor: matchCount > 0 ? 'pointer' : 'default',
                                    opacity: matchCount > 0 ? 1 : 0.3,
                                }}
                                title="Previous match (Shift+Enter)"
                            >
                                <ArrowUp16Regular />
                            </button>
                            <button
                                onClick={goToNextMatch}
                                disabled={matchCount === 0}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                                    color: isDark ? '#ffffff' : '#242424',
                                    cursor: matchCount > 0 ? 'pointer' : 'default',
                                    opacity: matchCount > 0 ? 1 : 0.3,
                                }}
                                title="Next match (Enter)"
                            >
                                <ArrowDown16Regular />
                            </button>
                            <button
                                onClick={clearSearch}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                                    color: isDark ? '#ffffff' : '#242424',
                                    cursor: 'pointer',
                                }}
                                title="Clear search"
                            >
                                <Dismiss16Regular />
                            </button>
                        </>
                    )}
                </div>

                {/* Log content */}
                <div
                    style={{
                        flex: 1,
                        overflow: 'hidden',
                        padding: '16px 24px',
                    }}
                >
                    <pre
                        ref={outputRef}
                        style={{
                            margin: 0,
                            padding: '20px',
                            height: '100%',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '13px',
                            lineHeight: '1.6',
                            background: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.02)',
                            color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
                            borderRadius: '12px',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                            overflow: 'auto',
                            whiteSpace: 'pre',
                            overflowX: 'auto',
                        }}
                    >
                        {highlightedContent}
                    </pre>
                </div>
            </div>
        </div>,
        document.body
    )
}
