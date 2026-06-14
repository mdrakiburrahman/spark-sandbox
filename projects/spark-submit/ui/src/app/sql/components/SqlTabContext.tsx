'use client'

import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react'

// --- Types ---

export interface QueryResult {
    sessionId: number
    statementId: number
    status: string
    columns: { name: string; type: string; nullable?: boolean }[]
    rows: any[][]
    executionTime: number
    rowCount: number
}

export interface SqlTab {
    id: string
    title: string
    query: string
    results: QueryResult | null
    isExecuting: boolean
    error: string | null
    executionTime: number | null
}

export type TabAction =
    | { type: 'ADD_TAB' }
    | { type: 'CLOSE_TAB'; id: string }
    | { type: 'SET_ACTIVE'; id: string }
    | { type: 'RENAME_TAB'; id: string; title: string }
    | { type: 'SET_QUERY'; id: string; query: string }
    | { type: 'SET_EXECUTING'; id: string; isExecuting: boolean }
    | { type: 'SET_RESULTS'; id: string; results: QueryResult }
    | { type: 'SET_ERROR'; id: string; error: string }
    | { type: 'CLEAR_RESULTS'; id: string }
    | { type: 'RESTORE_TABS'; tabs: SqlTab[]; activeId: string }

export interface TabState {
    tabs: SqlTab[]
    activeTabId: string
    nextTabNumber: number
}

// --- Helpers ---

const STORAGE_KEY = 'spark-sql-tabs'

function generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return 'tab-' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36)
}

function createTab(tabNumber: number): SqlTab {
    return {
        id: generateId(),
        title: `Query ${tabNumber}`,
        query: '',
        results: null,
        isExecuting: false,
        error: null,
        executionTime: null,
    }
}

function updateTab(tabs: SqlTab[], id: string, updates: Partial<SqlTab>): SqlTab[] {
    return tabs.map((tab) => (tab.id === id ? { ...tab, ...updates } : tab))
}

// --- Reducer ---

function tabReducer(state: TabState, action: TabAction): TabState {
    switch (action.type) {
        case 'ADD_TAB': {
            const newTab = createTab(state.nextTabNumber)
            return {
                tabs: [...state.tabs, newTab],
                activeTabId: newTab.id,
                nextTabNumber: state.nextTabNumber + 1,
            }
        }

        case 'CLOSE_TAB': {
            const remaining = state.tabs.filter((t) => t.id !== action.id)

            if (remaining.length === 0) {
                const newTab = createTab(state.nextTabNumber)
                return {
                    tabs: [newTab],
                    activeTabId: newTab.id,
                    nextTabNumber: state.nextTabNumber + 1,
                }
            }

            let activeTabId = state.activeTabId
            if (activeTabId === action.id) {
                const closedIndex = state.tabs.findIndex((t) => t.id === action.id)
                const newIndex = Math.min(closedIndex, remaining.length - 1)
                activeTabId = remaining[newIndex].id
            }

            return { ...state, tabs: remaining, activeTabId }
        }

        case 'SET_ACTIVE':
            return { ...state, activeTabId: action.id }

        case 'RENAME_TAB':
            return { ...state, tabs: updateTab(state.tabs, action.id, { title: action.title }) }

        case 'SET_QUERY':
            return { ...state, tabs: updateTab(state.tabs, action.id, { query: action.query }) }

        case 'SET_EXECUTING':
            return {
                ...state,
                tabs: updateTab(state.tabs, action.id, { isExecuting: action.isExecuting }),
            }

        case 'SET_RESULTS':
            return {
                ...state,
                tabs: updateTab(state.tabs, action.id, {
                    results: action.results,
                    isExecuting: false,
                    error: null,
                    executionTime: action.results.executionTime,
                }),
            }

        case 'SET_ERROR':
            return {
                ...state,
                tabs: updateTab(state.tabs, action.id, {
                    error: action.error,
                    isExecuting: false,
                }),
            }

        case 'CLEAR_RESULTS':
            return {
                ...state,
                tabs: updateTab(state.tabs, action.id, {
                    results: null,
                    error: null,
                    executionTime: null,
                }),
            }

        case 'RESTORE_TABS': {
            const maxNum = action.tabs.reduce((max, tab) => {
                const match = tab.title.match(/^Query (\d+)$/)
                return match ? Math.max(max, parseInt(match[1], 10)) : max
            }, 0)

            return {
                tabs: action.tabs,
                activeTabId: action.activeId,
                nextTabNumber: maxNum + 1,
            }
        }

        default:
            return state
    }
}

// --- Initial state ---

function getInitialState(): TabState {
    const defaultTab = createTab(1)
    return {
        tabs: [defaultTab],
        activeTabId: defaultTab.id,
        nextTabNumber: 2,
    }
}

function loadFromStorage(): TabState | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const data = JSON.parse(raw) as { tabs: SqlTab[]; activeTabId: string }
        if (!Array.isArray(data.tabs) || data.tabs.length === 0) return null

        // Reset transient state on restore
        const tabs = data.tabs.map((tab) => ({
            ...tab,
            isExecuting: false,
        }))

        const maxNum = tabs.reduce((max, tab) => {
            const match = tab.title.match(/^Query (\d+)$/)
            return match ? Math.max(max, parseInt(match[1], 10)) : max
        }, 0)

        const activeTabId = tabs.some((t) => t.id === data.activeTabId) ? data.activeTabId : tabs[0].id

        return { tabs, activeTabId, nextTabNumber: maxNum + 1 }
    } catch {
        return null
    }
}

// --- Context ---

interface SqlTabContextValue {
    tabs: SqlTab[]
    activeTab: SqlTab
    activeTabId: string
    dispatch: React.Dispatch<TabAction>
    addTab: () => void
    closeTab: (id: string) => void
    setActiveTab: (id: string) => void
    renameTab: (id: string, title: string) => void
    updateQuery: (id: string, query: string) => void
}

const SqlTabContext = createContext<SqlTabContextValue | null>(null)

// --- Provider ---

export const SqlTabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(tabReducer, undefined, () => {
        return loadFromStorage() ?? getInitialState()
    })

    // Persist to localStorage on every state change
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs: state.tabs, activeTabId: state.activeTabId }))
        } catch {
            // Storage full or unavailable — silently ignore
        }
    }, [state.tabs, state.activeTabId])

    const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0]

    const addTab = useCallback(() => dispatch({ type: 'ADD_TAB' }), [])
    const closeTab = useCallback((id: string) => dispatch({ type: 'CLOSE_TAB', id }), [])
    const setActiveTab = useCallback((id: string) => dispatch({ type: 'SET_ACTIVE', id }), [])
    const renameTab = useCallback((id: string, title: string) => dispatch({ type: 'RENAME_TAB', id, title }), [])
    const updateQuery = useCallback((id: string, query: string) => dispatch({ type: 'SET_QUERY', id, query }), [])

    const value: SqlTabContextValue = {
        tabs: state.tabs,
        activeTab,
        activeTabId: state.activeTabId,
        dispatch,
        addTab,
        closeTab,
        setActiveTab,
        renameTab,
        updateQuery,
    }

    return <SqlTabContext.Provider value={value}>{children}</SqlTabContext.Provider>
}

// --- Hook ---

export function useSqlTabs(): SqlTabContextValue {
    const ctx = useContext(SqlTabContext)
    if (!ctx) {
        throw new Error('useSqlTabs must be used within a SqlTabProvider')
    }
    return ctx
}
