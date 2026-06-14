'use client'

import { useState, useEffect, useCallback } from 'react'
import { QuestionCircle24Regular, Dismiss24Regular } from '@fluentui/react-icons'
import { useThemeContext } from './ThemeProvider'

interface OnboardingOverlayProps {
    onDismiss?: () => void
}

interface TooltipConfig {
    id: string
    text: string | JSX.Element
    position: {
        top?: string
        bottom?: string
        left?: string
        right?: string
    }
    arrowDirection?: 'left' | 'right' | 'up' | 'down'
}

const TOOLTIPS: TooltipConfig[] = [
    {
        id: 'search',
        text: (
            <>
                Search for the name of your <span style={{ color: '#EAB308', fontWeight: 600 }}>spark-jobs.yaml</span>
            </>
        ),
        position: { top: '110px', left: '50%' },
        arrowDirection: 'up',
    },
    {
        id: 'control-panel',
        text: "Select all categories of a job type and it's dependencies",
        position: { bottom: '140px', left: '50%' },
        arrowDirection: 'down',
    },
    {
        id: 'canvas',
        text: "Select a Job and all it's predecessors, or just run one job",
        position: { top: '50%', left: '50%' },
        arrowDirection: 'down',
    },
    {
        id: 'play-stop',
        text: 'After your selection is confirmed, press Play. If you press Stop, all jobs will stop.',
        position: { top: '70px', right: '180px' },
        arrowDirection: 'right',
    },
]

function Tooltip({ config, isDark }: { config: TooltipConfig; isDark: boolean }) {
    const arrowSize = 10

    const getArrowStyles = (): React.CSSProperties => {
        const baseArrow: React.CSSProperties = {
            position: 'absolute',
            width: 0,
            height: 0,
            borderStyle: 'solid',
        }

        const bgColor = isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)'

        switch (config.arrowDirection) {
            case 'left':
                return {
                    ...baseArrow,
                    left: -arrowSize,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    borderWidth: `${arrowSize}px ${arrowSize}px ${arrowSize}px 0`,
                    borderColor: `transparent ${bgColor} transparent transparent`,
                }
            case 'right':
                return {
                    ...baseArrow,
                    right: -arrowSize,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    borderWidth: `${arrowSize}px 0 ${arrowSize}px ${arrowSize}px`,
                    borderColor: `transparent transparent transparent ${bgColor}`,
                }
            case 'up':
                return {
                    ...baseArrow,
                    top: -arrowSize,
                    left: '20px',
                    borderWidth: `0 ${arrowSize}px ${arrowSize}px ${arrowSize}px`,
                    borderColor: `transparent transparent ${bgColor} transparent`,
                }
            case 'down':
                return {
                    ...baseArrow,
                    bottom: -arrowSize,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    borderWidth: `${arrowSize}px ${arrowSize}px 0 ${arrowSize}px`,
                    borderColor: `${bgColor} transparent transparent transparent`,
                }
            default:
                return {}
        }
    }

    return (
        <div
            style={{
                position: 'fixed',
                ...config.position,
                transform: config.position.left === '50%' && config.position.top === '50%' ? 'translate(-50%, -50%)' : config.position.left === '50%' ? 'translateX(-50%)' : undefined,
                zIndex: 1001,
                animation: 'fadeSlideIn 0.5s ease-out',
            }}
        >
            <div
                style={{
                    position: 'relative',
                    background: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    maxWidth: '280px',
                    fontSize: '14px',
                    fontWeight: 500,
                    lineHeight: 1.5,
                    color: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)',
                    border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'}`,
                    boxShadow: isDark ? '0 8px 32px rgba(0, 0, 0, 0.5)' : '0 8px 32px rgba(0, 0, 0, 0.15)',
                }}
            >
                {config.text}
                <div style={getArrowStyles()} />
            </div>
        </div>
    )
}

export default function OnboardingOverlay({ onDismiss }: OnboardingOverlayProps) {
    const { isDark } = useThemeContext()
    const [isVisible, setIsVisible] = useState(false)
    const [showButton, setShowButton] = useState(true)
    const [hasInteracted, setHasInteracted] = useState(false)

    // Check localStorage on mount
    useEffect(() => {
        const hasSeenOnboarding = localStorage.getItem('spark-submit-onboarding-seen')
        if (!hasSeenOnboarding) {
            // Small delay for smooth entrance
            const timer = setTimeout(() => setIsVisible(true), 500)
            return () => clearTimeout(timer)
        }
    }, [])

    // Handle user interaction
    const handleInteraction = useCallback(() => {
        if (isVisible && !hasInteracted) {
            setHasInteracted(true)
            setTimeout(() => {
                setIsVisible(false)
                localStorage.setItem('spark-submit-onboarding-seen', 'true')
                onDismiss?.()
            }, 300)
        }
    }, [isVisible, hasInteracted, onDismiss])

    // Listen for user interactions
    useEffect(() => {
        if (!isVisible) return

        const events = ['click', 'keydown', 'scroll', 'wheel', 'touchstart']

        // Delay to prevent immediate dismissal
        const timer = setTimeout(() => {
            events.forEach((event) => {
                window.addEventListener(event, handleInteraction, { once: true, passive: true })
            })
        }, 1000)

        return () => {
            clearTimeout(timer)
            events.forEach((event) => {
                window.removeEventListener(event, handleInteraction)
            })
        }
    }, [isVisible, handleInteraction])

    const handleShowOverlay = () => {
        setHasInteracted(false)
        setIsVisible(true)
    }

    const handleDismissClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        setHasInteracted(true)
        setTimeout(() => {
            setIsVisible(false)
            localStorage.setItem('spark-submit-onboarding-seen', 'true')
            onDismiss?.()
        }, 100)
    }

    return (
        <>
            {/* Help button (top left of canvas) */}
            {showButton && (
                <button
                    onClick={handleShowOverlay}
                    title="Show help overlay"
                    style={{
                        position: 'fixed',
                        top: '70px',
                        left: '24px',
                        zIndex: 101,
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
                        background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'
                        e.currentTarget.style.color = isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)'
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                        e.currentTarget.style.color = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'
                    }}
                >
                    <QuestionCircle24Regular />
                </button>
            )}

            {/* Overlay */}
            {isVisible && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 1000,
                        background: isDark
                            ? 'radial-gradient(ellipse at center, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.19) 100%)'
                            : 'radial-gradient(ellipse at center, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.11) 100%)',
                        backdropFilter: 'blur(2px)',
                        WebkitBackdropFilter: 'blur(2px)',
                        opacity: hasInteracted ? 0 : 1,
                        transition: 'opacity 0.3s ease-out',
                        pointerEvents: hasInteracted ? 'none' : 'auto',
                    }}
                >
                    {/* Dismiss button */}
                    <button
                        onClick={handleDismissClick}
                        style={{
                            position: 'absolute',
                            top: '20px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 20px',
                            borderRadius: '24px',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.4)'}`,
                            background: isDark ? 'rgba(40, 40, 40, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                            color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
                            fontSize: '14px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                            animation: 'fadeSlideIn 0.5s ease-out',
                        }}
                    >
                        <span>Click anywhere to dismiss</span>
                        <Dismiss24Regular style={{ width: 18, height: 18 }} />
                    </button>

                    {/* Tooltips */}
                    {TOOLTIPS.map((tooltip) => (
                        <Tooltip key={tooltip.id} config={tooltip} isDark={isDark} />
                    ))}
                </div>
            )}

            {/* Keyframe animations */}
            <style jsx global>{`
                @keyframes fadeSlideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </>
    )
}

export function OnboardingHelpButton() {
    const { isDark } = useThemeContext()
    const [showOverlay, setShowOverlay] = useState(false)

    return (
        <>
            <button
                onClick={() => setShowOverlay(true)}
                title="Show help"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                }}
            >
                <QuestionCircle24Regular />
            </button>
            {showOverlay && <OnboardingOverlay onDismiss={() => setShowOverlay(false)} />}
        </>
    )
}
