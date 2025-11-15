import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
})

export async function POST(request: NextRequest) {
  try {
    const { images, testType, flashTimestamps } = await request.json()

    if (!images || images.length === 0) {
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400 }
      )
    }

    const validImages = images.filter((img: string) => img && img.length > 0)

    if (validImages.length === 0) {
      return NextResponse.json(
        { error: 'Failed to process frames' },
        { status: 400 }
      )
    }

    // For flash test, analyze before and after flash separately
    let prompt = ''
    if (testType === 'flash' && flashTimestamps && flashTimestamps.length > 0) {
      // Select key frames: before flash, during flash, after flash
      const beforeCount = Math.min(3, Math.floor(validImages.length * 0.3))
      const afterCount = Math.min(3, Math.floor(validImages.length * 0.3))
      
      prompt = `You are analyzing a video of a person's eye during a flash test. The images show:
1. BEFORE FLASH: The first ${beforeCount} images show the eye before the flash
2. AFTER FLASH: The last ${afterCount} images show the eye after the flash

Please analyze:
- Number of blinks (count each complete blink: eye closes and reopens)
- Pupil dilation response to the flash (compare before vs after)
- Eye movement and stability
- Any signs of fatigue (drooping eyelids, slow reactions, excessive blinking)
- Attention level (1-100 scale)

Provide your analysis in JSON format:
{
  "blinkCount": number,
  "pupilDilationChange": "none|slight|moderate|significant",
  "eyeStability": "stable|slight_movement|unstable",
  "fatigueIndicators": ["indicator1", "indicator2"],
  "attentionScore": number (1-100),
  "analysis": "detailed text analysis"
}`
    } else {
      // For regular tests (simple, dotgrid)
      prompt = `You are analyzing a video of a person during a cognitive test. Please analyze:
- Number of blinks (count each complete blink: eye closes and reopens)
- Head movement (minimal|moderate|excessive)
- Facial micro-expressions (none|few|many)
- Attention and focus level (1-100 scale)
- Any signs of fatigue or distraction

Provide your analysis in JSON format:
{
  "blinkCount": number,
  "headMovement": "minimal|moderate|excessive",
  "microExpressions": number,
  "attentionScore": number (1-100),
  "averageMovement": number (0-100, where 0 is no movement),
  "fatigueIndicators": ["indicator1", "indicator2"],
  "analysis": "detailed text analysis"
}`
    }

    // Use GPT-4 Vision to analyze the images
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...validImages.slice(0, 10).map((img: string) => ({
              type: 'image_url' as const,
              image_url: {
                url: `data:image/jpeg;base64,${img}`
              }
            }))
          ]
        }
      ],
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    })

    const analysis = JSON.parse(response.choices[0].message.content || '{}')

    return NextResponse.json({
      success: true,
      analysis
    })
  } catch (error: any) {
    console.error('Error analyzing video:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to analyze video' },
      { status: 500 }
    )
  }
}

