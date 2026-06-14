'use client'

import { useState, useCallback, useEffect } from 'react'
import { Search20Regular, Dismiss16Regular, ChevronUp16Regular, ChevronDown16Regular } from '@fluentui/react-icons'
import { JobsConfig } from '@/lib/types'

interface SearchBarProps {
    config: JobsConfig
    onHighlightJob: (jobName: string | null) => void
    onFocusJob: (jobName: string) => void
    isDark: boolean
}

export default function SearchBar({ config, onHighlightJob, onFocusJob, isDark }: SearchBarProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [searchResults, setSearchResults] = useState<string[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isExpanded, setIsExpanded] = useState(false)

    // Search through jobs
    const performSearch = useCallback(
        (term: string) => {
            if (!term.trim() || !config) {
                setSearchResults([])
                setCurrentIndex(0)
                onHighlightJob(null)
                return
            }

            const lowerTerm = term.toLowerCase()
            const results: string[] = []

            for (const [jobName, job] of Object.entries(config.jobs)) {
                // Search in job name
                if (jobName.toLowerCase().includes(lowerTerm)) {
                    results.push(jobName)
                    continue
                }

                // Search in module
                if (job.module.toLowerCase().includes(lowerTerm)) {
                    results.push(jobName)
                    continue
                }

                // Search in class
                if (job.class.toLowerCase().includes(lowerTerm)) {
                    results.push(jobName)
                    continue
                }

                // Search in category
                if (job.category.toLowerCase().includes(lowerTerm)) {
                    results.push(jobName)
                    continue
                }

                // Search in description
                if (job.description.toLowerCase().includes(lowerTerm)) {
                    results.push(jobName)
                    continue
                }

                // Search in dependencies
                if (job.dependsOn?.some((dep) => dep.toLowerCase().includes(lowerTerm))) {
                    results.push(jobName)
                    continue
                }
            }

            setSearchResults(results)
            setCurrentIndex(0)

            // Highlight and focus first result
            if (results.length > 0) {
                onHighlightJob(results[0])
                onFocusJob(results[0])
            } else {
                onHighlightJob(null)
            }
        },
        [config, onHighlightJob, onFocusJob]
    )

    // Handle search input change
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setSearchTerm(value)
        performSearch(value)
    }

    // Navigate to previous result
    const goToPrev = useCallback(() => {
        if (searchResults.length === 0) return
        const newIndex = currentIndex === 0 ? searchResults.length - 1 : currentIndex - 1
        setCurrentIndex(newIndex)
        onHighlightJob(searchResults[newIndex])
        onFocusJob(searchResults[newIndex])
    }, [searchResults, currentIndex, onHighlightJob, onFocusJob])

    // Navigate to next result
    const goToNext = useCallback(() => {
        if (searchResults.length === 0) return
        const newIndex = currentIndex === searchResults.length - 1 ? 0 : currentIndex + 1
        setCurrentIndex(newIndex)
        onHighlightJob(searchResults[newIndex])
        onFocusJob(searchResults[newIndex])
    }, [searchResults, currentIndex, onHighlightJob, onFocusJob])

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl/Cmd + F to focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault()
                setIsExpanded(true)
                setTimeout(() => {
                    const input = document.getElementById('job-search-input')
                    input?.focus()
                }, 100)
            }

            // Enter or F3 for next result
            if (e.key === 'Enter' || e.key === 'F3') {
                if (document.activeElement?.id === 'job-search-input') {
                    e.preventDefault()
                    if (e.shiftKey) {
                        goToPrev()
                    } else {
                        goToNext()
                    }
                }
            }

            // Escape to clear and close search
            if (e.key === 'Escape') {
                if (document.activeElement?.id === 'job-search-input') {
                    setSearchTerm('')
                    setSearchResults([])
                    onHighlightJob(null)
                    setIsExpanded(false)
                }
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [goToNext, goToPrev, onHighlightJob])

    // Clear search
    const clearSearch = () => {
        setSearchTerm('')
        setSearchResults([])
        setCurrentIndex(0)
        onHighlightJob(null)
    }

    return (
        <div
            style={{
                position: 'fixed',
                top: '70px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
            }}
        >
            {/* Search toggle button (collapsed state) */}
            {!isExpanded && (
                <button
                    onClick={() => setIsExpanded(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px 16px',
                        gap: '8px',
                        background: isDark ? 'rgba(20, 20, 20, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        borderRadius: '12px',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
                        fontSize: '13px',
                        cursor: 'pointer',
                    }}
                    title="Search jobs (Ctrl+F)"
                >
                    <Search20Regular />
                    Search Jobs
                </button>
            )}

            {/* Expanded search bar */}
            {isExpanded && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        background: isDark ? 'rgba(20, 20, 20, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        borderRadius: '12px',
                        border: `1px solid ${searchResults.length > 0 ? '#3b82f6' : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        boxShadow: searchResults.length > 0 ? '0 4px 20px rgba(59, 130, 246, 0.3)' : '0 4px 20px rgba(0,0,0,0.15)',
                        transition: 'all 0.2s ease',
                    }}
                >
                    <Search20Regular style={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)' }} />

                    <input
                        id="job-search-input"
                        type="text"
                        value={searchTerm}
                        onChange={handleSearchChange}
                        placeholder="Search jobs by name, module, class, category..."
                        autoFocus
                        style={{
                            width: '300px',
                            padding: '6px 8px',
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: isDark ? '#ffffff' : '#242424',
                            fontSize: '13px',
                            fontFamily: "'JetBrains Mono', monospace",
                        }}
                    />

                    {/* Results counter */}
                    {searchTerm && (
                        <div
                            style={{
                                padding: '4px 10px',
                                background: searchResults.length > 0 ? (isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)') : isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)',
                                borderRadius: '6px',
                                color: searchResults.length > 0 ? (isDark ? '#60a5fa' : '#2563eb') : isDark ? '#f87171' : '#dc2626',
                                fontSize: '12px',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {searchResults.length > 0 ? `${currentIndex + 1} of ${searchResults.length}` : 'No results'}
                        </div>
                    )}

                    {/* Navigation buttons */}
                    {searchResults.length > 1 && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                                onClick={goToPrev}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                    color: isDark ? '#ffffff' : '#242424',
                                    cursor: 'pointer',
                                }}
                                title="Previous (Shift+Enter)"
                            >
                                <ChevronUp16Regular />
                            </button>
                            <button
                                onClick={goToNext}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                    color: isDark ? '#ffffff' : '#242424',
                                    cursor: 'pointer',
                                }}
                                title="Next (Enter)"
                            >
                                <ChevronDown16Regular />
                            </button>
                        </div>
                    )}

                    {/* Clear/close button */}
                    <button
                        onClick={() => {
                            clearSearch()
                            setIsExpanded(false)
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: 'none',
                            background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)',
                            cursor: 'pointer',
                        }}
                        title="Close (Escape)"
                    >
                        <Dismiss16Regular />
                    </button>
                </div>
            )}
        </div>
    )
}
