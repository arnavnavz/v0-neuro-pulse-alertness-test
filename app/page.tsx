'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Activity, Video, Brain, AlertCircle, Zap, Eye, X, History, BarChart3, TrendingUp, Info } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from 'recharts'
import { storage, StoredTestResult } from '@/lib/storage'
import { format } from 'date-fns'

type TestState = 'idle' | 'preparing' | 'flash' | 'results' | 'flashInstruction' | 'flashActive'
type TestMode = 'simple' | 'dotgrid' | 'flash'
type ViewMode = 'test' | 'history' | 'analytics'

interface FatigueMetrics {
  averageReactionTime: number
  reactionTimeVariability: number
  standardDeviation: number
  lapses: number
  falseStarts: number
  errorRate: number
  interpretation: string
}

interface TestResults {
  reactionTime: number
  movementIndex: number
  neuroScore: number
  alertLevel: string
  fatigueMetrics: FatigueMetrics
  videoAnalysis?: VideoAnalysis
}

interface DotGridResults {
  averageReactionTime: number
  hits: number
  misses: number
  dotScore: number
  fatigueMetrics: FatigueMetrics
  videoAnalysis?: VideoAnalysis
}

interface FlashTestResults {
  reactionTimeMs: number
  blinkLatencyMs: number
  blinkCount: number
  stabilityScore: number
  fatigueLevel: string
  fatigueScore: number
  fatigueMetrics: FatigueMetrics
  videoAnalysis?: VideoAnalysis
}

interface DotPosition {
  x: number
  y: number
  timestamp: number
}

interface VideoAnalysis {
  totalFrames: number
  averageMovement: number
  peakMovement: number
  movementVariability: number
  blinkCount: number
  eyeClosureDuration: number
  headMovement: number
  attentionScore: number
  microExpressions: number
}

export default function NeuroPulsePage() {
  const [viewMode, setViewMode] = useState<ViewMode>('test')
  const [testMode, setTestMode] = useState<TestMode>('simple')
  const [testState, setTestState] = useState<TestState>('idle')
  const [results, setResults] = useState<TestResults | null>(null)
  const [dotGridResults, setDotGridResults] = useState<DotGridResults | null>(null)
  const [flashTestResults, setFlashTestResults] = useState<FlashTestResults | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [countdown, setCountdown] = useState<string>('')
  const [flashSequenceCount, setFlashSequenceCount] = useState<number>(0)
  const [isMobile, setIsMobile] = useState<boolean>(false)
  const [testHistory, setTestHistory] = useState<StoredTestResult[]>([])
  const [selectedTests, setSelectedTests] = useState<string[]>([])
  
  // Session state - tracks current test session
  const [currentSession, setCurrentSession] = useState<{
    simple: TestResults | null
    dotgrid: DotGridResults | null
    flash: FlashTestResults | null
  }>({
    simple: null,
    dotgrid: null,
    flash: null
  })
  const [sessionInProgress, setSessionInProgress] = useState<boolean>(false)
  
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const videoAnalysisRef = useRef<{
    frames: ImageData[]
    timestamps: number[]
    movementData: number[]
  } | null>(null)
  const frameAnalysisIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
    }
    checkMobile()
  }, [])

  // Load test history on mount
  useEffect(() => {
    setTestHistory(storage.getTestHistory())
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

  // Wait for video to be ready with valid dimensions
  const waitForVideoReady = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!videoRef.current) {
        resolve(false)
        return
      }
      
      const video = videoRef.current
      
      // If video already has dimensions, resolve immediately
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        resolve(true)
        return
      }
      
      // Wait for loadedmetadata event
      const onLoadedMetadata = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          video.removeEventListener('loadedmetadata', onLoadedMetadata)
          resolve(true)
        }
      }
      
      // Timeout after 3 seconds
      const timeout = setTimeout(() => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata)
        resolve(false)
      }, 3000)
      
      video.addEventListener('loadedmetadata', () => {
        clearTimeout(timeout)
        onLoadedMetadata()
      })
      
      // If video is already playing, trigger check
      if (video.readyState >= 1) {
        setTimeout(() => {
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            clearTimeout(timeout)
            video.removeEventListener('loadedmetadata', onLoadedMetadata)
            resolve(true)
          }
        }, 100)
      }
    })
  }

  // Capture frame from video
  const captureFrame = (): ImageData | null => {
    if (!videoRef.current || !canvasRef.current) return null
    
    const canvas = canvasRef.current
    const video = videoRef.current
    const ctx = canvas.getContext('2d')
    
    if (!ctx) return null
    
    // Check if video has valid dimensions
    const videoWidth = video.videoWidth || 0
    const videoHeight = video.videoHeight || 0
    
    // Ensure we have valid dimensions
    if (videoWidth === 0 || videoHeight === 0) {
      console.warn('Video dimensions are zero, cannot capture frame')
      return null
    }
    
    canvas.width = videoWidth
    canvas.height = videoHeight
    ctx.drawImage(video, 0, 0, videoWidth, videoHeight)
    
    // Double-check canvas dimensions before getting image data
    if (canvas.width === 0 || canvas.height === 0) {
      console.warn('Canvas dimensions are zero, cannot capture frame')
      return null
    }
    
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  }

  // Start video recording
  const startVideoRecording = () => {
    if (!stream || !videoRef.current) return
    
    try {
      recordedChunksRef.current = []
      videoAnalysisRef.current = {
        frames: [],
        timestamps: [],
        movementData: []
      }
      
      // Try different mimeTypes for browser compatibility
      let options: MediaRecorderOptions = {}
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
      ]
      
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          options = { mimeType }
          break
        }
      }
      
      const mediaRecorder = new MediaRecorder(stream, options)
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.start(100) // Collect data every 100ms
      mediaRecorderRef.current = mediaRecorder
      
      // Start frame analysis
      startFrameAnalysis()
    } catch (err) {
      console.error('Error starting video recording:', err)
      // Still start frame analysis even if recording fails
      videoAnalysisRef.current = {
        frames: [],
        timestamps: [],
        movementData: []
      }
      startFrameAnalysis()
    }
  }

  // Stop video recording and analyze
  const stopVideoRecording = async (): Promise<VideoAnalysis | null> => {
    // Stop frame analysis interval
    if (frameAnalysisIntervalRef.current) {
      clearInterval(frameAnalysisIntervalRef.current)
      frameAnalysisIntervalRef.current = null
    }
    
    if (!mediaRecorderRef.current) {
      // If no recorder but we have analysis data, analyze it
      if (videoAnalysisRef.current && videoAnalysisRef.current.frames.length > 0) {
        return analyzeVideoFrames()
      }
      return null
    }
    
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!
      
      mediaRecorder.onstop = async () => {
        // Analyze captured frames
        const analysis = analyzeVideoFrames()
        resolve(analysis)
      }
      
      try {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop()
        } else {
          // Already stopped, analyze immediately
          const analysis = analyzeVideoFrames()
          resolve(analysis)
        }
      } catch (err) {
        console.error('Error stopping recorder:', err)
        // Analyze anyway
        const analysis = analyzeVideoFrames()
        resolve(analysis)
      }
      
      mediaRecorderRef.current = null
    })
  }

  // Start frame analysis during recording
  const startFrameAnalysis = () => {
    if (!videoRef.current || !canvasRef.current) return
    
    // Clear any existing interval
    if (frameAnalysisIntervalRef.current) {
      clearInterval(frameAnalysisIntervalRef.current)
    }
    
    frameAnalysisIntervalRef.current = setInterval(() => {
      if (!mediaRecorderRef.current || (mediaRecorderRef.current.state !== 'recording' && mediaRecorderRef.current.state !== 'paused')) {
        if (frameAnalysisIntervalRef.current) {
          clearInterval(frameAnalysisIntervalRef.current)
          frameAnalysisIntervalRef.current = null
        }
        return
      }
      
      const frame = captureFrame()
      if (frame && videoAnalysisRef.current) {
        videoAnalysisRef.current.frames.push(frame)
        videoAnalysisRef.current.timestamps.push(performance.now())
        
        // Calculate movement if we have previous frame
        if (videoAnalysisRef.current.frames.length > 1) {
          const prevFrame = videoAnalysisRef.current.frames[videoAnalysisRef.current.frames.length - 2]
          const movement = calculateMovementIndex(prevFrame, frame)
          videoAnalysisRef.current.movementData.push(movement)
        }
      }
    }, 100) // Capture frame every 100ms
  }

  // Analyze all captured video frames
  const analyzeVideoFrames = (): VideoAnalysis => {
    const analysis = videoAnalysisRef.current
    if (!analysis || analysis.frames.length === 0) {
      return {
        totalFrames: 0,
        averageMovement: 0,
        peakMovement: 0,
        movementVariability: 0,
        blinkCount: 0,
        eyeClosureDuration: 0,
        headMovement: 0,
        attentionScore: 0,
        microExpressions: 0
      }
    }
    
    const frames = analysis.frames
    const movementData = analysis.movementData
    
    // Calculate movement metrics
    const averageMovement = movementData.length > 0
      ? Math.round(movementData.reduce((a, b) => a + b, 0) / movementData.length)
      : 0
    const peakMovement = movementData.length > 0
      ? Math.max(...movementData)
      : 0
    const movementVariability = movementData.length > 0
      ? Math.round(Math.sqrt(
          movementData.reduce((sum, m) => sum + Math.pow(m - averageMovement, 2), 0) / movementData.length
        ))
      : 0
    
    // Detect blinks (simplified: look for sudden drops in brightness in eye region)
    let blinkCount = 0
    let eyeClosureDuration = 0
    if (frames.length > 10) {
      // Analyze middle region (where eyes typically are)
      const eyeRegionBrightness: number[] = []
      frames.forEach((frame, idx) => {
        if (frame && frame.data.length > 0) {
          // Sample middle region (approximate eye area)
          let brightness = 0
          const sampleCount = Math.min(1000, frame.data.length / 4)
          for (let i = 0; i < sampleCount; i++) {
            const pixelIdx = Math.floor((frame.data.length / 4) * 0.4 + (i * 0.2)) * 4
            if (pixelIdx < frame.data.length - 3) {
              brightness += (frame.data[pixelIdx] + frame.data[pixelIdx + 1] + frame.data[pixelIdx + 2]) / 3
            }
          }
          eyeRegionBrightness.push(brightness / sampleCount)
        }
      })
      
      // Detect blinks as sudden drops in brightness
      for (let i = 1; i < eyeRegionBrightness.length; i++) {
        const drop = eyeRegionBrightness[i - 1] - eyeRegionBrightness[i]
        if (drop > 30) { // Significant brightness drop
          blinkCount++
          eyeClosureDuration += 100 // 100ms per frame
        }
      }
    }
    
    // Calculate head movement (variance in movement patterns)
    const headMovement = movementVariability
    
    // Calculate attention score (inverse of movement and variability)
    const attentionScore = Math.max(0, Math.min(100, 100 - (averageMovement * 0.5) - (movementVariability * 0.3)))
    
    // Detect micro-expressions (rapid small movements)
    let microExpressions = 0
    if (movementData.length > 5) {
      for (let i = 2; i < movementData.length - 2; i++) {
        const localVariance = Math.abs(movementData[i] - movementData[i - 1]) + 
                             Math.abs(movementData[i] - movementData[i + 1])
        if (localVariance > 10 && movementData[i] < 30) {
          microExpressions++
        }
      }
    }
    
    return {
      totalFrames: frames.length,
      averageMovement,
      peakMovement,
      movementVariability,
      blinkCount,
      eyeClosureDuration,
      headMovement,
      attentionScore: Math.round(attentionScore),
      microExpressions
    }
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

  // Calculate PVT-based fatigue metrics
  const calculateFatigueMetrics = (
    reactionTimes: number[],
    misses: number = 0,
    totalAttempts: number = 0
  ): FatigueMetrics => {
    if (reactionTimes.length === 0) {
      return {
        averageReactionTime: 0,
        reactionTimeVariability: 0,
        standardDeviation: 0,
        lapses: 0,
        falseStarts: 0,
        errorRate: 0,
        interpretation: 'No data available'
      }
    }

    const avgRT = reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
    
    // Calculate standard deviation
    const variance = reactionTimes.reduce((sum, rt) => sum + Math.pow(rt - avgRT, 2), 0) / reactionTimes.length
    const stdDev = Math.sqrt(variance)
    
    // RT Variability (same as SD for PVT)
    const rtVariability = stdDev
    
    // Lapses: reaction times > 500ms (PVT standard threshold)
    const lapses = reactionTimes.filter(rt => rt > 500).length
    
    // False Starts: reaction times < 200ms (anticipation threshold)
    const falseStarts = reactionTimes.filter(rt => rt < 200).length
    
    // Error Rate: (misses + false starts) / total attempts * 100
    const totalErrors = misses + falseStarts
    const totalAttemptsCount = totalAttempts || reactionTimes.length + misses
    const errorRate = totalAttemptsCount > 0 ? (totalErrors / totalAttemptsCount) * 100 : 0
    
    // Generate interpretation based on thresholds
    let interpretation = ''
    if (rtVariability < 50 && lapses === 0 && falseStarts === 0) {
      interpretation = 'Low variability and no lapses → high alertness.'
    } else if (lapses >= 1 && lapses <= 2) {
      interpretation = 'Multiple lapses detected → moderate fatigue.'
    } else if (rtVariability > 100 || lapses > 2 || avgRT > 400) {
      interpretation = 'High variability and slow reactions → strong fatigue signal.'
    } else if (falseStarts > 0) {
      interpretation = 'Anticipatory responses detected → possible attention issues.'
    } else {
      interpretation = 'Normal performance with minor variations.'
    }
    
    return {
      averageReactionTime: Math.round(avgRT),
      reactionTimeVariability: Math.round(rtVariability),
      standardDeviation: Math.round(stdDev),
      lapses,
      falseStarts,
      errorRate: Math.round(errorRate * 10) / 10, // Round to 1 decimal
      interpretation
    }
  }

  const calculateCombinedNeuroScore = (): number => {
    const scores: number[] = []
    // Use current session results if available, otherwise use current test results
    const simpleScore = currentSession.simple?.neuroScore || results?.neuroScore
    const dotGridScore = currentSession.dotgrid?.dotScore || dotGridResults?.dotScore
    const flashScore = currentSession.flash?.fatigueScore || flashTestResults?.fatigueScore
    
    if (simpleScore !== undefined) scores.push(simpleScore)
    if (dotGridScore !== undefined) scores.push(dotGridScore)
    if (flashScore !== undefined) scores.push(flashScore)
    
    // Need at least Simple and Dot Grid for a valid combined score
    if (scores.length < 2) return 0
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
    // Start video recording for flash test
    startVideoRecording()
    
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

  const finishFlashTest = async () => {
    // Stop video recording and analyze
    const videoAnalysis = await stopVideoRecording()
    
    // Mock results (in production, this would come from backend analysis)
    const reactionTimeMs = Math.round(220 + Math.random() * 150)
    const blinkLatencyMs = Math.round(180 + Math.random() * 100)
    const blinkCount = Math.floor(2 + Math.random() * 3)
    const stabilityScore = Math.round(70 + Math.random() * 25)
    let fatigueScore = Math.round(65 + Math.random() * 25)
    
    // Use video analysis blink count if available
    const finalBlinkCount = videoAnalysis?.blinkCount || blinkCount
    
    // Create reaction times array from flash test data (3 flashes)
    // Use pupil response time and blink latency as reaction time proxies
    const flashReactionTimes = [
      reactionTimeMs,
      blinkLatencyMs,
      reactionTimeMs + (Math.random() * 50 - 25) // Slight variation for 3rd flash
    ]
    
    // Calculate fatigue metrics from flash reaction times
    // For flash test, misses = 0 (all flashes detected), but we can use blink count as error indicator
    const fatigueMetrics = calculateFatigueMetrics(flashReactionTimes, 0, 3)
    
    // Adjust fatigue score based on metrics and video analysis
    if (fatigueMetrics.lapses > 0) fatigueScore -= 15
    if (fatigueMetrics.falseStarts > 0) fatigueScore -= 10
    if (fatigueMetrics.reactionTimeVariability > 100) fatigueScore -= 10
    if (videoAnalysis) {
      // Adjust based on video analysis
      if (videoAnalysis.attentionScore < 50) fatigueScore -= 10
      if (videoAnalysis.averageMovement > 50) fatigueScore -= 5
    }
    fatigueScore = Math.max(0, Math.min(100, fatigueScore))
    
    let fatigueLevel = 'Normal'
    if (fatigueScore >= 75) {
      fatigueLevel = 'Fresh'
    } else if (fatigueScore < 50) {
      fatigueLevel = 'Fatigued'
    }
    
    const mockResults: FlashTestResults = {
      reactionTimeMs,
      blinkLatencyMs,
      blinkCount: finalBlinkCount,
      stabilityScore,
      fatigueLevel,
      fatigueScore,
      fatigueMetrics,
      videoAnalysis: videoAnalysis || undefined
    }
    
    setFlashTestResults(mockResults)
    
    // Save to current session
    const updatedSession = { ...currentSession, flash: mockResults }
    setCurrentSession(updatedSession)
    setSessionInProgress(true)
    
    // Check if session is complete and save (Simple + Dot Grid required, Flash optional)
    if (updatedSession.simple && updatedSession.dotgrid) {
      const combinedScore = calculateCombinedNeuroScore()
      storage.saveTestSession({
        simple: updatedSession.simple,
        dotgrid: updatedSession.dotgrid,
        flash: updatedSession.flash || undefined
      }, combinedScore)
      setTestHistory(storage.getTestHistory())
      setSessionInProgress(false)
    }
    
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

  const finishDotGridTest = async () => {
    // Stop video recording and analyze
    const videoAnalysis = await stopVideoRecording()
    
    const avgReactionTime = dotReactionTimes.length > 0
      ? Math.round(dotReactionTimes.reduce((a, b) => a + b, 0) / dotReactionTimes.length)
      : 0
    
    const hits = dotReactionTimes.length
    const misses = dotMisses
    const totalAttempts = hits + misses
    
    // Calculate DotScore (0-100)
    let dotScore = 100
    
    // Penalize for slow average reaction time
    if (avgReactionTime > 800) dotScore -= 40
    else if (avgReactionTime > 600) dotScore -= 25
    else if (avgReactionTime > 400) dotScore -= 10
    
    // Penalize for misses
    dotScore -= misses * 8
    
    dotScore = Math.max(0, Math.min(100, dotScore))
    
    // Calculate fatigue metrics
    const fatigueMetrics = calculateFatigueMetrics(dotReactionTimes, misses, totalAttempts)
    
    const testResults = {
      averageReactionTime: avgReactionTime,
      hits,
      misses,
      dotScore: Math.round(dotScore),
      fatigueMetrics,
      videoAnalysis: videoAnalysis || undefined
    }
    
    setDotGridResults(testResults)
    
    // Save to current session
    const updatedSession = { ...currentSession, dotgrid: testResults }
    setCurrentSession(updatedSession)
    setSessionInProgress(true)
    
    // Check if session is complete and save (Simple + Dot Grid required, Flash optional)
    if (updatedSession.simple && updatedSession.dotgrid) {
      const combinedScore = calculateCombinedNeuroScore()
      storage.saveTestSession({
        simple: updatedSession.simple,
        dotgrid: updatedSession.dotgrid,
        flash: updatedSession.flash || undefined
      }, combinedScore)
      setTestHistory(storage.getTestHistory())
      setSessionInProgress(false)
    }
    
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
    
    // Start video recording
    startVideoRecording()
    
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
      
      setTimeout(async () => {
        clearInterval(countdownInterval)
        setCountdown('')
        
        // Wait for video to be ready before capturing
        const isReady = await waitForVideoReady()
        if (isReady) {
          // Capture "before" frame
          beforeFrameRef.current = captureFrame()
        } else {
          console.warn('Video not ready, capturing frame anyway')
          beforeFrameRef.current = captureFrame()
        }
        
        // Show GO!
        setTestState('flash')
        startTimeRef.current = performance.now()
      }, delay)
    }
  }

  // Handle user reaction
  const handleReaction = async () => {
    if (testState !== 'flash') return
    
    const reactionTime = Math.round(performance.now() - startTimeRef.current)
    
    // Stop video recording and analyze
    const videoAnalysis = await stopVideoRecording()
    
    // Capture "after" frame
    const afterFrame = captureFrame()
    
    // Calculate movement
    const movement = beforeFrameRef.current && afterFrame 
      ? calculateMovementIndex(beforeFrameRef.current, afterFrame)
      : 0
    
    // Calculate scores
    const neuroScore = calculateNeuroScore(reactionTime, movement)
    const alertLevel = getAlertLevel(neuroScore)
    
    // Calculate fatigue metrics (single reaction time for simple test)
    const fatigueMetrics = calculateFatigueMetrics([reactionTime], 0, 1)
    
    const testResults = {
      reactionTime,
      movementIndex: movement,
      neuroScore,
      alertLevel,
      fatigueMetrics,
      videoAnalysis: videoAnalysis || undefined
    }
    
    setResults(testResults)
    
    // Save to current session
    const updatedSession = { ...currentSession, simple: testResults }
    setCurrentSession(updatedSession)
    setSessionInProgress(true)
    
    // Check if session is complete and save (Simple + Dot Grid required, Flash optional)
    if (updatedSession.simple && updatedSession.dotgrid) {
      const combinedScore = calculateCombinedNeuroScore()
      storage.saveTestSession({
        simple: updatedSession.simple,
        dotgrid: updatedSession.dotgrid,
        flash: updatedSession.flash || undefined
      }, combinedScore)
      setTestHistory(storage.getTestHistory())
      setSessionInProgress(false)
    }
    
    setTestState('results')
  }
  
  // Function to check and save session if complete (Simple + Dot Grid required, Flash optional)
  const checkAndSaveSession = () => {
    if (currentSession.simple && currentSession.dotgrid) {
      const combinedScore = calculateCombinedNeuroScore()
      storage.saveTestSession({
        simple: currentSession.simple,
        dotgrid: currentSession.dotgrid,
        flash: currentSession.flash || undefined
      }, combinedScore)
      setTestHistory(storage.getTestHistory())
      setSessionInProgress(false)
    }
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
  
  // Start a new test session
  const startNewSession = () => {
    setCurrentSession({ simple: null, dotgrid: null, flash: null })
    setSessionInProgress(false)
    setResults(null)
    setDotGridResults(null)
    setFlashTestResults(null)
    setTestMode('simple')
    setTestState('idle')
  }
  
  // Get next test to complete (Flash is optional)
  const getNextTest = (): TestMode | null => {
    if (!currentSession.simple) return 'simple'
    if (!currentSession.dotgrid) return 'dotgrid'
    // Flash is optional - only suggest if mobile and not completed
    if (!currentSession.flash && isMobile) return 'flash'
    return null
  }
  
  // Check if session can be saved (Simple + Dot Grid required)
  const canSaveSession = (): boolean => {
    return currentSession.simple !== null && currentSession.dotgrid !== null
  }

  useEffect(() => {
    return () => {
      if (dotTimeoutRef.current) {
        clearTimeout(dotTimeoutRef.current)
      }
      if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current)
      }
      if (frameAnalysisIntervalRef.current) {
        clearInterval(frameAnalysisIntervalRef.current)
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop()
        } catch (err) {
          console.error('Error stopping recorder on cleanup:', err)
        }
      }
    }
  }, [])

  const generateAIInsights = () => {
    const combinedScore = calculateCombinedNeuroScore()
    // Use session results if available
    const hasSimple = currentSession.simple !== null || results !== null
    const hasDotGrid = currentSession.dotgrid !== null || dotGridResults !== null
    const hasFlash = currentSession.flash !== null || flashTestResults !== null
    
    const simpleData = currentSession.simple || results
    const dotGridData = currentSession.dotgrid || dotGridResults
    const flashData = currentSession.flash || flashTestResults
    
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
        hasSimple ? `Quick reaction time (${simpleData?.reactionTime}ms) within optimal range` : "",
        hasDotGrid ? `Strong visual tracking with ${dotGridData?.hits}/10 hits` : "",
        hasFlash ? `Sharp pupil response (${flashData?.reactionTimeMs}ms) indicates alertness` : "",
        "Minimal movement index suggests stable focus"
      ].filter(Boolean)
      suggestion = "You are clear to drive. Maintain regular breaks every 2-3 hours."
    } else if (combinedScore >= 50) {
      summary = "Your NeuroScore shows normal alertness levels with minor variations. Performance is adequate but may benefit from brief rest."
      observations = [
        hasSimple ? "Reaction time slightly slower than peak performance" : "",
        hasDotGrid ? `Moderate tracking accuracy (${dotGridData?.hits}/10 targets)` : "",
        hasFlash ? `Pupil reactivity shows ${flashData?.blinkCount} blinks detected` : "",
        "Some indicators of mild cognitive load"
      ].filter(Boolean)
      suggestion = "Consider a 10-minute break and hydration before extended driving."
    } else {
      summary = "Your NeuroScore indicates cognitive fatigue and reduced alertness. This presents a safety risk for commercial driving operations."
      observations = [
        hasSimple ? `Delayed reaction time (${simpleData?.reactionTime}ms) exceeds safe threshold` : "",
        hasDotGrid ? `Lower tracking performance with ${dotGridData?.misses} missed targets` : "",
        hasFlash ? `Slower pupil response and ${flashData?.blinkCount} blinks suggest fatigue` : "",
        "Movement patterns suggest reduced engagement"
      ].filter(Boolean)
      suggestion = "Take a 15-30 minute break before starting any drive. Consider rest or shift adjustment."
    }
    
    return { summary, observations, suggestion }
  }

  const aiInsights = generateAIInsights()

  // Generate GPT-powered analytics insights
  const generateAnalyticsInsights = () => {
    if (testHistory.length === 0) {
      return {
        summary: "No historical data available yet. Complete test sessions to see AI-powered trend analysis.",
        trends: [],
        patterns: [],
        recommendations: []
      }
    }

    const recentTests = testHistory.slice(0, 10) // Last 10 tests
    const allScores = testHistory.map(t => t.combinedScore)
    const avgScore = allScores.reduce((a, b) => a + b, 0) / allScores.length
    const recentAvg = recentTests.map(t => t.combinedScore).reduce((a, b) => a + b, 0) / recentTests.length
    
    // Calculate trends
    const scoreTrend = recentAvg > avgScore ? 'improving' : recentAvg < avgScore ? 'declining' : 'stable'
    const scoreChange = Math.abs(recentAvg - avgScore)
    
    // Analyze reaction times
    const allSimpleRTs = testHistory.map(t => t.results.simple.fatigueMetrics.averageReactionTime)
    const allDotGridRTs = testHistory.map(t => t.results.dotgrid.fatigueMetrics.averageReactionTime)
    const avgSimpleRT = allSimpleRTs.reduce((a, b) => a + b, 0) / allSimpleRTs.length
    const avgDotGridRT = allDotGridRTs.reduce((a, b) => a + b, 0) / allDotGridRTs.length
    
    // Analyze lapses
    const totalLapses = testHistory.reduce((sum, t) => 
      sum + t.results.simple.fatigueMetrics.lapses + t.results.dotgrid.fatigueMetrics.lapses + (t.results.flash?.fatigueMetrics.lapses || 0), 0
    )
    const avgLapsesPerSession = totalLapses / testHistory.length
    
    // Analyze variability
    const allVariabilities = testHistory.flatMap(t => [
      t.results.simple.fatigueMetrics.reactionTimeVariability,
      t.results.dotgrid.fatigueMetrics.reactionTimeVariability
    ])
    const avgVariability = allVariabilities.reduce((a, b) => a + b, 0) / allVariabilities.length
    
    // Detect patterns
    const patterns: string[] = []
    if (avgLapsesPerSession > 2) {
      patterns.push(`High lapse frequency detected (${avgLapsesPerSession.toFixed(1)} per session) - indicates potential chronic fatigue`)
    }
    if (avgVariability > 100) {
      patterns.push(`Elevated reaction time variability (${Math.round(avgVariability)}ms) - suggests inconsistent alertness levels`)
    }
    if (scoreTrend === 'declining' && scoreChange > 10) {
      patterns.push(`Significant performance decline detected (${Math.round(scoreChange)} point drop) - may indicate cumulative fatigue`)
    }
    if (avgSimpleRT > 400 || avgDotGridRT > 500) {
      patterns.push(`Slower than optimal reaction times - Simple: ${Math.round(avgSimpleRT)}ms, Dot Grid: ${Math.round(avgDotGridRT)}ms`)
    }
    
    // Generate insights
    let summary = ""
    if (scoreTrend === 'improving' && scoreChange > 5) {
      summary = `Your cognitive performance shows an improving trend. Recent sessions average ${Math.round(recentAvg)} points, up ${Math.round(scoreChange)} points from your overall average. This suggests effective rest and recovery.`
    } else if (scoreTrend === 'declining' && scoreChange > 5) {
      summary = `Performance analysis indicates a declining trend. Recent sessions average ${Math.round(recentAvg)} points, down ${Math.round(scoreChange)} points from baseline. This may signal accumulating fatigue or need for extended rest.`
    } else {
      summary = `Your performance remains relatively stable with an average NeuroScore of ${Math.round(avgScore)}. Recent sessions show ${scoreTrend} performance patterns.`
    }
    
    const trends: string[] = [
      `Average combined score: ${Math.round(avgScore)}/100 (${scoreTrend} trend)`,
      `Simple test average RT: ${Math.round(avgSimpleRT)}ms`,
      `Dot Grid test average RT: ${Math.round(avgDotGridRT)}ms`,
      `Average lapses per session: ${avgLapsesPerSession.toFixed(1)}`,
      `Average RT variability: ${Math.round(avgVariability)}ms`
    ]
    
    const recommendations: string[] = []
    if (avgScore < 50) {
      recommendations.push("Consider scheduling a comprehensive rest period before operating commercial vehicles")
    } else if (avgScore < 75) {
      recommendations.push("Maintain regular breaks every 2-3 hours during driving shifts")
    }
    if (avgLapsesPerSession > 1) {
      recommendations.push("High lapse frequency detected - prioritize sleep quality and duration")
    }
    if (avgVariability > 80) {
      recommendations.push("Inconsistent performance suggests irregular sleep patterns - establish consistent sleep schedule")
    }
    if (scoreTrend === 'declining') {
      recommendations.push("Declining trend observed - consider shift adjustments or extended recovery time")
    }
    if (recommendations.length === 0) {
      recommendations.push("Continue current rest and recovery practices - performance metrics are within healthy ranges")
    }
    
    return { summary, trends, patterns, recommendations }
  }

  const analyticsInsights = generateAnalyticsInsights()

  // Calculate summary statistics
  const calculateSummaryStats = () => {
    if (testHistory.length === 0) return null
    
    const allScores = testHistory.map(t => t.combinedScore)
    const allSimpleRTs = testHistory.map(t => t.results.simple.fatigueMetrics.averageReactionTime)
    const allDotGridRTs = testHistory.map(t => t.results.dotgrid.fatigueMetrics.averageReactionTime)
    const allVariabilities = testHistory.flatMap(t => [
      t.results.simple.fatigueMetrics.reactionTimeVariability,
      t.results.dotgrid.fatigueMetrics.reactionTimeVariability
    ])
    const allLapses = testHistory.reduce((sum, t) => 
      sum + t.results.simple.fatigueMetrics.lapses + t.results.dotgrid.fatigueMetrics.lapses, 0
    )
    
    return {
      totalSessions: testHistory.length,
      avgScore: Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length),
      bestScore: Math.max(...allScores),
      worstScore: Math.min(...allScores),
      avgSimpleRT: Math.round(allSimpleRTs.reduce((a, b) => a + b, 0) / allSimpleRTs.length),
      avgDotGridRT: Math.round(allDotGridRTs.reduce((a, b) => a + b, 0) / allDotGridRTs.length),
      avgVariability: Math.round(allVariabilities.reduce((a, b) => a + b, 0) / allVariabilities.length),
      totalLapses: allLapses,
      avgLapsesPerSession: (allLapses / testHistory.length).toFixed(1)
    }
  }

  const summaryStats = calculateSummaryStats()

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={0}>
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
        {/* Navigation Tabs */}
        <Card className="p-2 bg-card border-medical">
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant={viewMode === 'test' ? 'default' : 'outline'}
              onClick={() => setViewMode('test')}
              className="h-auto py-2 flex flex-col items-center gap-1"
            >
              <Activity className="w-4 h-4" />
              <span className="text-xs font-medium">Test</span>
            </Button>
            <Button
              variant={viewMode === 'history' ? 'default' : 'outline'}
              onClick={() => setViewMode('history')}
              className="h-auto py-2 flex flex-col items-center gap-1"
            >
              <History className="w-4 h-4" />
              <span className="text-xs font-medium">History</span>
            </Button>
            <Button
              variant={viewMode === 'analytics' ? 'default' : 'outline'}
              onClick={() => setViewMode('analytics')}
              className="h-auto py-2 flex flex-col items-center gap-1"
            >
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-medium">Analytics</span>
            </Button>
          </div>
        </Card>

        {/* History View */}
        {viewMode === 'history' && (
          <div className="space-y-4">
            <Card className="p-4 bg-card border-medical">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Test History</h2>
                {testHistory.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      storage.clearHistory()
                      setTestHistory([])
                      setSelectedTests([])
                    }}
                  >
                    Clear All
                  </Button>
                )}
              </div>
              {testHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No test history yet. Complete a test to see results here.
                </p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {testHistory.map((test) => {
                    return (
                      <Card
                        key={test.id}
                        className={`p-3 cursor-pointer transition-colors ${
                          selectedTests.includes(test.id) ? 'bg-primary/10 border-primary' : ''
                        }`}
                        onClick={() => {
                          setSelectedTests(prev =>
                            prev.includes(test.id)
                              ? prev.filter(id => id !== test.id)
                              : [...prev, test.id]
                          )
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-semibold px-2 py-0.5 bg-primary/20 rounded">
                                Complete Session
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(test.timestamp), 'MMM d, yyyy h:mm a')}
                              </span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-4 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Combined Score: </span>
                                  <span className="font-semibold text-lg">{test.combinedScore}</span>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div className="bg-secondary/50 p-2 rounded">
                                  <p className="font-medium mb-1">Simple Test</p>
                                  <p className="text-muted-foreground">Score: <span className="font-semibold">{test.results.simple.neuroScore}</span></p>
                                  <p className="text-muted-foreground">RT: <span className="font-semibold">{test.results.simple.fatigueMetrics.averageReactionTime}ms</span></p>
                                </div>
                                <div className="bg-secondary/50 p-2 rounded">
                                  <p className="font-medium mb-1">Dot Grid</p>
                                  <p className="text-muted-foreground">Score: <span className="font-semibold">{test.results.dotgrid.dotScore}</span></p>
                                  <p className="text-muted-foreground">Hits: <span className="font-semibold">{test.results.dotgrid.hits}/10</span></p>
                                </div>
                                <div className="bg-secondary/50 p-2 rounded">
                                  <p className="font-medium mb-1">Flash Test</p>
                                  {test.results.flash ? (
                                    <>
                                      <p className="text-muted-foreground">Score: <span className="font-semibold">{test.results.flash.fatigueScore}</span></p>
                                      <p className="text-muted-foreground">Level: <span className="font-semibold">{test.results.flash.fatigueLevel}</span></p>
                                    </>
                                  ) : (
                                    <p className="text-muted-foreground text-xs italic">Not completed</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation()
                              storage.deleteTest(test.id)
                              setTestHistory(storage.getTestHistory())
                              setSelectedTests(prev => prev.filter(id => id !== test.id))
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
            </Card>

            {/* Comparison View */}
            {selectedTests.length > 0 && (
              <Card className="p-4 bg-card border-medical">
                <h2 className="text-lg font-semibold mb-4">
                  Comparison ({selectedTests.length} selected)
                </h2>
                <div className="space-y-4">
                  {selectedTests.map((testId) => {
                    const test = testHistory.find(t => t.id === testId)
                    if (!test) return null
                    return (
                      <div key={testId} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">
                            Session - {format(new Date(test.timestamp), 'MMM d, h:mm a')}
                          </span>
                          <span className="text-lg font-bold">Combined Score: {test.combinedScore}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {/* Simple Test */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold">Simple Test</p>
                            <div className="space-y-1 text-xs">
                              <div>
                                <span className="text-muted-foreground">Score: </span>
                                <span className="font-semibold">{test.results.simple.neuroScore}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Avg RT: </span>
                                <span className="font-semibold">{test.results.simple.fatigueMetrics.averageReactionTime}ms</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Lapses: </span>
                                <span className={`font-semibold ${test.results.simple.fatigueMetrics.lapses > 0 ? 'text-destructive' : ''}`}>
                                  {test.results.simple.fatigueMetrics.lapses}
                                </span>
                              </div>
                            </div>
                          </div>
                          {/* Dot Grid */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold">Dot Grid</p>
                            <div className="space-y-1 text-xs">
                              <div>
                                <span className="text-muted-foreground">Score: </span>
                                <span className="font-semibold">{test.results.dotgrid.dotScore}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Avg RT: </span>
                                <span className="font-semibold">{test.results.dotgrid.fatigueMetrics.averageReactionTime}ms</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Hits: </span>
                                <span className="font-semibold">{test.results.dotgrid.hits}/10</span>
                              </div>
                            </div>
                          </div>
                          {/* Flash Test */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold">Flash Test</p>
                            {test.results.flash ? (
                              <div className="space-y-1 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Score: </span>
                                  <span className="font-semibold">{test.results.flash.fatigueScore}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Avg RT: </span>
                                  <span className="font-semibold">{test.results.flash.fatigueMetrics.averageReactionTime}ms</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Level: </span>
                                  <span className="font-semibold">{test.results.flash.fatigueLevel}</span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">Not completed</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Analytics View */}
        {viewMode === 'analytics' && (
          <div className="space-y-4">
            {testHistory.length === 0 ? (
              <Card className="p-8 bg-card border-medical">
                <p className="text-sm text-muted-foreground text-center">
                  No test data available. Complete tests to see analytics.
                </p>
              </Card>
            ) : (
              <>
                {/* Summary Statistics */}
                {summaryStats && (
                  <Card className="p-4 bg-card border-medical">
                    <h2 className="text-lg font-semibold mb-4">Performance Summary</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-secondary/50 p-3 rounded-lg text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <p className="text-xs text-muted-foreground">Total Sessions</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center">
                                <Info className="w-3 h-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">Total number of test sessions completed. Each session includes Simple and Dot Grid tests (Flash test is optional).</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-2xl font-bold text-foreground">{summaryStats.totalSessions}</p>
                      </div>
                      <div className="bg-secondary/50 p-3 rounded-lg text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <p className="text-xs text-muted-foreground">Avg Score</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center">
                                <Info className="w-3 h-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">Average combined NeuroScore across all sessions. Scores range from 0-100. <strong>Ideal: 75-100</strong> (high alertness).</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-2xl font-bold text-foreground">{summaryStats.avgScore}</p>
                      </div>
                      <div className="bg-secondary/50 p-3 rounded-lg text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <p className="text-xs text-muted-foreground">Best Score</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center">
                                <Info className="w-3 h-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">Highest combined NeuroScore achieved across all test sessions. Indicates peak cognitive performance. <strong>Ideal: 75-100</strong>.</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-2xl font-bold text-success">{summaryStats.bestScore}</p>
                      </div>
                      <div className="bg-secondary/50 p-3 rounded-lg text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <p className="text-xs text-muted-foreground">Worst Score</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center">
                                <Info className="w-3 h-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">Lowest combined NeuroScore across all sessions. Lower scores may indicate fatigue or reduced alertness. <strong>Ideal: 75-100</strong> (avoid scores below 50).</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-2xl font-bold text-destructive">{summaryStats.worstScore}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                      <div className="bg-secondary/50 p-3 rounded-lg text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <p className="text-xs text-muted-foreground">Avg Simple RT</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center">
                                <Info className="w-3 h-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">Average reaction time from Simple Reaction Test. <strong>Ideal: 200-300ms</strong>. Slower times (&gt;400ms) may indicate fatigue.</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-lg font-bold text-foreground">{summaryStats.avgSimpleRT}<span className="text-xs">ms</span></p>
                      </div>
                      <div className="bg-secondary/50 p-3 rounded-lg text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <p className="text-xs text-muted-foreground">Avg Dot Grid RT</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center">
                                <Info className="w-3 h-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">Average reaction time from Dot Grid Test across all 10 rounds. Measures visual tracking and attention. <strong>Ideal: 200-400ms</strong>.</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-lg font-bold text-foreground">{summaryStats.avgDotGridRT}<span className="text-xs">ms</span></p>
                      </div>
                      <div className="bg-secondary/50 p-3 rounded-lg text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <p className="text-xs text-muted-foreground">Avg Variability</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center">
                                <Info className="w-3 h-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">Average reaction time variability (standard deviation). Higher variability indicates inconsistent performance and potential fatigue. <strong>Ideal: &lt;50ms</strong> (lower is better).</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-lg font-bold text-foreground">{summaryStats.avgVariability}<span className="text-xs">ms</span></p>
                      </div>
                      <div className="bg-secondary/50 p-3 rounded-lg text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <p className="text-xs text-muted-foreground">Total Lapses</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center">
                                <Info className="w-3 h-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">Total number of lapses (reaction times &gt;500ms or timeouts). Lapses are a key indicator of cognitive fatigue. <strong>Ideal: 0</strong> (any lapses indicate fatigue risk).</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-lg font-bold text-foreground">{summaryStats.totalLapses}</p>
                        <p className="text-xs text-muted-foreground">({summaryStats.avgLapsesPerSession}/session)</p>
                      </div>
                    </div>
                  </Card>
                )}

                {/* GPT-Powered Analytics Insights */}
                <Card className="p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-4">
                    <Brain className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold">AI-Powered Trend Analysis</h2>
                  </div>
                  <div className="space-y-4">
                    <p className="text-sm text-foreground leading-relaxed">
                      {analyticsInsights.summary}
                    </p>
                    
                    {analyticsInsights.trends.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Key Metrics</h3>
                        <ul className="space-y-1.5">
                          {analyticsInsights.trends.map((trend, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-xs text-foreground">
                              <span className="text-primary mt-0.5">•</span>
                              <span className="flex-1">{trend}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analyticsInsights.patterns.length > 0 && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-2">
                        <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Detected Patterns
                        </h3>
                        <ul className="space-y-1.5">
                          {analyticsInsights.patterns.map((pattern, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-xs text-foreground">
                              <span className="text-amber-600 mt-0.5">⚠</span>
                              <span className="flex-1">{pattern}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analyticsInsights.recommendations.length > 0 && (
                      <div className="bg-accent/20 border border-accent rounded-lg p-3 space-y-2">
                        <h3 className="text-xs font-semibold text-accent-foreground uppercase tracking-wide flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" />
                          Recommendations
                        </h3>
                        <ul className="space-y-1.5">
                          {analyticsInsights.recommendations.map((rec, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-xs text-accent-foreground">
                              <span className="text-accent-foreground mt-0.5">→</span>
                              <span className="flex-1">{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Score Trend */}
                <Card className="p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">Score Trend Over Time</h2>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex items-center">
                          <Info className="w-4 h-4 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">Shows how your combined NeuroScore changes across test sessions. Track improvements or declines in cognitive performance over time. <strong>Ideal: 75-100</strong> consistently.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={testHistory.slice().reverse().map(test => ({
                      date: format(new Date(test.timestamp), 'MMM d'),
                      time: format(new Date(test.timestamp), 'h:mm a'),
                      score: test.combinedScore
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[0, 100]} />
                      <RechartsTooltip />
                      <Legend />
                      <Area type="monotone" dataKey="score" stroke="oklch(0.45 0.15 250)" fill="oklch(0.45 0.15 250)" fillOpacity={0.3} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                {/* Individual Test Scores Comparison */}
                <Card className="p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">Individual Test Scores Over Time</h2>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex items-center">
                          <Info className="w-4 h-4 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">Compares scores from Simple Test, Dot Grid, and Flash Test separately. Helps identify which test type shows the most variation. <strong>Ideal: 75-100</strong> for all test types.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={testHistory.slice().reverse().map(test => ({
                      date: format(new Date(test.timestamp), 'MMM d'),
                      time: format(new Date(test.timestamp), 'h:mm a'),
                      simple: test.results.simple.neuroScore,
                      dotgrid: test.results.dotgrid.dotScore,
                      flash: test.results.flash?.fatigueScore || null
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[0, 100]} />
                      <RechartsTooltip />
                      <Legend />
                      <Line type="monotone" dataKey="simple" stroke="oklch(0.45 0.15 250)" strokeWidth={2} dot={{ r: 4 }} name="Simple Test" />
                      <Line type="monotone" dataKey="dotgrid" stroke="oklch(0.55 0.18 180)" strokeWidth={2} dot={{ r: 4 }} name="Dot Grid" />
                      <Line type="monotone" dataKey="flash" stroke="oklch(0.55 0.22 25)" strokeWidth={2} dot={{ r: 4 }} name="Flash Test" />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                {/* Reaction Time Trend */}
                <Card className="p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">Average Reaction Time Trend</h2>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex items-center">
                          <Info className="w-4 h-4 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">Tracks average reaction times across different test types. Increasing reaction times may indicate accumulating fatigue. <strong>Ideal: 200-300ms</strong> (Simple), <strong>200-400ms</strong> (Dot Grid).</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={testHistory.slice().reverse().map(test => ({
                      date: format(new Date(test.timestamp), 'MMM d'),
                      time: format(new Date(test.timestamp), 'h:mm a'),
                      simple: test.results.simple.fatigueMetrics.averageReactionTime,
                      dotgrid: test.results.dotgrid.fatigueMetrics.averageReactionTime,
                      flash: test.results.flash?.fatigueMetrics.averageReactionTime || null
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Line type="monotone" dataKey="simple" stroke="oklch(0.45 0.15 250)" strokeWidth={2} dot={{ r: 4 }} name="Simple" />
                      <Line type="monotone" dataKey="dotgrid" stroke="oklch(0.55 0.18 180)" strokeWidth={2} dot={{ r: 4 }} name="Dot Grid" />
                      <Line type="monotone" dataKey="flash" stroke="oklch(0.55 0.22 25)" strokeWidth={2} dot={{ r: 4 }} name="Flash" />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                {/* Variability Trend */}
                <Card className="p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">Reaction Time Variability Trend</h2>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex items-center">
                          <Info className="w-4 h-4 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">Shows consistency of reaction times. Higher variability (standard deviation) indicates less consistent performance, often associated with fatigue. <strong>Ideal: &lt;50ms</strong> (lower is better).</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={testHistory.slice().reverse().map(test => ({
                      date: format(new Date(test.timestamp), 'MMM d'),
                      time: format(new Date(test.timestamp), 'h:mm a'),
                      simple: test.results.simple.fatigueMetrics.reactionTimeVariability,
                      dotgrid: test.results.dotgrid.fatigueMetrics.reactionTimeVariability,
                      flash: test.results.flash?.fatigueMetrics.reactionTimeVariability || null
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Line type="monotone" dataKey="simple" stroke="oklch(0.45 0.15 250)" strokeWidth={2} dot={{ r: 4 }} name="Simple" />
                      <Line type="monotone" dataKey="dotgrid" stroke="oklch(0.55 0.18 180)" strokeWidth={2} dot={{ r: 4 }} name="Dot Grid" />
                      <Line type="monotone" dataKey="flash" stroke="oklch(0.55 0.22 25)" strokeWidth={2} dot={{ r: 4 }} name="Flash" />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                {/* Lapses Trend */}
                <Card className="p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">Lapses Over Time</h2>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex items-center">
                          <Info className="w-4 h-4 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">Counts lapses (reaction times &gt;500ms or timeouts) per session. Lapses are the #1 proven indicator of cognitive fatigue in PVT research. <strong>Ideal: 0</strong> per session.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={testHistory.slice().reverse().map(test => ({
                      date: format(new Date(test.timestamp), 'MMM d'),
                      time: format(new Date(test.timestamp), 'h:mm a'),
                      simple: test.results.simple.fatigueMetrics.lapses,
                      dotgrid: test.results.dotgrid.fatigueMetrics.lapses,
                      flash: test.results.flash?.fatigueMetrics.lapses || 0,
                      total: test.results.simple.fatigueMetrics.lapses + test.results.dotgrid.fatigueMetrics.lapses + (test.results.flash?.fatigueMetrics.lapses || 0)
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey="simple" fill="oklch(0.45 0.15 250)" name="Simple" />
                      <Bar dataKey="dotgrid" fill="oklch(0.55 0.18 180)" name="Dot Grid" />
                      <Bar dataKey="flash" fill="oklch(0.55 0.22 25)" name="Flash" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                {/* Error Rate Trend */}
                <Card className="p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">Error Rate Over Time</h2>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex items-center">
                          <Info className="w-4 h-4 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">Percentage of errors (misses, false starts, or delayed responses) per test. Higher error rates indicate attentional drift and potential fatigue. <strong>Ideal: &lt;5%</strong> (lower is better).</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={testHistory.slice().reverse().map(test => ({
                      date: format(new Date(test.timestamp), 'MMM d'),
                      time: format(new Date(test.timestamp), 'h:mm a'),
                      simple: test.results.simple.fatigueMetrics.errorRate,
                      dotgrid: test.results.dotgrid.fatigueMetrics.errorRate,
                      flash: test.results.flash?.fatigueMetrics.errorRate || null
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Line type="monotone" dataKey="simple" stroke="oklch(0.45 0.15 250)" strokeWidth={2} dot={{ r: 4 }} name="Simple" />
                      <Line type="monotone" dataKey="dotgrid" stroke="oklch(0.55 0.18 180)" strokeWidth={2} dot={{ r: 4 }} name="Dot Grid" />
                      <Line type="monotone" dataKey="flash" stroke="oklch(0.55 0.22 25)" strokeWidth={2} dot={{ r: 4 }} name="Flash" />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                {/* False Starts Trend */}
                <Card className="p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">False Starts Over Time</h2>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex items-center">
                          <Info className="w-4 h-4 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">Counts anticipatory responses (reaction times &lt;200ms). False starts indicate impulsive tapping, often due to fatigue or jitter. <strong>Ideal: 0</strong> (any false starts indicate attention issues).</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={testHistory.slice().reverse().map(test => ({
                      date: format(new Date(test.timestamp), 'MMM d'),
                      time: format(new Date(test.timestamp), 'h:mm a'),
                      simple: test.results.simple.fatigueMetrics.falseStarts,
                      dotgrid: test.results.dotgrid.fatigueMetrics.falseStarts,
                      flash: test.results.flash?.fatigueMetrics.falseStarts || 0
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey="simple" fill="oklch(0.45 0.15 250)" name="Simple" />
                      <Bar dataKey="dotgrid" fill="oklch(0.55 0.18 180)" name="Dot Grid" />
                      <Bar dataKey="flash" fill="oklch(0.55 0.22 25)" name="Flash" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                {/* Performance Distribution */}
                <Card className="p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">Score Distribution</h2>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex items-center">
                          <Info className="w-4 h-4 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">Shows how your test sessions are distributed across performance levels: Fatigue (0-49), Normal (50-74), and High Alertness (75-100). <strong>Ideal: Most sessions in 75-100 range</strong>.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={(() => {
                      const ranges = [
                        { range: '0-49', label: 'Fatigue', count: 0 },
                        { range: '50-74', label: 'Normal', count: 0 },
                        { range: '75-100', label: 'High', count: 0 }
                      ]
                      testHistory.forEach(test => {
                        if (test.combinedScore < 50) ranges[0].count++
                        else if (test.combinedScore < 75) ranges[1].count++
                        else ranges[2].count++
                      })
                      return ranges
                    })()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey="count" fill="oklch(0.45 0.15 250)" name="Sessions" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </>
            )}
          </div>
        )}

        {/* Test View */}
        {viewMode === 'test' && (
          <>
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

            {/* Session Progress */}
            {sessionInProgress && (
              <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Test Session Progress</h3>
                  <span className="text-xs text-muted-foreground">
                    {[currentSession.simple, currentSession.dotgrid].filter(Boolean).length}/2 Required
                    {currentSession.flash && ' + Flash'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className={`text-center p-2 rounded ${currentSession.simple ? 'bg-success/20 border border-success' : 'bg-secondary'}`}>
                    <p className="text-xs font-medium">Simple</p>
                    <p className="text-xs text-muted-foreground">{currentSession.simple ? '✓ Done' : 'Required'}</p>
                  </div>
                  <div className={`text-center p-2 rounded ${currentSession.dotgrid ? 'bg-success/20 border border-success' : 'bg-secondary'}`}>
                    <p className="text-xs font-medium">Dot Grid</p>
                    <p className="text-xs text-muted-foreground">{currentSession.dotgrid ? '✓ Done' : 'Required'}</p>
                  </div>
                  <div className={`text-center p-2 rounded ${currentSession.flash ? 'bg-success/20 border border-success' : isMobile ? 'bg-secondary' : 'bg-secondary/50 opacity-60'}`}>
                    <p className="text-xs font-medium">Flash</p>
                    <p className="text-xs text-muted-foreground">
                      {currentSession.flash ? '✓ Done' : isMobile ? 'Optional' : 'Mobile Only'}
                    </p>
                  </div>
                </div>
                {canSaveSession() && !currentSession.flash && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Session can be saved (Flash test is optional)
                  </p>
                )}
              </div>
            )}

            {!sessionInProgress && (
              <div className="text-center py-4">
                <Button
                  onClick={startNewSession}
                  size="lg"
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  Start New Test Session
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Complete Simple and Dot Grid tests (Flash test is optional, mobile only)
                </p>
              </div>
            )}

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
                  disabled={(testState !== 'idle' && testState !== 'results') || (sessionInProgress && currentSession.simple !== null)}
                >
                  <Activity className="w-5 h-5" />
                  <span className="text-xs font-medium">Simple</span>
                  {currentSession.simple && <span className="text-xs text-success">✓</span>}
                </Button>
                <Button
                  variant={testMode === 'dotgrid' ? 'default' : 'outline'}
                  onClick={() => {
                    setTestMode('dotgrid')
                    setTestState('idle')
                  }}
                  className="h-auto py-3 flex flex-col items-center gap-1"
                  disabled={(testState !== 'idle' && testState !== 'results') || (sessionInProgress && currentSession.dotgrid !== null)}
                >
                  <Brain className="w-5 h-5" />
                  <span className="text-xs font-medium">Dot Grid</span>
                  {currentSession.dotgrid && <span className="text-xs text-success">✓</span>}
                </Button>
                <Button
                  variant={testMode === 'flash' ? 'default' : 'outline'}
                  onClick={() => {
                    setTestMode('flash')
                    setTestState('idle')
                  }}
                  className="h-auto py-3 flex flex-col items-center gap-1"
                  disabled={(testState !== 'idle' && testState !== 'results') || (sessionInProgress && currentSession.flash !== null)}
                >
                  <Zap className="w-5 h-5" />
                  <span className="text-xs font-medium">Flash Test</span>
                  {currentSession.flash && <span className="text-xs text-success">✓</span>}
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
                      {canSaveSession()
                        ? currentSession.flash
                          ? 'Combined NeuroScore (All Tests Complete)' 
                          : 'Combined NeuroScore (Simple + Dot Grid)'
                        : (currentSession.simple || currentSession.dotgrid || currentSession.flash)
                        ? `Session Progress: ${[currentSession.simple, currentSession.dotgrid].filter(Boolean).length}/2 Required`
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
                    {canSaveSession() && (
                      <p className="text-xs text-success mt-2 font-medium">
                        ✓ Session Complete - {currentSession.simple && currentSession.dotgrid && currentSession.flash ? 'All tests complete' : 'Saved to History'}
                        {!currentSession.flash && !isMobile && ' (Flash test skipped - mobile only)'}
                      </p>
                    )}
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

                  {/* Fatigue Indicators Section */}
                  {testState === 'results' && (
                    ((testMode === 'simple' && results?.fatigueMetrics) ||
                     (testMode === 'dotgrid' && dotGridResults?.fatigueMetrics) ||
                     (testMode === 'flash' && flashTestResults?.fatigueMetrics)) && (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <h3 className="text-sm font-semibold text-foreground">Fatigue Indicators</h3>
                      
                      {testMode === 'simple' && results?.fatigueMetrics && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Avg Reaction Time</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Average reaction time from all responses. <strong>Ideal: 200-300ms</strong> for Simple Test.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {results.fatigueMetrics.averageReactionTime}<span className="text-xs">ms</span>
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">RT Variability</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Standard deviation of reaction times. Measures consistency. <strong>Ideal: &lt;50ms</strong> (lower is better).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {results.fatigueMetrics.reactionTimeVariability}<span className="text-xs">ms</span>
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Lapses</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Reaction times &gt;500ms or timeouts. Key fatigue indicator. <strong>Ideal: 0</strong>.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className={`text-sm font-semibold ${results.fatigueMetrics.lapses > 0 ? 'text-destructive' : 'text-foreground'}`}>
                                {results.fatigueMetrics.lapses}
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">False Starts</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Anticipatory responses (&lt;200ms). Indicates impulsive behavior. <strong>Ideal: 0</strong>.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className={`text-sm font-semibold ${results.fatigueMetrics.falseStarts > 0 ? 'text-destructive' : 'text-foreground'}`}>
                                {results.fatigueMetrics.falseStarts}
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Std Dev</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Standard deviation of reaction times. Same as RT Variability. <strong>Ideal: &lt;50ms</strong>.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {results.fatigueMetrics.standardDeviation}<span className="text-xs">ms</span>
                              </p>
                            </div>
                          </div>
                          <div className="bg-secondary/50 p-2 rounded text-center">
                            <div className="flex items-center justify-center gap-1 mb-0.5">
                              <p className="text-xs text-muted-foreground">Error Rate</p>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="inline-flex items-center">
                                    <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">Percentage of errors (misses + false starts). <strong>Ideal: &lt;5%</strong> (lower is better).</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="text-sm font-semibold text-foreground">
                              {results.fatigueMetrics.errorRate}%
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground italic text-center pt-1">
                            {results.fatigueMetrics.interpretation}
                          </p>
                        </div>
                      )}

                      {testMode === 'dotgrid' && dotGridResults?.fatigueMetrics && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Avg Reaction Time</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Average reaction time across all 10 dot rounds. <strong>Ideal: 200-400ms</strong> for Dot Grid Test.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {dotGridResults.fatigueMetrics.averageReactionTime}<span className="text-xs">ms</span>
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">RT Variability</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Standard deviation of reaction times. Measures consistency. <strong>Ideal: &lt;50ms</strong> (lower is better).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {dotGridResults.fatigueMetrics.reactionTimeVariability}<span className="text-xs">ms</span>
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Lapses</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Reaction times &gt;500ms or timeouts. Key fatigue indicator. <strong>Ideal: 0</strong>.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className={`text-sm font-semibold ${dotGridResults.fatigueMetrics.lapses > 0 ? 'text-destructive' : 'text-foreground'}`}>
                                {dotGridResults.fatigueMetrics.lapses}
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">False Starts</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Anticipatory responses (&lt;200ms). Indicates impulsive behavior. <strong>Ideal: 0</strong>.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className={`text-sm font-semibold ${dotGridResults.fatigueMetrics.falseStarts > 0 ? 'text-destructive' : 'text-foreground'}`}>
                                {dotGridResults.fatigueMetrics.falseStarts}
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Std Dev</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Standard deviation of reaction times. Same as RT Variability. <strong>Ideal: &lt;50ms</strong>.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {dotGridResults.fatigueMetrics.standardDeviation}<span className="text-xs">ms</span>
                              </p>
                            </div>
                          </div>
                          <div className="bg-secondary/50 p-2 rounded text-center">
                            <div className="flex items-center justify-center gap-1 mb-0.5">
                              <p className="text-xs text-muted-foreground">Error Rate</p>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="inline-flex items-center">
                                    <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">Percentage of errors (misses + false starts). <strong>Ideal: &lt;5%</strong> (lower is better).</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="text-sm font-semibold text-foreground">
                              {dotGridResults.fatigueMetrics.errorRate}%
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground italic text-center pt-1">
                            {dotGridResults.fatigueMetrics.interpretation}
                          </p>
                        </div>
                      )}

                      {testMode === 'flash' && flashTestResults?.fatigueMetrics && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Avg Reaction Time</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Average pupil response time to flash stimuli. <strong>Ideal: 200-300ms</strong> for Flash Test.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {flashTestResults.fatigueMetrics.averageReactionTime}<span className="text-xs">ms</span>
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">RT Variability</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Standard deviation of reaction times. Measures consistency. <strong>Ideal: &lt;50ms</strong> (lower is better).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {flashTestResults.fatigueMetrics.reactionTimeVariability}<span className="text-xs">ms</span>
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Lapses</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Reaction times &gt;500ms or timeouts. Key fatigue indicator. <strong>Ideal: 0</strong>.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className={`text-sm font-semibold ${flashTestResults.fatigueMetrics.lapses > 0 ? 'text-destructive' : 'text-foreground'}`}>
                                {flashTestResults.fatigueMetrics.lapses}
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">False Starts</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Anticipatory responses (&lt;200ms). Indicates impulsive behavior. <strong>Ideal: 0</strong>.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className={`text-sm font-semibold ${flashTestResults.fatigueMetrics.falseStarts > 0 ? 'text-destructive' : 'text-foreground'}`}>
                                {flashTestResults.fatigueMetrics.falseStarts}
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Std Dev</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Standard deviation of reaction times. Same as RT Variability. <strong>Ideal: &lt;50ms</strong>.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {flashTestResults.fatigueMetrics.standardDeviation}<span className="text-xs">ms</span>
                              </p>
                            </div>
                          </div>
                          <div className="bg-secondary/50 p-2 rounded text-center">
                            <div className="flex items-center justify-center gap-1 mb-0.5">
                              <p className="text-xs text-muted-foreground">Error Rate</p>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="inline-flex items-center">
                                    <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">Percentage of errors (misses + false starts). <strong>Ideal: &lt;5%</strong> (lower is better).</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="text-sm font-semibold text-foreground">
                              {flashTestResults.fatigueMetrics.errorRate}%
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground italic text-center pt-1">
                            {flashTestResults.fatigueMetrics.interpretation}
                          </p>
                        </div>
                      )}
                    </div>
                    )
                  )}

                  {/* Video Analysis Section */}
                  {testState === 'results' && (
                    ((testMode === 'simple' && results?.videoAnalysis) ||
                     (testMode === 'dotgrid' && dotGridResults?.videoAnalysis) ||
                     (testMode === 'flash' && flashTestResults?.videoAnalysis)) && (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Video className="w-4 h-4" />
                        Video Analysis
                      </h3>
                      
                      {testMode === 'simple' && results?.videoAnalysis && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Attention Score</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Calculated from movement and variability. Higher = more attentive. <strong>Ideal: 70-100</strong>.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className={`text-sm font-semibold ${results.videoAnalysis.attentionScore >= 70 ? 'text-success' : results.videoAnalysis.attentionScore >= 50 ? 'text-primary' : 'text-destructive'}`}>
                                {results.videoAnalysis.attentionScore}/100
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Avg Movement</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Average pixel movement detected in video frames. <strong>Ideal: &lt;30</strong> (lower = more stable).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {results.videoAnalysis.averageMovement}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Blinks</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Number of blinks detected during test. <strong>Ideal: 0-2</strong> for short tests (excessive blinks may indicate fatigue).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {results.videoAnalysis.blinkCount}
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Head Movement</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Variance in movement patterns indicating head stability. <strong>Ideal: &lt;30</strong> (lower = more stable).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {results.videoAnalysis.headMovement}
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Micro Expressions</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Rapid small facial movements detected. <strong>Ideal: 0-3</strong> (excessive may indicate restlessness).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {results.videoAnalysis.microExpressions}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {testMode === 'dotgrid' && dotGridResults?.videoAnalysis && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Attention Score</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Calculated from movement and variability. Higher = more attentive. <strong>Ideal: 70-100</strong>.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className={`text-sm font-semibold ${dotGridResults.videoAnalysis.attentionScore >= 70 ? 'text-success' : dotGridResults.videoAnalysis.attentionScore >= 50 ? 'text-primary' : 'text-destructive'}`}>
                                {dotGridResults.videoAnalysis.attentionScore}/100
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Avg Movement</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Average pixel movement detected in video frames. <strong>Ideal: &lt;30</strong> (lower = more stable).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {dotGridResults.videoAnalysis.averageMovement}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Blinks</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Number of blinks detected during test. <strong>Ideal: 0-3</strong> for 10-round test (excessive blinks may indicate fatigue).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {dotGridResults.videoAnalysis.blinkCount}
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Head Movement</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Variance in movement patterns indicating head stability. <strong>Ideal: &lt;30</strong> (lower = more stable).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {dotGridResults.videoAnalysis.headMovement}
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Micro Expressions</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Rapid small facial movements detected. <strong>Ideal: 0-5</strong> for 10-round test (excessive may indicate restlessness).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {dotGridResults.videoAnalysis.microExpressions}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {testMode === 'flash' && flashTestResults?.videoAnalysis && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Attention Score</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Calculated from movement and variability. Higher = more attentive. <strong>Ideal: 70-100</strong>.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className={`text-sm font-semibold ${flashTestResults.videoAnalysis.attentionScore >= 70 ? 'text-success' : flashTestResults.videoAnalysis.attentionScore >= 50 ? 'text-primary' : 'text-destructive'}`}>
                                {flashTestResults.videoAnalysis.attentionScore}/100
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Blinks Detected</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Number of blinks detected during flash test. <strong>Ideal: 2-4</strong> (normal blink rate during 3 flashes).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {flashTestResults.videoAnalysis.blinkCount}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Eye Closure</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Total duration of eye closure during blinks. <strong>Ideal: 100-300ms</strong> per blink (normal blink duration).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {flashTestResults.videoAnalysis.eyeClosureDuration}<span className="text-xs">ms</span>
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Peak Movement</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Maximum movement detected in any single frame. <strong>Ideal: &lt;50</strong> (lower = more stable).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {flashTestResults.videoAnalysis.peakMovement}
                              </p>
                            </div>
                            <div className="bg-secondary/50 p-2 rounded text-center">
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <p className="text-xs text-muted-foreground">Movement Var</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center">
                                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">Variability in movement patterns. <strong>Ideal: &lt;30</strong> (lower = more consistent).</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {flashTestResults.videoAnalysis.movementVariability}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    )
                  )}

                  <div className="space-y-2">
                    {sessionInProgress && getNextTest() && (
                      <Button 
                        onClick={() => {
                          const next = getNextTest()
                          if (next) {
                            setTestMode(next)
                            setTestState('idle')
                            setResults(null)
                            setDotGridResults(null)
                            setFlashTestResults(null)
                          }
                        }}
                        size="lg"
                        className="w-full h-14 text-base bg-primary hover:bg-primary/90"
                      >
                        Continue to {getNextTest() === 'simple' ? 'Simple Test' : getNextTest() === 'dotgrid' ? 'Dot Grid Test' : 'Flash Test'}
                      </Button>
                    )}
                    {sessionInProgress && canSaveSession() && !getNextTest() && (
                      <Button 
                        onClick={() => {
                          checkAndSaveSession()
                        }}
                        size="lg"
                        className="w-full h-14 text-base bg-success hover:bg-success/90"
                      >
                        Save Session to History
                        {!currentSession.flash && !isMobile && ' (Flash skipped)'}
                      </Button>
                    )}
                    {!sessionInProgress && (
                      <Button 
                        onClick={startNewSession}
                        size="lg"
                        className="w-full h-14 text-base bg-primary hover:bg-primary/90"
                      >
                        Start New Session
                      </Button>
                    )}
                    <Button 
                      onClick={runAgain} 
                      variant="outline"
                      size="lg"
                      className="w-full h-14 text-base"
                    >
                      {sessionInProgress ? 'Retry This Test' : 'Run Again'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* AI Report Card - Only show in test view */}
        {viewMode === 'test' && (
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
        )}

        {viewMode === 'test' && (
          <Card className="p-3 bg-secondary/50 border-border">
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Quick cognitive assessment using reaction time, facial micro-movement analysis, and visual tracking performance
            </p>
          </Card>
        )}
          </>
        )}
      </div>
    </main>
    </TooltipProvider>
  )
}
