// server.js - OpenAI to NVIDIA NIM API Proxy (Railway-ready)

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// 🚨 QUAN TRỌNG: Railway cấp PORT động
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// NVIDIA NIM config
const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

if (!NIM_API_KEY) {
  console.error('❌ Missing NIM_API_KEY');
  process.exit(1);
}

// Toggle
const SHOW_REASONING = false;
const ENABLE_THINKING_MODE = false;

// Model mapping
const MODEL_MAPPING = {
  'gpt-3.5-turbo': 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'gpt-4': 'qwen/qwen3-coder-480b-a35b-instruct',
  'gpt-4-turbo': 'moonshotai/kimi-k2-instruct-0905',
  'gpt-4o': 'deepseek-ai/deepseek-v3.1',
  'claude-3-opus': 'openai/gpt-oss-120b',
  'claude-3-sonnet': 'openai/gpt-oss-20b',
  'gemini-pro': 'qwen/qwen3-next-80b-a3b-thinking'
};

// ✅ Health check (Railway bắt buộc)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'nim-proxy'
  });
});

// List models (OpenAI compatible)
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: Object.keys(MODEL_MAPPING).map(id => ({
      id,
      object: 'model',
      owned_by: 'railway-nim'
    }))
  });
});

// Chat completions
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, stream } = req.body;

    const nimModel =
      MODEL_MAPPING[model] || 'meta/llama-3.1-8b-instruct';

    const payload = {
      model: nimModel,
      messages,
      temperature: temperature ?? 0.6,
      max_tokens: max_tokens ?? 2048,
      stream: stream ?? false,
      ...(ENABLE_THINKING_MODE && {
        extra_body: { chat_template_kwargs: { thinking: true } }
      })
    };

    const response = await axios.post(
      `${NIM_API_BASE}/chat/completions`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: response.data.choices.map((c, i) => ({
        index: i,
        message: {
          role: 'assistant',
          content: SHOW_REASONING && c.message.reasoning_content
            ? `<think>\n${c.message.reasoning_content}\n</think>\n\n${c.message.content}`
            : c.message.content
        },
        finish_reason: c.finish_reason
      })),
      usage: response.data.usage ?? {}
    });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({
      error: {
        message: 'Proxy error',
        detail: err.response?.data || err.message
      }
    });
  }
});

// 404
app.all('*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// 🚨 CỰC KỲ QUAN TRỌNG CHO RAILWAY
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
