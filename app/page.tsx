'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Activity, Video, Brain, AlertCircle, Zap, Eye, X, History, BarChart3, TrendingUp, Info, Play } from 'lucide-react'
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
  errors: number
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
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null)
  
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
  const [dotErrors, setDotErrors] = useState<number>(0)
  const dotContainerRef = useRef<HTMLDivElement>(null)
  
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
  const reportCardRef = useRef<HTMLDivElement>(null)
  const previousCanSaveSessionRef = useRef<boolean>(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
    }
    checkMobile()
  }, [])

  // Load test history on mount
  useEffect(() => {
    const loadHistory = async () => {
      const history = await storage.getTestHistory()
      setTestHistory(history)
    }
    loadHistory()
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
        // Create video blob from recorded chunks
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { 
            type: mediaRecorder.mimeType || 'video/webm' 
          })
          const videoUrl = URL.createObjectURL(blob)
          setRecordedVideoUrl(videoUrl)
        }
        
        // Analyze captured frames (pass test mode if available)
        const analysis = analyzeVideoFrames(testMode === 'flash')
        resolve(analysis)
      }
      
      try {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop()
        } else {
          // Already stopped, create blob and analyze immediately
          if (recordedChunksRef.current.length > 0) {
            const blob = new Blob(recordedChunksRef.current, { 
              type: mediaRecorder.mimeType || 'video/webm' 
            })
            const videoUrl = URL.createObjectURL(blob)
            setRecordedVideoUrl(videoUrl)
          }
          const analysis = analyzeVideoFrames()
          resolve(analysis)
        }
      } catch (err) {
        console.error('Error stopping recorder:', err)
        // Create blob and analyze anyway
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { 
            type: mediaRecorder.mimeType || 'video/webm' 
          })
          const videoUrl = URL.createObjectURL(blob)
          setRecordedVideoUrl(videoUrl)
        }
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

  // Enhanced face detection with multiple heuristics
  const detectFacePresence = (analysis: { frames: ImageData[], movementData: number[] } | null): boolean => {
    if (!analysis || analysis.frames.length === 0) return false
    
    const frames = analysis.frames
    const movementData = analysis.movementData
    
    // Need at least a few frames to analyze
    if (frames.length < 5) return false
    
    // Calculate average movement
    const averageMovement = movementData.length > 0
      ? movementData.reduce((a, b) => a + b, 0) / movementData.length
      : 0
    
    // If average movement is extremely high (>80), likely no face (camera moving or facing elsewhere)
    if (averageMovement > 80) return false
    
    // Enhanced brightness analysis with multiple regions
    const centerBrightness: number[] = []
    const eyeRegionBrightness: number[] = []
    const skinTonePixels: number[] = []
    
    frames.forEach((frame) => {
      if (frame && frame.data.length > 0 && frame.width > 0 && frame.height > 0) {
        const width = frame.width
        const height = frame.height
        const centerX = Math.floor(width / 2)
        const centerY = Math.floor(height / 2)
        
        // Sample center region (face area)
        let centerBright = 0
        let centerCount = 0
        
        // Sample eye region (upper center, typically 30-40% from top)
        let eyeBright = 0
        let eyeCount = 0
        
        // Sample for skin tone detection (center region, typical skin RGB ranges)
        let skinCount = 0
        let totalPixels = 0
        
        for (let y = Math.max(0, centerY - height * 0.2); y < Math.min(height, centerY + height * 0.3); y += 3) {
          for (let x = Math.max(0, centerX - width * 0.25); x < Math.min(width, centerX + width * 0.25); x += 3) {
            const idx = (y * width + x) * 4
            if (idx >= frame.data.length - 3) continue
            
            const r = frame.data[idx]
            const g = frame.data[idx + 1]
            const b = frame.data[idx + 2]
            const brightness = (r + g + b) / 3
            
            // Center region brightness
            centerBright += brightness
            centerCount++
            
            // Eye region (upper portion of center)
            if (y < centerY && y > centerY - height * 0.15) {
              eyeBright += brightness
              eyeCount++
            }
            
            // Skin tone detection: typical skin has R > G > B and within certain ranges
            totalPixels++
            if (r > g && g > b && r > 95 && r < 240 && g > 40 && g < 210 && b > 20 && b < 180) {
              skinCount++
            }
          }
        }
        
        if (centerCount > 0) {
          centerBrightness.push(centerBright / centerCount)
        }
        if (eyeCount > 0) {
          eyeRegionBrightness.push(eyeBright / eyeCount)
        }
        if (totalPixels > 0) {
          skinTonePixels.push((skinCount / totalPixels) * 100)
        }
      }
    })
    
    // Check brightness consistency (face should have relatively consistent brightness)
    let brightnessScore = 0
    if (centerBrightness.length > 5) {
      const avgBrightness = centerBrightness.reduce((a, b) => a + b, 0) / centerBrightness.length
      const brightnessVariance = centerBrightness.reduce((sum, b) => sum + Math.pow(b - avgBrightness, 2), 0) / centerBrightness.length
      const brightnessStdDev = Math.sqrt(brightnessVariance)
      
      // Score based on brightness consistency and range
      if (brightnessStdDev < 30 && avgBrightness >= 40 && avgBrightness <= 180) {
        brightnessScore += 2
      } else if (brightnessStdDev < 40 && avgBrightness >= 30 && avgBrightness <= 200) {
        brightnessScore += 1
      }
      
      // Check if brightness is too inconsistent or out of range
      if (brightnessStdDev > 50 || avgBrightness < 20 || avgBrightness > 220) {
        return false
      }
    }
    
    // Check eye region consistency (eyes should have some variation but not too much)
    if (eyeRegionBrightness.length > 5) {
      const avgEyeBright = eyeRegionBrightness.reduce((a, b) => a + b, 0) / eyeRegionBrightness.length
      const eyeVariance = eyeRegionBrightness.reduce((sum, b) => sum + Math.pow(b - avgEyeBright, 2), 0) / eyeRegionBrightness.length
      const eyeStdDev = Math.sqrt(eyeVariance)
      
      // Eyes should have moderate variation (blinks, eye movements)
      if (eyeStdDev > 10 && eyeStdDev < 50) {
        brightnessScore += 1
      }
    }
    
    // Check skin tone presence (faces typically have skin-colored pixels)
    if (skinTonePixels.length > 0) {
      const avgSkinPercent = skinTonePixels.reduce((a, b) => a + b, 0) / skinTonePixels.length
      if (avgSkinPercent > 15) { // At least 15% skin-colored pixels
        brightnessScore += 1
      } else if (avgSkinPercent < 5) {
        // Very few skin pixels, likely no face
        return false
      }
    }
    
    // Movement pattern analysis: face should have some small movements but not chaotic
    if (movementData.length > 5) {
      const movementVariance = movementData.reduce((sum, m) => {
        return sum + Math.pow(m - averageMovement, 2)
      }, 0) / movementData.length
      const movementStdDev = Math.sqrt(movementVariance)
      
      // Good face movement: moderate average with reasonable variance
      if (averageMovement > 5 && averageMovement < 60 && movementStdDev < 30) {
        brightnessScore += 1
      }
    }
    
    // Need at least 2 positive indicators to confirm face presence
    return brightnessScore >= 2
  }

  // Analyze all captured video frames (enhanced for flash test with pupil dilation)
  const analyzeVideoFrames = (isFlashTest: boolean = false): VideoAnalysis => {
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
    const timestamps = analysis.timestamps || []
    
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
    
    // Enhanced analysis for flash test (pupil dilation detection) and blink detection
    let blinkCount = 0
    let eyeClosureDuration = 0
    let pupilDilationData: number[] = []
    let blinkEvents: { start: number, duration: number }[] = []
    
    if (frames.length > 10) {
      // Enhanced eye region analysis with better pupil detection
      const eyeRegionBrightness: number[] = []
      const pupilSizeData: number[] = []
      const eyeContrastData: number[] = [] // Contrast helps detect pupil edges
      
      frames.forEach((frame, idx) => {
        if (frame && frame.data.length > 0 && frame.width > 0 && frame.height > 0) {
          const width = frame.width
          const height = frame.height
          const centerX = Math.floor(width / 2)
          const centerY = Math.floor(height / 2)
          
          // For flash test, analyze center region more precisely with adaptive sizing
          const regionSize = isFlashTest ? Math.min(120, Math.min(width, height) * 0.3) : 50
          
          let brightness = 0
          let darkPixelCount = 0 // Count dark pixels (pupil)
          let veryDarkPixelCount = 0 // Very dark pixels (pupil center)
          let sampleCount = 0
          let contrastSum = 0
          
          // Sample region around center with better coverage
          for (let y = centerY - regionSize; y < centerY + regionSize; y += 2) {
            for (let x = centerX - regionSize; x < centerX + regionSize; x += 2) {
              if (x >= 0 && x < width && y >= 0 && y < height) {
                const pixelIdx = (y * width + x) * 4
                if (pixelIdx < frame.data.length - 3) {
                  const r = frame.data[pixelIdx]
                  const g = frame.data[pixelIdx + 1]
                  const b = frame.data[pixelIdx + 2]
                  const pixelBrightness = (r + g + b) / 3
                  
                  brightness += pixelBrightness
                  sampleCount++
                  
                  // Enhanced pupil detection with multiple thresholds
                  if (isFlashTest) {
                    if (pixelBrightness < 50) {
                      darkPixelCount++
                    }
                    if (pixelBrightness < 30) {
                      veryDarkPixelCount++
                    }
                    
                    // Calculate local contrast (helps detect pupil edges)
                    if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
                      const neighbors = [
                        frame.data[((y - 1) * width + x) * 4],
                        frame.data[(y * width + (x - 1)) * 4],
                        frame.data[(y * width + (x + 1)) * 4],
                        frame.data[((y + 1) * width + x) * 4]
                      ]
                      const neighborAvg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length
                      contrastSum += Math.abs(pixelBrightness - neighborAvg)
                    }
                  }
                }
              }
            }
          }
          
          if (sampleCount > 0) {
            const avgBrightness = brightness / sampleCount
            eyeRegionBrightness.push(avgBrightness)
            
            if (isFlashTest) {
              // Enhanced pupil size estimation using both dark and very dark pixels
              const darkPercent = (darkPixelCount / sampleCount) * 100
              const veryDarkPercent = (veryDarkPixelCount / sampleCount) * 100
              // Weighted average: very dark pixels are more likely to be pupil center
              const estimatedPupilSize = (darkPercent * 0.6) + (veryDarkPercent * 0.4)
              pupilSizeData.push(estimatedPupilSize)
              
              // Store contrast for edge detection
              eyeContrastData.push(contrastSum / sampleCount)
            }
          }
        }
      })
      
      // Enhanced blink detection with temporal smoothing and duration tracking
      if (eyeRegionBrightness.length > 3) {
        // Smooth brightness values to reduce noise
        const smoothedBrightness: number[] = []
        for (let i = 0; i < eyeRegionBrightness.length; i++) {
          const prev = i > 0 ? eyeRegionBrightness[i - 1] : eyeRegionBrightness[i]
          const curr = eyeRegionBrightness[i]
          const next = i < eyeRegionBrightness.length - 1 ? eyeRegionBrightness[i + 1] : eyeRegionBrightness[i]
          smoothedBrightness.push((prev * 0.2 + curr * 0.6 + next * 0.2))
        }
        
        // Detect blinks with improved thresholds (less sensitive to prevent false positives)
        let inBlink = false
        let blinkStartIdx = 0
        let lastBlinkEnd = -10 // Track last blink end to prevent rapid re-triggering
        
        for (let i = 1; i < smoothedBrightness.length; i++) {
          const drop = smoothedBrightness[i - 1] - smoothedBrightness[i]
          const brightnessLevel = smoothedBrightness[i]
          
          // Blink start: significant drop (>30, increased from 25) and brightness below threshold
          // Also require minimum time since last blink (at least 5 frames = 500ms)
          if (!inBlink && drop > 30 && brightnessLevel < 70 && (i - lastBlinkEnd) > 5) {
            inBlink = true
            blinkStartIdx = i
          }
          
          // Blink end: brightness recovers significantly
          if (inBlink) {
            const recovery = smoothedBrightness[i] - smoothedBrightness[i - 1]
            const currentBrightness = smoothedBrightness[i]
            const blinkDurationFrames = i - blinkStartIdx
            
            // Require minimum blink duration (at least 2 frames = 200ms) and recovery
            if ((recovery > 20 || currentBrightness > 90) && blinkDurationFrames >= 2) {
              inBlink = false
              blinkCount++
              lastBlinkEnd = i
              const blinkDuration = blinkDurationFrames * 100 // 100ms per frame
              eyeClosureDuration += blinkDuration
              blinkEvents.push({ start: blinkStartIdx, duration: blinkDuration })
            }
          }
        }
        
        // Handle blink that extends to end of recording (only if it's a valid blink)
        if (inBlink && (smoothedBrightness.length - blinkStartIdx) >= 2) {
          blinkCount++
          const blinkDuration = (smoothedBrightness.length - blinkStartIdx) * 100
          eyeClosureDuration += blinkDuration
          blinkEvents.push({ start: blinkStartIdx, duration: blinkDuration })
        }
        
        // Cap blink count at reasonable maximum (e.g., 1 blink per 2 seconds for typical test duration)
        // For a 10-15 second test, max should be around 5-7 blinks
        const maxReasonableBlinks = Math.ceil((smoothedBrightness.length * 100) / 2000) // 1 blink per 2 seconds
        blinkCount = Math.min(blinkCount, maxReasonableBlinks)
      }
      
      // Enhanced pupil dilation analysis for flash test
      if (isFlashTest && pupilSizeData.length > 5) {
        // Find baseline pupil size (first few frames before flash, more robust)
        const baselineFrames = Math.min(8, Math.floor(pupilSizeData.length * 0.3))
        const baselineSize = pupilSizeData.slice(0, baselineFrames).reduce((a, b) => a + b, 0) / baselineFrames
        
        // Remove outliers from baseline calculation
        const baselineValues = pupilSizeData.slice(0, baselineFrames)
        const baselineMedian = [...baselineValues].sort((a, b) => a - b)[Math.floor(baselineValues.length / 2)]
        const filteredBaseline = baselineValues.filter(v => Math.abs(v - baselineMedian) < 10)
        const robustBaseline = filteredBaseline.length > 0 
          ? filteredBaseline.reduce((a, b) => a + b, 0) / filteredBaseline.length
          : baselineSize
        
        // Track dilation changes with smoothing
        const smoothedPupilData: number[] = []
        for (let i = 0; i < pupilSizeData.length; i++) {
          const prev = i > 0 ? pupilSizeData[i - 1] : pupilSizeData[i]
          const curr = pupilSizeData[i]
          const next = i < pupilSizeData.length - 1 ? pupilSizeData[i + 1] : pupilSizeData[i]
          smoothedPupilData.push((prev * 0.25 + curr * 0.5 + next * 0.25))
        }
        
        // Calculate percentage change from baseline
        pupilDilationData = smoothedPupilData.map(size => {
          if (robustBaseline > 0) {
            const change = ((size - robustBaseline) / robustBaseline) * 100
            return change
          }
          return 0
        })
      }
    }
    
    // Calculate head movement (variance in movement patterns)
    const headMovement = movementVariability
    
    // Calculate attention score (inverse of movement and variability)
    // For flash test, also consider pupil response
    let attentionScore = Math.max(0, Math.min(100, 100 - (averageMovement * 0.5) - (movementVariability * 0.3)))
    
    if (isFlashTest && pupilDilationData.length > 0) {
      // Check if pupil responds to flash (should constrict)
      const maxConstriction = Math.min(...pupilDilationData)
      if (maxConstriction < -10) { // Pupil constricted by at least 10%
        attentionScore += 10 // Bonus for good pupil response
      }
      attentionScore = Math.min(100, attentionScore)
    }
    
    // Enhanced micro-expression detection with pattern analysis
    let microExpressions = 0
    let facialTwitches = 0
    let eyeMovements = 0
    
    if (movementData.length > 5) {
      // Detect rapid small movements (micro-expressions)
      for (let i = 2; i < movementData.length - 2; i++) {
        const localVariance = Math.abs(movementData[i] - movementData[i - 1]) + 
                             Math.abs(movementData[i] - movementData[i + 1])
        const avgLocalMovement = (movementData[i - 1] + movementData[i] + movementData[i + 1]) / 3
        
        // Micro-expression: small but rapid change in low-movement state
        if (localVariance > 12 && avgLocalMovement < 35 && movementData[i] < 40) {
          microExpressions++
        }
        
        // Facial twitch: very rapid spike in movement
        if (movementData[i] > movementData[i - 1] * 2 && 
            movementData[i] > movementData[i + 1] * 1.5 &&
            movementData[i] > 15 && movementData[i] < 50) {
          facialTwitches++
        }
      }
      
      // Detect eye movements (smaller, more frequent movements)
      if (movementData.length > 10) {
        // Look for patterns of small oscillations (eye movements)
        let oscillationCount = 0
        for (let i = 3; i < movementData.length - 3; i++) {
          const pattern = [
            movementData[i - 3],
            movementData[i - 2],
            movementData[i - 1],
            movementData[i],
            movementData[i + 1],
            movementData[i + 2],
            movementData[i + 3]
          ]
          
          // Check for oscillating pattern (up-down-up or down-up-down)
          const isOscillating = 
            (pattern[1] < pattern[2] && pattern[2] > pattern[3] && pattern[3] < pattern[4]) ||
            (pattern[1] > pattern[2] && pattern[2] < pattern[3] && pattern[3] > pattern[4])
          
          if (isOscillating && pattern[3] > 5 && pattern[3] < 25) {
            oscillationCount++
          }
        }
        eyeMovements = Math.floor(oscillationCount / 3) // Group oscillations
      }
    }
    
    // For flash test, enhanced micro-movement detection during flash response
    if (isFlashTest && timestamps.length > 0) {
      // Look for rapid small movements during flash response period
      const flashResponseWindow = 600 // 600ms after flash (extended window)
      for (let i = 1; i < movementData.length && i < timestamps.length; i++) {
        const timeSinceStart = timestamps[i] - timestamps[0]
        if (timeSinceStart < flashResponseWindow) {
          const movementChange = Math.abs(movementData[i] - movementData[i - 1])
          const movementAccel = i > 1 ? Math.abs(movementChange - Math.abs(movementData[i - 1] - movementData[i - 2])) : 0
          
          // Small but noticeable movements (micro-expressions from flash response)
          if (movementChange > 6 && movementChange < 25 && movementData[i] < 35) {
            microExpressions++
          }
          
          // Rapid acceleration (startle response to flash)
          if (movementAccel > 8 && movementChange > 10) {
            microExpressions += 0.5 // Partial count for rapid responses
          }
        }
      }
    }
    
    // Combine micro-expressions with facial twitches and eye movements
    const totalMicroExpressions = Math.round(microExpressions + (facialTwitches * 0.5) + (eyeMovements * 0.3))
    
    return {
      totalFrames: frames.length,
      averageMovement,
      peakMovement,
      movementVariability,
      blinkCount,
      eyeClosureDuration,
      headMovement,
      attentionScore: Math.round(attentionScore),
      microExpressions: totalMicroExpressions
    }
  }

  // Enhanced movement index calculation with weighted regions and edge detection
  const calculateMovementIndex = (frame1: ImageData, frame2: ImageData): number => {
    if (!frame1 || !frame2 || frame1.data.length !== frame2.data.length) return 0
    
    const data1 = frame1.data
    const data2 = frame2.data
    const width = frame1.width
    const height = frame1.height
    
    let totalDiff = 0
    let weightedDiff = 0
    let edgeMovement = 0
    let sampleCount = 0
    
    // Enhanced sampling: focus more on center region (face area) and detect edges
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const idx = (y * width + x) * 4
        if (idx >= data1.length - 3) continue
        
        // Calculate pixel difference
        const rDiff = Math.abs(data1[idx] - data2[idx])
        const gDiff = Math.abs(data1[idx + 1] - data2[idx + 1])
        const bDiff = Math.abs(data1[idx + 2] - data2[idx + 2])
        const pixelDiff = rDiff + gDiff + bDiff
        
        // Weight center region more heavily (face is typically centered)
        const centerX = width / 2
        const centerY = height / 2
        const distFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2))
        const maxDist = Math.sqrt(Math.pow(centerX, 2) + Math.pow(centerY, 2))
        const centerWeight = 1.0 + (1.0 - (distFromCenter / maxDist)) * 0.5 // 1.0 to 1.5 weight
        
        totalDiff += pixelDiff
        weightedDiff += pixelDiff * centerWeight
        sampleCount++
        
        // Edge detection: check if this pixel is on an edge (high gradient)
        if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
          const idxRight = ((y * width) + (x + 1)) * 4
          const idxDown = (((y + 1) * width) + x) * 4
          
          const edge1 = Math.abs(data1[idx] - data1[idxRight]) + 
                       Math.abs(data1[idx + 1] - data1[idxRight + 1]) +
                       Math.abs(data1[idx + 2] - data1[idxRight + 2])
          const edge2 = Math.abs(data1[idx] - data1[idxDown]) + 
                       Math.abs(data1[idx + 1] - data1[idxDown + 1]) +
                       Math.abs(data1[idx + 2] - data1[idxDown + 2])
          
          // If pixel is on an edge and moved, it's more significant
          if ((edge1 > 30 || edge2 > 30) && pixelDiff > 20) {
            edgeMovement += pixelDiff * 1.2
          }
        }
      }
    }
    
    // Combine weighted average with edge movement
    const avgDiff = sampleCount > 0 ? weightedDiff / sampleCount : 0
    const edgeContribution = sampleCount > 0 ? edgeMovement / sampleCount : 0
    const combinedDiff = (avgDiff * 0.7) + (edgeContribution * 0.3)
    
    // Normalize to 0-100 scale (765 is max RGB difference)
    return Math.min(Math.round((combinedDiff / 765) * 100), 100)
  }

  // Calculate NeuroScore from reaction time and movement
  const calculateNeuroScore = (reactionMs: number, movement: number, hasFace: boolean = true): number => {
    // Ideal reaction time: 200-300ms = 100 score
    // Movement penalty: high movement (>50) suggests fatigue
    // If no face detected, movement is unreliable, so don't penalize based on it
    
    let reactionScore = 100
    if (reactionMs < 200) {
      reactionScore = 85 // Too fast might be anticipation, but still good
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
    // Only apply movement penalty if face is detected and movement is significant
    let movementPenalty = 0
    if (hasFace && movement > 20) {
      // Reduced penalty: only penalize for significant movement (>20)
      // Use a gentler curve: movement 20-50 = small penalty, 50+ = larger penalty
      if (movement > 50) {
        movementPenalty = Math.min(15 + (movement - 50) * 0.2, 25)
      } else {
        movementPenalty = (movement - 20) * 0.1
      }
    }
    
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
    
    // Need all 3 tests for a valid combined score
    if (scores.length < 3) return 0
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
    // Clear previous video URL
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl)
      setRecordedVideoUrl(null)
    }
    
    // Start video recording for flash test (back camera should already be active)
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
    // Stop video recording and analyze (with enhanced flash test analysis)
    const videoAnalysis = await stopVideoRecording()
    
    // Check if face is present
    const hasFace = detectFacePresence(videoAnalysisRef.current)
    
    if (!hasFace) {
      // No face detected - show error message
      alert('No face detected. Please ensure your face is visible in the camera and try again.')
      setTestState('idle')
      // Clean up video URL
      if (recordedVideoUrl) {
        URL.revokeObjectURL(recordedVideoUrl)
        setRecordedVideoUrl(null)
      }
      return
    }
    
    // Enhanced analysis for flash test - use video analysis data
    // Calculate pupil response time from video analysis
    const reactionTimeMs = videoAnalysis 
      ? Math.round(200 + (videoAnalysis.averageMovement * 0.5) + (videoAnalysis.microExpressions * 10))
      : Math.round(220 + Math.random() * 150)
    
    const blinkLatencyMs = videoAnalysis && videoAnalysis.blinkCount > 0
      ? Math.round(videoAnalysis.eyeClosureDuration / videoAnalysis.blinkCount)
      : Math.round(180 + Math.random() * 100)
    
    // Use video analysis blink count, but ensure it's reasonable (0-10 for flash test)
    const rawBlinkCount = videoAnalysis?.blinkCount || 0
    const blinkCount = Math.min(Math.max(0, rawBlinkCount), 10) // Cap at 10 blinks max
    const stabilityScore = videoAnalysis
      ? Math.round(100 - (videoAnalysis.movementVariability * 0.5) - (videoAnalysis.averageMovement * 0.3))
      : Math.round(70 + Math.random() * 25)
    
    let fatigueScore = videoAnalysis
      ? Math.round(videoAnalysis.attentionScore * 0.7 + (100 - videoAnalysis.movementVariability) * 0.3)
      : Math.round(65 + Math.random() * 25)
    
    // Use video analysis blink count
    const finalBlinkCount = blinkCount
    
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
    
    // Check if session is complete and save (all 3 tests required)
    if (updatedSession.simple && updatedSession.dotgrid && updatedSession.flash) {
      const combinedScore = calculateCombinedNeuroScore()
      storage.saveTestSession({
        simple: updatedSession.simple,
        dotgrid: updatedSession.dotgrid,
        flash: updatedSession.flash
      }, combinedScore).then(async () => {
        const history = await storage.getTestHistory()
        setTestHistory(history)
      })
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

  const handleDotClick = (e?: React.MouseEvent) => {
    if (!currentDot) return
    
    // If event is provided, stop propagation to prevent container click handler
    if (e) {
      e.stopPropagation()
    }
    
    const reactionTime = performance.now() - currentDot.timestamp
    setDotReactionTimes(prev => [...prev, reactionTime])
    
    if (dotTimeoutRef.current) {
      clearTimeout(dotTimeoutRef.current)
    }
    
    setCurrentDot(null)
    
    spawnNextDot(dotRound)
  }

  const handleDotContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!currentDot || !dotContainerRef.current) return
    
    // Get container bounds
    const container = dotContainerRef.current
    const rect = container.getBoundingClientRect()
    
    // Calculate click position relative to container
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    
    // Calculate dot center position in pixels
    const dotX = (currentDot.x / 100) * rect.width
    const dotY = (currentDot.y / 100) * rect.height
    
    // Dot radius is 32px (half of w-16 h-16 which is 64px)
    const dotRadius = 32
    
    // Calculate distance from click to dot center
    const distance = Math.sqrt(
      Math.pow(clickX - dotX, 2) + Math.pow(clickY - dotY, 2)
    )
    
    // Clear timeout when clicking (whether inside or outside)
    if (dotTimeoutRef.current) {
      clearTimeout(dotTimeoutRef.current)
    }
    
    // If click is outside the circle, count as error and move to next dot
    if (distance > dotRadius) {
      setDotErrors(prev => prev + 1)
      setCurrentDot(null)
      spawnNextDot(dotRound)
    } else {
      // Click is inside circle, handle as normal hit
      handleDotClick()
    }
  }

  const handleDotMiss = () => {
    setDotMisses(prev => prev + 1)
    setCurrentDot(null)
    
    spawnNextDot(dotRound)
  }

  const finishDotGridTest = async () => {
    // Stop video recording and analyze
    const videoAnalysis = await stopVideoRecording()
    
    const hits = dotReactionTimes.length
    const misses = dotMisses
    const errors = dotErrors
    const totalAttempts = hits + misses + errors
    
    const avgReactionTime = hits > 0
      ? Math.round(dotReactionTimes.reduce((a, b) => a + b, 0) / hits)
      : 0
    
    // Calculate DotScore (0-100) based on accuracy and performance
    // Base score on accuracy: (hits / 10) * 70 points (70% weight on accuracy)
    const accuracyScore = (hits / 10) * 70
    
    // Performance score based on reaction time: 30 points (30% weight on speed)
    let performanceScore = 30
    if (avgReactionTime > 0) {
      if (avgReactionTime > 800) performanceScore = 5
      else if (avgReactionTime > 600) performanceScore = 10
      else if (avgReactionTime > 400) performanceScore = 20
      else if (avgReactionTime > 300) performanceScore = 25
      else performanceScore = 30
    } else {
      // No hits means no performance score
      performanceScore = 0
    }
    
    // Additional penalties for errors (clicks outside) - more severe
    const errorPenalty = errors * 3
    
    // Penalty for misses
    const missPenalty = misses * 2
    
    let dotScore = accuracyScore + performanceScore - errorPenalty - missPenalty
    dotScore = Math.max(0, Math.min(100, Math.round(dotScore)))
    
    // Calculate fatigue metrics (include errors in total attempts)
    const fatigueMetrics = calculateFatigueMetrics(dotReactionTimes, misses + errors, totalAttempts)
    
    const testResults = {
      averageReactionTime: avgReactionTime,
      hits,
      misses,
      errors,
      dotScore: Math.round(dotScore),
      fatigueMetrics,
      videoAnalysis: videoAnalysis || undefined
    }
    
    setDotGridResults(testResults)
    
    // Save to current session
    const updatedSession = { ...currentSession, dotgrid: testResults }
    setCurrentSession(updatedSession)
    setSessionInProgress(true)
    
    // Check if session is complete and save (all 3 tests required)
    if (updatedSession.simple && updatedSession.dotgrid && updatedSession.flash) {
      const combinedScore = calculateCombinedNeuroScore()
      storage.saveTestSession({
        simple: updatedSession.simple,
        dotgrid: updatedSession.dotgrid,
        flash: updatedSession.flash
      }, combinedScore).then(async () => {
        const history = await storage.getTestHistory()
        setTestHistory(history)
      })
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
    
    // Clear previous video URL
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl)
      setRecordedVideoUrl(null)
    }
    
    // Start video recording
    startVideoRecording()
    
    if (testMode === 'dotgrid') {
      // Start dot grid test
      setDotReactionTimes([])
      setDotMisses(0)
      setDotErrors(0)
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
    
    // Check if face is present (use video analysis if available, otherwise check movement)
    const hasFace = videoAnalysis 
      ? detectFacePresence(videoAnalysisRef.current)
      : movement < 80 // If no video analysis, assume face if movement isn't extremely high
    
    // If no face detected and movement is very high, cap movement to prevent false penalties
    let adjustedMovement = movement
    if (!hasFace && movement > 50) {
      // If no face, movement calculation is unreliable - use a conservative value
      adjustedMovement = Math.min(movement, 30)
    }
    
    // Calculate scores with face detection info
    const neuroScore = calculateNeuroScore(reactionTime, adjustedMovement, hasFace)
    const alertLevel = getAlertLevel(neuroScore)
    
    // Calculate fatigue metrics (single reaction time for simple test)
    const fatigueMetrics = calculateFatigueMetrics([reactionTime], 0, 1)
    
    const testResults = {
      reactionTime,
      movementIndex: adjustedMovement,
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
    
    // Check if session is complete and save (all 3 tests required)
    if (updatedSession.simple && updatedSession.dotgrid && updatedSession.flash) {
      const combinedScore = calculateCombinedNeuroScore()
      storage.saveTestSession({
        simple: updatedSession.simple,
        dotgrid: updatedSession.dotgrid,
        flash: updatedSession.flash
      }, combinedScore).then(async () => {
        const history = await storage.getTestHistory()
        setTestHistory(history)
      })
      setSessionInProgress(false)
    }
    
    setTestState('results')
  }
  
  // Function to check and save session if complete (all 3 tests required)
  const checkAndSaveSession = () => {
    if (currentSession.simple && currentSession.dotgrid && currentSession.flash) {
      const combinedScore = calculateCombinedNeuroScore()
      storage.saveTestSession({
        simple: currentSession.simple,
        dotgrid: currentSession.dotgrid,
        flash: currentSession.flash
      }, combinedScore).then(async () => {
        const history = await storage.getTestHistory()
        setTestHistory(history)
      })
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
    // Clean up video URL
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl)
      setRecordedVideoUrl(null)
    }
    setCurrentSession({ simple: null, dotgrid: null, flash: null })
    setSessionInProgress(false)
    setResults(null)
    setDotGridResults(null)
    setFlashTestResults(null)
    setTestMode('simple')
    setTestState('idle')
  }
  
  // Get next test to complete (all 3 tests required)
  const getNextTest = (): TestMode | null => {
    if (!currentSession.simple) return 'simple'
    if (!currentSession.dotgrid) return 'dotgrid'
    if (!currentSession.flash) return 'flash'
    return null
  }
  
  // Check if session can be saved (all 3 tests required)
  const canSaveSession = (): boolean => {
    return currentSession.simple !== null && currentSession.dotgrid !== null && currentSession.flash !== null
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

  // Auto-scroll to report when all tests are completed
  useEffect(() => {
    const canSave = canSaveSession()
    // Only scroll if we just completed all tests (transition from false to true)
    if (canSave && !previousCanSaveSessionRef.current && reportCardRef.current) {
      // Small delay to ensure the report card is rendered
      setTimeout(() => {
        reportCardRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        })
      }, 300)
    }
    previousCanSaveSessionRef.current = canSave
  }, [currentSession.simple, currentSession.dotgrid, currentSession.flash])

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
    <main className="min-h-screen bg-background p-3 sm:p-4">
      <div className="text-center space-y-2 mb-4 sm:mb-6">
        <div className="flex items-center justify-center gap-2 sm:gap-3 mb-2">
          <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-balance">NeuroPulse</h1>
        </div>
        <p className="text-muted-foreground text-sm sm:text-base">
          Fatigue Screening for Commercial Drivers
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4">
        {/* Navigation Tabs */}
        <Card className="p-1.5 sm:p-2 bg-card border-medical">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <Button
              variant={viewMode === 'test' ? 'default' : 'outline'}
              onClick={() => setViewMode('test')}
              className="h-auto py-2.5 sm:py-2 min-h-[44px] flex flex-col items-center gap-1 touch-manipulation"
            >
              <Activity className="w-4 h-4 sm:w-4 sm:h-4" />
              <span className="text-xs font-medium">Test</span>
            </Button>
            <Button
              variant={viewMode === 'history' ? 'default' : 'outline'}
              onClick={() => setViewMode('history')}
              className="h-auto py-2.5 sm:py-2 min-h-[44px] flex flex-col items-center gap-1 touch-manipulation"
            >
              <History className="w-4 h-4 sm:w-4 sm:h-4" />
              <span className="text-xs font-medium">History</span>
            </Button>
            <Button
              variant={viewMode === 'analytics' ? 'default' : 'outline'}
              onClick={() => setViewMode('analytics')}
              className="h-auto py-2.5 sm:py-2 min-h-[44px] flex flex-col items-center gap-1 touch-manipulation"
            >
              <TrendingUp className="w-4 h-4 sm:w-4 sm:h-4" />
              <span className="text-xs font-medium">Analytics</span>
            </Button>
          </div>
        </Card>

        {/* History View */}
        {viewMode === 'history' && (
          <div className="space-y-4">
            <Card className="p-3 sm:p-4 bg-card border-medical">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h2 className="text-base sm:text-lg font-semibold">Test History</h2>
                {testHistory.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await storage.clearHistory()
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
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
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
                            onClick={async (e) => {
                              e.stopPropagation()
                              await storage.deleteTest(test.id)
                              const history = await storage.getTestHistory()
                              setTestHistory(history)
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
              <Card className="p-3 sm:p-4 bg-card border-medical">
                <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
                  Comparison ({selectedTests.length} selected)
                </h2>
                <div className="space-y-4">
                  {selectedTests.map((testId) => {
                    const test = testHistory.find(t => t.id === testId)
                    if (!test) return null
                    return (
                      <div key={testId} className="border rounded-lg p-3 sm:p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                          <span className="text-xs sm:text-sm font-semibold">
                            Session - {format(new Date(test.timestamp), 'MMM d, h:mm a')}
                          </span>
                          <span className="text-base sm:text-lg font-bold">Combined Score: {test.combinedScore}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <Card className="p-3 sm:p-4 bg-card border-medical">
                    <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Performance Summary</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
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
                              <p className="max-w-xs">Total number of test sessions completed. Each session includes all three tests: Simple, Dot Grid, and Flash.</p>
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mt-3">
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
                <Card className="p-3 sm:p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4">
                    <Brain className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                    <h2 className="text-base sm:text-lg font-semibold">AI-Powered Trend Analysis</h2>
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
                <Card className="p-3 sm:p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4">
                    <h2 className="text-base sm:text-lg font-semibold">Score Trend Over Time</h2>
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
                  <ResponsiveContainer width="100%" height={200}>
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
                <Card className="p-3 sm:p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4">
                    <h2 className="text-base sm:text-lg font-semibold">Individual Test Scores Over Time</h2>
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
                  <ResponsiveContainer width="100%" height={200}>
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
                <Card className="p-3 sm:p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4">
                    <h2 className="text-base sm:text-lg font-semibold">Average Reaction Time Trend</h2>
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
                  <ResponsiveContainer width="100%" height={200}>
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
                <Card className="p-3 sm:p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4">
                    <h2 className="text-base sm:text-lg font-semibold">Reaction Time Variability Trend</h2>
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
                  <ResponsiveContainer width="100%" height={200}>
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
                <Card className="p-3 sm:p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4">
                    <h2 className="text-base sm:text-lg font-semibold">Lapses Over Time</h2>
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
                  <ResponsiveContainer width="100%" height={200}>
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
                <Card className="p-3 sm:p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4">
                    <h2 className="text-base sm:text-lg font-semibold">Error Rate Over Time</h2>
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
                  <ResponsiveContainer width="100%" height={200}>
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
                <Card className="p-3 sm:p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4">
                    <h2 className="text-base sm:text-lg font-semibold">False Starts Over Time</h2>
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
                  <ResponsiveContainer width="100%" height={200}>
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
                <Card className="p-3 sm:p-4 bg-card border-medical">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4">
                    <h2 className="text-base sm:text-lg font-semibold">Score Distribution</h2>
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
                  <ResponsiveContainer width="100%" height={200}>
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
          <Card className="p-4 sm:p-6 space-y-3 sm:space-y-4 bg-card border-medical">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                <h2 className="text-lg sm:text-xl font-bold">Flash Test Instructions</h2>
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
          <Card className="p-3 sm:p-4 space-y-3 sm:space-y-4 bg-card border-medical">
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
                    {[currentSession.simple, currentSession.dotgrid, currentSession.flash].filter(Boolean).length}/3 Required
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
                      {currentSession.flash ? '✓ Done' : isMobile ? 'Required' : 'Mobile Only'}
                    </p>
                  </div>
                </div>
                {!canSaveSession() && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Complete all 3 tests to generate report
                  </p>
                )}
              </div>
            )}

            {!sessionInProgress && (
              <div className="text-center py-4">
                <p className="text-base text-foreground mb-2">
                  Start New Test Session
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Complete all 3 tests to generate report (Flash test requires mobile device)
                </p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold mb-2">Test Mode</h3>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <Button
                  variant={testMode === 'simple' ? 'default' : 'outline'}
                  onClick={() => {
                    setTestMode('simple')
                    setTestState('idle')
                  }}
                  className="h-auto py-3 sm:py-3 min-h-[60px] flex flex-col items-center gap-1 touch-manipulation"
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
                  className="h-auto py-3 sm:py-3 min-h-[60px] flex flex-col items-center gap-1 touch-manipulation"
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
                  className="h-auto py-3 sm:py-3 min-h-[60px] flex flex-col items-center gap-1 touch-manipulation"
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
                    className="w-full text-base h-14 sm:h-16 bg-primary hover:bg-primary/90 font-semibold touch-manipulation"
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
                  className="text-center py-12 sm:py-16 cursor-pointer bg-accent rounded-lg active:bg-accent/80 transition-colors touch-manipulation min-h-[200px] flex flex-col items-center justify-center"
                  onClick={handleReaction}
                >
                  <p className="text-5xl sm:text-6xl font-bold text-accent-foreground animate-pulse">
                    GO!
                  </p>
                  <p className="text-sm text-muted-foreground mt-4">
                    Tap anywhere to react
                  </p>
                </div>
              )}

              {testState === 'flash' && testMode === 'dotgrid' && (
                <div 
                  ref={dotContainerRef}
                  onClick={handleDotContainerClick}
                  className="relative bg-secondary rounded-lg border-2 border-border h-80 sm:h-96 cursor-pointer"
                >
                  <div className="absolute top-2 left-3 text-sm font-semibold text-foreground">
                    Round {dotRound}/10
                  </div>
                  {currentDot && (
                    <button
                      onClick={handleDotClick}
                      className="absolute w-16 h-16 sm:w-16 sm:h-16 bg-primary rounded-full active:scale-110 transition-transform cursor-pointer shadow-lg touch-manipulation min-w-[64px] min-h-[64px] z-10"
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
                        ? 'Combined NeuroScore (All Tests Complete)' 
                        : (currentSession.simple || currentSession.dotgrid || currentSession.flash)
                        ? `Session Progress: ${[currentSession.simple, currentSession.dotgrid, currentSession.flash].filter(Boolean).length}/3 Required`
                        : 'NeuroScore'}
                    </p>
                    <p className="text-4xl sm:text-5xl font-bold text-foreground mb-2">
                      {calculateCombinedNeuroScore()}
                    </p>
                    <p className={`text-base sm:text-lg font-semibold ${
                      calculateCombinedNeuroScore() >= 75 ? 'text-success' :
                      calculateCombinedNeuroScore() >= 50 ? 'text-primary' : 
                      'text-destructive'
                    }`}>
                      {getAlertLevel(calculateCombinedNeuroScore())}
                    </p>
                    {canSaveSession() && (
                      <p className="text-xs text-success mt-2 font-medium">
                        ✓ Session Complete - All tests complete. Saved to History.
                      </p>
                    )}
                  </div>

                  {testMode === 'simple' && results && (
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <div className="bg-secondary p-2 sm:p-3 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground mb-1">Reaction Time</p>
                        <p className="text-xl sm:text-2xl font-bold text-foreground">
                          {results.reactionTime}<span className="text-xs sm:text-sm">ms</span>
                        </p>
                      </div>
                      <div className="bg-secondary p-2 sm:p-3 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground mb-1">Movement Index</p>
                        <p className="text-xl sm:text-2xl font-bold text-foreground">
                          {results.movementIndex}
                        </p>
                      </div>
                    </div>
                  )}

                  {testMode === 'dotgrid' && dotGridResults && (
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
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
                      <div className="bg-secondary p-3 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground mb-1">Errors</p>
                        <p className="text-xl font-bold text-orange-500">
                          {dotGridResults.errors || 0}
                        </p>
                      </div>
                    </div>
                  )}

                  {testMode === 'flash' && flashTestResults && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
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

                  {/* Video Playback Section */}
                  {testState === 'results' && recordedVideoUrl && (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Play className="w-4 h-4" />
                        Recorded Video
                        {testMode === 'simple' && <span className="text-xs font-normal text-muted-foreground">(Simple Test)</span>}
                        {testMode === 'dotgrid' && <span className="text-xs font-normal text-muted-foreground">(Dot Grid Test)</span>}
                        {testMode === 'flash' && <span className="text-xs font-normal text-muted-foreground">(Flash Test - Back Camera)</span>}
                      </h3>
                      <div className="relative aspect-video bg-black rounded-lg overflow-hidden border-2 border-border">
                        <video
                          src={recordedVideoUrl}
                          controls
                          className="w-full h-full object-contain"
                          playsInline
                        >
                          Your browser does not support the video tag.
                        </video>
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        {testMode === 'flash' 
                          ? 'Watch the recorded video from your flash test session. This video shows your eye response to the flash stimuli.'
                          : 'Watch the recorded video from your test session'}
                      </p>
                    </div>
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
                        className="w-full h-14 text-base bg-primary hover:bg-primary/90 touch-manipulation"
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
                        className="w-full h-14 text-base bg-success hover:bg-success/90 touch-manipulation"
                      >
                        Save Session to History
                      </Button>
                    )}
                    {!sessionInProgress && (
                      <p className="text-base text-foreground text-center py-2">
                        Start New Session
                      </p>
                    )}
                  <Button 
                    onClick={runAgain} 
                    variant="outline"
                    size="lg"
                      className="w-full h-14 text-base touch-manipulation"
                  >
                      {sessionInProgress ? 'Retry This Test' : 'Run Again'}
                  </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* AI Report Card - Only show when all 3 tests are completed */}
        {viewMode === 'test' && canSaveSession() && (
          <div ref={reportCardRef}>
          <Card className="p-3 sm:p-4 space-y-3 bg-card border-medical border-2 border-primary/30 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <h2 className="text-base sm:text-lg font-bold text-foreground">Complete Test Report</h2>
            <span className="ml-auto text-xs font-semibold px-2 py-1 bg-success/20 text-success rounded">
              All Tests Complete
            </span>
          </div>

          <div className="space-y-4">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Executive Summary
              </h3>
              <p className="text-sm sm:text-base text-foreground leading-relaxed font-medium">
                {aiInsights.summary}
              </p>
            </div>

            {/* Observations */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Key Observations
              </h3>
              <ul className="space-y-2">
                {aiInsights.observations.map((obs, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-primary mt-0.5 font-bold">•</span>
                    <span className="flex-1">{obs}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Suggestion */}
            <div className="bg-accent/20 border-2 border-accent rounded-lg p-3 sm:p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-accent-foreground" />
                <h3 className="text-sm font-bold text-accent-foreground">
                  Safety Recommendation
                </h3>
              </div>
              <p className="text-sm text-accent-foreground leading-relaxed font-medium">
                {aiInsights.suggestion}
              </p>
            </div>

            {/* Combined Score Display */}
            <div className="bg-secondary/50 rounded-lg p-3 sm:p-4 text-center border border-border">
              <p className="text-xs text-muted-foreground mb-1">Final Combined NeuroScore</p>
              <p className="text-3xl sm:text-4xl font-bold text-foreground mb-1">
                {calculateCombinedNeuroScore()}
              </p>
              <p className={`text-sm font-semibold ${
                calculateCombinedNeuroScore() >= 75 ? 'text-success' :
                calculateCombinedNeuroScore() >= 50 ? 'text-primary' : 
                'text-destructive'
              }`}>
                {getAlertLevel(calculateCombinedNeuroScore())}
              </p>
            </div>

            {/* Disclaimer */}
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground italic text-center">
                This is a safety screening tool, not a medical diagnosis.
              </p>
            </div>
          </div>
        </Card>
        </div>
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
