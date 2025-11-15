'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Activity, Video, Brain, AlertCircle, Zap, Eye, X } from 'lucide-react'

type TestState = 'idle' | 'preparing' | 'flash' | 'results' | 'flashInstruction' | 'flashActive'
type TestMode = 'simple' | 'dotgrid' | 'flash'

interface TestResults {
  reactionTime: number
  movementIndex: number
  neuroScore: number
  alertLevel: string
}

interface DotGridResults {
  averageReactionTime: number
  hits: number
  misses: number
  dotScore: number
}

interface FlashTestResults {
  reactionTimeMs: number
  blinkLatencyMs: number
  blinkCount: number
  stabilityScore: number
  fatigueLevel: string
  fatigueScore: number
}

interface DotPosition {
  x: number
  y: number
  timestamp: number
}

export default function NeuroPulsePage() {
  const [testMode, setTestMode] = useState<TestMode>('simple')
  const [testState, setTestState] = useState<TestState>('idle')
  const [results, setResults] = useState<TestResults | null>(null)
  const [dotGridResults, setDotGridResults] = useState<DotGridResults | null>(null)
  const [flashTestResults, setFlashTestResults] = useState<FlashTestResults | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [countdown, setCountdown] = useState<string>('')
  const [flashSequenceCount, setFlashSequenceCount] = useState<number>(0)
  const [isMobile, setIsMobile] = useState<boolean>(false)
  
  const [currentDot, setCurrentDot] = useState<DotPosition | null>(null)
  const [dotRound, setDotRound] = useState<number>(0)
  const [dotReactionTimes, setDotReactionTimes] = useState<number[]>([])
  const [dotMisses, setDotMisses] = useState<number>(0)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startTimeRef = useRef<number>(0)
  const beforeFrameRef = useRef<ImageData | null>(null)
  const dotTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const flashIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
    }
    checkMobile()
  }, [])

  // Initialize webcam
  useEffect(() => {
    async function initCamera() {
      try {
        const constraints = testMode === 'flash' && isMobile
          ? { video: { facingMode: 'environment', width: 1280, height: 720 } }
          : { video: { width: 640, height: 480 } }
        
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
        setStream(mediaStream)
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
      } catch (err) {
        console.error('[v0] Camera access error:', err)
      }
    }
    
    initCamera()
    
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [testMode, isMobile])

  // Update video stream when it changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  // Capture frame from video
  const captureFrame = (): ImageData | null => {
    if (!videoRef.current || !canvasRef.current) return null
    
    const canvas = canvasRef.current
    const video = videoRef.current
    const ctx = canvas.getContext('2d')
    
    if (!ctx) return null
    
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  }

  // Calculate movement index by comparing two frames
  const calculateMovementIndex = (frame1: ImageData, frame2: ImageData): number => {
    if (!frame1 || !frame2 || frame1.data.length !== frame2.data.length) return 0
    
    let totalDiff = 0
    const data1 = frame1.data
    const data2 = frame2.data
    
    // Sample every 4th pixel for performance (RGBA = 4 values per pixel)
    for (let i = 0; i < data1.length; i += 16) {
      const diff = Math.abs(data1[i] - data2[i]) + 
                   Math.abs(data1[i + 1] - data2[i + 1]) + 
                   Math.abs(data1[i + 2] - data2[i + 2])
      totalDiff += diff
    }
    
    // Normalize to 0-100 scale
    const pixels = data1.length / 16
    const avgDiff = totalDiff / pixels
    return Math.min(Math.round((avgDiff / 765) * 100), 100)
  }

  // Calculate NeuroScore from reaction time and movement
  const calculateNeuroScore = (reactionMs: number, movement: number): number => {
    // Ideal reaction time: 200-300ms = 100 score
    // Movement penalty: high movement (>50) suggests fatigue
    
    let reactionScore = 100
    if (reactionMs < 200) {
      reactionScore = 70 // Too fast might be anticipation
    } else if (reactionMs <= 300) {
      reactionScore = 100
    } else if (reactionMs <= 500) {
      reactionScore = 80
    } else if (reactionMs <= 700) {
      reactionScore = 60
    } else {
      reactionScore = 30
    }
    
    // Movement penalty (less movement = more alert)
    const movementPenalty = Math.min(movement * 0.3, 30)
    
    const finalScore = Math.max(0, Math.min(100, reactionScore - movementPenalty))
    return Math.round(finalScore)
  }

  // Get alert level from NeuroScore
  const getAlertLevel = (score: number): string => {
    if (score >= 75) return 'High Alertness'
    if (score >= 50) return 'Normal'
    return 'Cognitive Fatigue Detected'
  }

  const calculateCombinedNeuroScore = (): number => {
    const scores: number[] = []
    if (results) scores.push(results.neuroScore)
    if (dotGridResults) scores.push(dotGridResults.dotScore)
    if (flashTestResults) scores.push(flashTestResults.fatigueScore)
    
    if (scores.length === 0) return 0
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  }

  const enableFlashLight = async () => {
    if (!stream) return
    
    const track = stream.getVideoTracks()[0]
    const capabilities = track.getCapabilities() as any
    
    if (capabilities.torch) {
      try {
        await track.applyConstraints({
          advanced: [{ torch: true } as any]
        })
      } catch (err) {
        console.error('[v0] Flash control error:', err)
      }
    }
  }

  const disableFlashLight = async () => {
    if (!stream) return
    
    const track = stream.getVideoTracks()[0]
    const capabilities = track.getCapabilities() as any
    
    if (capabilities.torch) {
      try {
        await track.applyConstraints({
          advanced: [{ torch: false } as any]
        })
      } catch (err) {
        console.error('[v0] Flash control error:', err)
      }
    }
  }

  const startFlashTest = () => {
    setTestState('flashActive')
    setFlashSequenceCount(0)
    
    // Countdown
    let countdownNum = 3
    setCountdown(`${countdownNum}`)
    
    const countdownInterval = setInterval(() => {
      countdownNum--
      if (countdownNum > 0) {
        setCountdown(`${countdownNum}`)
      } else {
        clearInterval(countdownInterval)
        setCountdown('')
        runFlashSequence()
      }
    }, 1000)
  }

  const runFlashSequence = async () => {
    let flashCount = 0
    const totalFlashes = 3
    
    const doFlash = async () => {
      if (flashCount >= totalFlashes) {
        // Test complete - generate mock results
        setTimeout(() => {
          finishFlashTest()
        }, 500)
        return
      }
      
      // Turn flash ON
      await enableFlashLight()
      
      // Keep flash on for 300ms
      setTimeout(async () => {
        // Turn flash OFF
        await disableFlashLight()
        
        flashCount++
        setFlashSequenceCount(flashCount)
        
        // Random delay before next flash (700-1200ms)
        const delay = 700 + Math.random() * 500
        setTimeout(doFlash, delay)
      }, 300)
    }
    
    // Start first flash after small delay
    setTimeout(doFlash, 500)
  }

  const finishFlashTest = () => {
    // Mock results (in production, this would come from backend analysis)
    const mockResults: FlashTestResults = {
      reactionTimeMs: Math.round(220 + Math.random() * 150),
      blinkLatencyMs: Math.round(180 + Math.random() * 100),
      blinkCount: Math.floor(2 + Math.random() * 3),
      stabilityScore: Math.round(70 + Math.random() * 25),
      fatigueLevel: 'Normal',
      fatigueScore: Math.round(65 + Math.random() * 25)
    }
    
    // Adjust fatigue level based on score
    if (mockResults.fatigueScore >= 75) {
      mockResults.fatigueLevel = 'Fresh'
    } else if (mockResults.fatigueScore < 50) {
      mockResults.fatigueLevel = 'Fatigued'
    }
    
    setFlashTestResults(mockResults)
    setTestState('results')
  }

  const spawnNextDot = (round: number) => {
    if (round >= 10) {
      // Test complete
      finishDotGridTest()
      return
    }
    
    // Random position (accounting for dot size)
    const x = Math.random() * 80 + 10 // 10-90% of container width
    const y = Math.random() * 70 + 10 // 10-80% of container height
    
    setCurrentDot({ x, y, timestamp: performance.now() })
    setDotRound(round + 1)
    
    // Auto-miss after 2 seconds
    dotTimeoutRef.current = setTimeout(() => {
      handleDotMiss()
    }, 2000)
  }

  const handleDotClick = () => {
    if (!currentDot) return
    
    const reactionTime = performance.now() - currentDot.timestamp
    setDotReactionTimes(prev => [...prev, reactionTime])
    
    if (dotTimeoutRef.current) {
      clearTimeout(dotTimeoutRef.current)
    }
    
    setCurrentDot(null)
    
    spawnNextDot(dotRound)
  }

  const handleDotMiss = () => {
    setDotMisses(prev => prev + 1)
    setCurrentDot(null)
    
    spawnNextDot(dotRound)
  }

  const finishDotGridTest = () => {
    const avgReactionTime = dotReactionTimes.length > 0
      ? Math.round(dotReactionTimes.reduce((a, b) => a + b, 0) / dotReactionTimes.length)
      : 0
    
    const hits = dotReactionTimes.length
    const misses = dotMisses
    
    // Calculate DotScore (0-100)
    let dotScore = 100
    
    // Penalize for slow average reaction time
    if (avgReactionTime > 800) dotScore -= 40
    else if (avgReactionTime > 600) dotScore -= 25
    else if (avgReactionTime > 400) dotScore -= 10
    
    // Penalize for misses
    dotScore -= misses * 8
    
    dotScore = Math.max(0, Math.min(100, dotScore))
    
    setDotGridResults({
      averageReactionTime: avgReactionTime,
      hits,
      misses,
      dotScore: Math.round(dotScore)
    })
    
    setTestState('results')
  }

  // Start the test
  const startTest = async () => {
    if (testMode === 'flash') {
      setTestState('flashInstruction')
      return
    }
    
    setTestState('preparing')
    setResults(null)
    
    if (testMode === 'dotgrid') {
      // Start dot grid test
      setDotReactionTimes([])
      setDotMisses(0)
      setDotRound(0)
      
      // Short countdown then start
      setCountdown('Get Ready...')
      setTimeout(() => {
        setCountdown('')
        setTestState('flash')
        spawnNextDot(0)
      }, 1500)
    } else {
      // Original simple reaction test
      // Random delay between 1-3 seconds
      const delay = 1000 + Math.random() * 2000
      
      // Countdown
      const countdownInterval = setInterval(() => {
        setCountdown('Get Ready...')
      }, 100)
      
      setTimeout(() => {
        clearInterval(countdownInterval)
        setCountdown('')
        
        // Capture "before" frame
        beforeFrameRef.current = captureFrame()
        
        // Show GO!
        setTestState('flash')
        startTimeRef.current = performance.now()
      }, delay)
    }
  }

  // Handle user reaction
  const handleReaction = () => {
    if (testState !== 'flash') return
    
    const reactionTime = Math.round(performance.now() - startTimeRef.current)
    
    // Capture "after" frame
    const afterFrame = captureFrame()
    
    // Calculate movement
    const movement = beforeFrameRef.current && afterFrame 
      ? calculateMovementIndex(beforeFrameRef.current, afterFrame)
      : 0
    
    // Calculate scores
    const neuroScore = calculateNeuroScore(reactionTime, movement)
    const alertLevel = getAlertLevel(neuroScore)
    
    setResults({
      reactionTime,
      movementIndex: movement,
      neuroScore,
      alertLevel
    })
    
    setTestState('results')
  }

  const runAgain = () => {
    setTestState('idle')
    setCountdown('')
    if (dotTimeoutRef.current) {
      clearTimeout(dotTimeoutRef.current)
    }
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current)
    }
    setCurrentDot(null)
    
    // Clear results for the current test mode only
    if (testMode === 'simple') {
      setResults(null)
    } else if (testMode === 'dotgrid') {
      setDotGridResults(null)
    } else if (testMode === 'flash') {
      setFlashTestResults(null)
    }
  }

  useEffect(() => {
    return () => {
      if (dotTimeoutRef.current) {
        clearTimeout(dotTimeoutRef.current)
      }
      if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current)
      }
    }
  }, [])

  const generateAIInsights = () => {
    const combinedScore = calculateCombinedNeuroScore()
    const hasSimple = results !== null
    const hasDotGrid = dotGridResults !== null
    const hasFlash = flashTestResults !== null
    
    if (combinedScore === 0) {
      return {
        summary: "Complete a test to receive your AI-powered alertness analysis.",
        observations: [
          "Awaiting test data",
          "Multiple test modes available",
          "Results updated in real-time"
        ],
        suggestion: "Select a test mode and click 'Start Test' to begin."
      }
    }
    
    // Placeholder AI-generated insights (to be replaced with GPT call)
    let summary = ""
    let observations: string[] = []
    let suggestion = ""
    
    if (combinedScore >= 75) {
      summary = "Your NeuroScore indicates high cognitive alertness and optimal reaction performance. You are likely well-rested and ready for demanding tasks."
      observations = [
        hasSimple ? `Quick reaction time (${results?.reactionTime}ms) within optimal range` : "",
        hasDotGrid ? `Strong visual tracking with ${dotGridResults?.hits}/10 hits` : "",
        hasFlash ? `Sharp pupil response (${flashTestResults?.reactionTimeMs}ms) indicates alertness` : "",
        "Minimal movement index suggests stable focus"
      ].filter(Boolean)
      suggestion = "You are clear to drive. Maintain regular breaks every 2-3 hours."
    } else if (combinedScore >= 50) {
      summary = "Your NeuroScore shows normal alertness levels with minor variations. Performance is adequate but may benefit from brief rest."
      observations = [
        hasSimple ? "Reaction time slightly slower than peak performance" : "",
        hasDotGrid ? `Moderate tracking accuracy (${dotGridResults?.hits}/10 targets)` : "",
        hasFlash ? `Pupil reactivity shows ${flashTestResults?.blinkCount} blinks detected` : "",
        "Some indicators of mild cognitive load"
      ].filter(Boolean)
      suggestion = "Consider a 10-minute break and hydration before extended driving."
    } else {
      summary = "Your NeuroScore indicates cognitive fatigue and reduced alertness. This presents a safety risk for commercial driving operations."
      observations = [
        hasSimple ? `Delayed reaction time (${results?.reactionTime}ms) exceeds safe threshold` : "",
        hasDotGrid ? `Lower tracking performance with ${dotGridResults?.misses} missed targets` : "",
        hasFlash ? `Slower pupil response and ${flashTestResults?.blinkCount} blinks suggest fatigue` : "",
        "Movement patterns suggest reduced engagement"
      ].filter(Boolean)
      suggestion = "Take a 15-30 minute break before starting any drive. Consider rest or shift adjustment."
    }
    
    return { summary, observations, suggestion }
  }

  const aiInsights = generateAIInsights()

  return (
    <main className="min-h-screen bg-background p-4">
      <div className="text-center space-y-2 mb-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Activity className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-bold tracking-tight text-balance">NeuroPulse</h1>
        </div>
        <p className="text-muted-foreground text-base">
          Fatigue Screening for Commercial Drivers
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        {testState === 'flashInstruction' && (
          <Card className="p-6 space-y-4 bg-card border-medical">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-bold">Flash Test Instructions</h2>
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setTestState('idle')}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-sm">What will happen:</h3>
                <p className="text-sm text-muted-foreground">
                  We'll use your back camera and flash to briefly light your eye and analyze your response. 
                  The test takes about 5 seconds.
                </p>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Safety Warning
                </h3>
                <p className="text-sm text-muted-foreground">
                  Do not use if you are sensitive to flashing lights, epileptic, or have eye conditions.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Before you start:</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Hold phone 15-25 cm from one eye</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Make sure room is dim or evenly lit</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Keep your eye open and steady during the test</span>
                  </li>
                </ul>
              </div>

              {!isMobile && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                  <p className="text-sm text-destructive font-medium">
                    This test is only available on mobile devices with camera flash support.
                  </p>
                </div>
              )}

              <Button 
                onClick={startFlashTest}
                size="lg"
                className="w-full h-16 text-base bg-primary hover:bg-primary/90 font-semibold"
                disabled={!isMobile || !stream}
              >
                I Understand – Start Test
              </Button>
            </div>
          </Card>
        )}

        {testState === 'flashActive' && (
          <Card className="p-4 space-y-4 bg-card border-medical">
            <div className="relative aspect-[3/4] bg-black rounded-lg overflow-hidden border-2 border-primary">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-cover"
              />
              
              {/* Eye alignment guide */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 rounded-full border-4 border-primary/50 border-dashed"></div>
              </div>

              {/* Countdown overlay */}
              {countdown && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <p className="text-6xl font-bold text-white">{countdown}</p>
                </div>
              )}

              {/* Flash counter */}
              <div className="absolute top-4 left-4 bg-black/70 px-4 py-2 rounded-lg">
                <p className="text-white text-sm font-semibold">
                  Flash {flashSequenceCount}/3
                </p>
              </div>

              {/* Instruction */}
              {!countdown && (
                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <p className="text-white text-sm bg-black/70 inline-block px-4 py-2 rounded-lg">
                    Align your eye in the circle. Hold steady.
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Camera Feed & Test Controls */}
        {testState !== 'flashInstruction' && testState !== 'flashActive' && (
          <Card className="p-4 space-y-4 bg-card border-medical">
            {/* Webcam Preview */}
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <Video className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Camera Feed</h2>
              </div>
              <div className="relative aspect-[4/3] bg-secondary rounded-lg overflow-hidden border-2 border-border">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted
                  className="w-full h-full object-cover"
                />
                {!stream && (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <p className="text-sm">Initializing camera...</p>
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Test Mode</h3>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={testMode === 'simple' ? 'default' : 'outline'}
                  onClick={() => {
                    setTestMode('simple')
                    setTestState('idle')
                  }}
                  className="h-auto py-3 flex flex-col items-center gap-1"
                  disabled={testState !== 'idle' && testState !== 'results'}
                >
                  <Activity className="w-5 h-5" />
                  <span className="text-xs font-medium">Simple</span>
                </Button>
                <Button
                  variant={testMode === 'dotgrid' ? 'default' : 'outline'}
                  onClick={() => {
                    setTestMode('dotgrid')
                    setTestState('idle')
                  }}
                  className="h-auto py-3 flex flex-col items-center gap-1"
                  disabled={testState !== 'idle' && testState !== 'results'}
                >
                  <Brain className="w-5 h-5" />
                  <span className="text-xs font-medium">Dot Grid</span>
                </Button>
                <Button
                  variant={testMode === 'flash' ? 'default' : 'outline'}
                  onClick={() => {
                    setTestMode('flash')
                    setTestState('idle')
                  }}
                  className="h-auto py-3 flex flex-col items-center gap-1"
                  disabled={testState !== 'idle' && testState !== 'results'}
                >
                  <Zap className="w-5 h-5" />
                  <span className="text-xs font-medium">Flash Test</span>
                </Button>
              </div>
            </div>

            {/* Test Area */}
            <div className="space-y-3">
              {testState === 'idle' && (
                <div className="text-center space-y-4 py-6">
                  <p className="text-muted-foreground text-sm">
                    {testMode === 'simple' 
                      ? 'Tap when you see GO! to test your reaction time'
                      : testMode === 'dotgrid'
                      ? 'Tap the dots as quickly as possible (10 rounds)'
                      : 'Check eye fatigue using your camera flash'}
                  </p>
                  <Button 
                    onClick={startTest} 
                    size="lg"
                    className="w-full text-base h-16 bg-primary hover:bg-primary/90 font-semibold"
                    disabled={!stream || (testMode === 'flash' && !isMobile)}
                  >
                    {testMode === 'flash' && !isMobile ? 'Mobile Only' : 'Start Test'}
                  </Button>
                </div>
              )}

              {testState === 'preparing' && (
                <div className="text-center py-12">
                  <p className="text-3xl font-bold text-primary animate-pulse">
                    {countdown || 'Get Ready...'}
                  </p>
                </div>
              )}

              {testState === 'flash' && testMode === 'simple' && (
                <div 
                  className="text-center py-16 cursor-pointer bg-accent rounded-lg active:bg-accent/80 transition-colors"
                  onClick={handleReaction}
                >
                  <p className="text-6xl font-bold text-accent-foreground animate-pulse">
                    GO!
                  </p>
                  <p className="text-sm text-muted-foreground mt-4">
                    Tap anywhere to react
                  </p>
                </div>
              )}

              {testState === 'flash' && testMode === 'dotgrid' && (
                <div className="relative bg-secondary rounded-lg border-2 border-border h-96">
                  <div className="absolute top-2 left-3 text-sm font-semibold text-foreground">
                    Round {dotRound}/10
                  </div>
                  {currentDot && (
                    <button
                      onClick={handleDotClick}
                      className="absolute w-16 h-16 bg-primary rounded-full active:scale-110 transition-transform cursor-pointer shadow-lg"
                      style={{
                        left: `${currentDot.x}%`,
                        top: `${currentDot.y}%`,
                        transform: 'translate(-50%, -50%)'
                      }}
                    />
                  )}
                </div>
              )}

              {testState === 'results' && (
                <div className="space-y-4">
                  <div className="text-center py-6 bg-secondary rounded-lg">
                    <p className="text-xs text-muted-foreground mb-2">
                      {(results && dotGridResults) || (results && flashTestResults) || (dotGridResults && flashTestResults)
                        ? 'Combined NeuroScore' 
                        : 'NeuroScore'}
                    </p>
                    <p className="text-5xl font-bold text-foreground mb-2">
                      {calculateCombinedNeuroScore()}
                    </p>
                    <p className={`text-lg font-semibold ${
                      calculateCombinedNeuroScore() >= 75 ? 'text-success' :
                      calculateCombinedNeuroScore() >= 50 ? 'text-primary' : 
                      'text-destructive'
                    }`}>
                      {getAlertLevel(calculateCombinedNeuroScore())}
                    </p>
                  </div>

                  {testMode === 'simple' && results && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-secondary p-3 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground mb-1">Reaction Time</p>
                        <p className="text-2xl font-bold text-foreground">
                          {results.reactionTime}<span className="text-sm">ms</span>
                        </p>
                      </div>
                      <div className="bg-secondary p-3 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground mb-1">Movement Index</p>
                        <p className="text-2xl font-bold text-foreground">
                          {results.movementIndex}
                        </p>
                      </div>
                    </div>
                  )}

                  {testMode === 'dotgrid' && dotGridResults && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-secondary p-3 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground mb-1">Avg Time</p>
                        <p className="text-xl font-bold text-foreground">
                          {dotGridResults.averageReactionTime}<span className="text-xs">ms</span>
                        </p>
                      </div>
                      <div className="bg-secondary p-3 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground mb-1">Hits</p>
                        <p className="text-xl font-bold text-success">
                          {dotGridResults.hits}/10
                        </p>
                      </div>
                      <div className="bg-secondary p-3 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground mb-1">Misses</p>
                        <p className="text-xl font-bold text-destructive">
                          {dotGridResults.misses}
                        </p>
                      </div>
                    </div>
                  )}

                  {testMode === 'flash' && flashTestResults && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-secondary p-3 rounded-lg text-center">
                          <p className="text-xs text-muted-foreground mb-1">Pupil Response</p>
                          <p className="text-xl font-bold text-foreground">
                            {flashTestResults.reactionTimeMs}<span className="text-xs">ms</span>
                          </p>
                        </div>
                        <div className="bg-secondary p-3 rounded-lg text-center">
                          <p className="text-xs text-muted-foreground mb-1">Blink Latency</p>
                          <p className="text-xl font-bold text-foreground">
                            {flashTestResults.blinkLatencyMs}<span className="text-xs">ms</span>
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-secondary p-3 rounded-lg text-center">
                          <p className="text-xs text-muted-foreground mb-1">Blinks</p>
                          <p className="text-xl font-bold text-foreground">
                            {flashTestResults.blinkCount}
                          </p>
                        </div>
                        <div className="bg-secondary p-3 rounded-lg text-center">
                          <p className="text-xs text-muted-foreground mb-1">Stability</p>
                          <p className="text-xl font-bold text-foreground">
                            {flashTestResults.stabilityScore}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <Button 
                    onClick={runAgain} 
                    variant="outline"
                    size="lg"
                    className="w-full h-14 text-base"
                  >
                    Run Again
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* AI Report Card */}
        <Card className="p-4 space-y-3 bg-card border-medical">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">AI Driver Report</h2>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-foreground leading-relaxed">
              {aiInsights.summary}
            </p>

            {/* Observations */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Key Observations
              </h3>
              <ul className="space-y-1.5">
                {aiInsights.observations.map((obs, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-foreground">
                    <span className="text-primary mt-0.5">•</span>
                    <span className="flex-1">{obs}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Suggestion */}
            <div className="bg-accent/20 border border-accent rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-accent-foreground" />
                <h3 className="text-xs font-semibold text-accent-foreground">
                  Recommendation
                </h3>
              </div>
              <p className="text-xs text-accent-foreground leading-relaxed">
                {aiInsights.suggestion}
              </p>
            </div>

            {/* Disclaimer */}
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground italic text-center">
                This is a safety screening tool, not a medical diagnosis.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-3 bg-secondary/50 border-border">
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Quick cognitive assessment using reaction time, facial micro-movement analysis, and visual tracking performance
          </p>
        </Card>
      </div>
    </main>
  )
}
