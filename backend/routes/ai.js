import express from 'express';
import OpenAI from 'openai';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// @route   POST /api/ai/draft
// @desc    Generate AI response draft for ticket
// @access  Private
router.post('/draft', protect, async (req, res) => {
  try {
    const { ticketContent, customerMessage, tone = 'professional' } = req.body;

    if (!ticketContent && !customerMessage) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ticket content or customer message is required' 
      });
    }

    const prompt = `
      You are a helpful customer support agent. Draft a professional response to the following customer inquiry.
      
      Ticket Context: ${ticketContent || 'N/A'}
      Customer Message: ${customerMessage || 'N/A'}
      
      Tone: ${tone}
      
      Guidelines:
      - Be empathetic and understanding
      - Provide clear, actionable solutions
      - Keep it concise but thorough
      - Use professional language
      - Include next steps if applicable
      
      Response:
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are an expert customer support representative for a help desk portal. Your responses are professional, empathetic, and solution-oriented.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const draft = completion.choices[0].message.content;

    res.json({
      success: true,
      data: {
        draft,
        model: 'gpt-3.5-turbo',
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('AI draft generation error:', error);
    
    if (error.response) {
      return res.status(500).json({ 
        success: false, 
        message: `OpenAI API error: ${error.response.data?.error?.message || 'Unknown error'}` 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate AI draft. Please try again.' 
    });
  }
});

// @route   POST /api/ai/sentiment
// @desc    Analyze sentiment of ticket message
// @access  Private
router.post('/sentiment', protect, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Message is required' 
      });
    }

    const prompt = `
      Analyze the sentiment of this customer message and provide:
      1. Sentiment (positive/neutral/negative)
      2. Urgency level (low/medium/high)
      3. Key concerns (list)
      4. Suggested priority (low/medium/high/urgent)
      
      Message: "${message}"
      
      Respond in JSON format only.
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a sentiment analysis expert. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 300
    });

    let analysis;
    try {
      analysis = JSON.parse(completion.choices[0].message.content);
    } catch {
      analysis = {
        sentiment: 'neutral',
        urgency: 'medium',
        concerns: ['Unable to parse'],
        suggestedPriority: 'medium'
      };
    }

    res.json({
      success: true,
      data: {
        analysis,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Sentiment analysis error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to analyze sentiment' 
    });
  }
});

export default router;
