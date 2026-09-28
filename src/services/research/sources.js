/**
 * Trusted RSS feeds and curated verified AI tools repository
 */

const RSS_FEEDS = [
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    category: 'AI News & Startups'
  },
  {
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    category: 'Consumer AI & Big Tech'
  },
  {
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    category: 'Technology & AI'
  },
  {
    name: 'MIT Technology Review',
    url: 'https://www.technologyreview.com/feed/',
    category: 'Deep Tech & AI Research'
  }
];

// Curated verified catalog of high-impact AI tools for zero-latency or offline fallback
const VERIFIED_FALLBACK_TOOLS = [
  {
    tool_name: 'NotebookLM Audio Overview',
    topic: 'Google NotebookLM turns any notes or PDF into an interactive AI podcast with two hosts',
    source_url: 'https://notebooklm.google.com',
    source_title: 'Google NotebookLM Audio Overview Feature',
    summary: 'NotebookLM by Google allows users to upload documents, PDFs, and notes, and automatically generates an interactive two-person audio podcast summarizing the materials with deep nuance and natural banter.'
  },
  {
    tool_name: 'Bolt.new',
    topic: 'Bolt.new lets you prompt, build, edit, and deploy full-stack web applications entirely in your browser',
    source_url: 'https://bolt.new',
    source_title: 'Bolt.new Full-Stack Web App Generator by StackBlitz',
    summary: 'Bolt.new uses WebContainers to run complete Node.js environments directly inside the browser, allowing users to build and deploy complete production apps with AI prompts in seconds.'
  },
  {
    tool_name: 'Perplexity Deep Research',
    topic: 'Perplexity Deep Research automates comprehensive web research and produces multi-page verified reports',
    source_url: 'https://www.perplexity.ai',
    source_title: 'Perplexity AI Deep Research Release',
    summary: 'Perplexity Deep Research searches hundreds of web sources, reads academic papers and articles in real time, and synthesizes complete, cited, in-depth reports within minutes.'
  },
  {
    tool_name: 'Claude 3.7 Sonnet Hybrid Reasoning',
    topic: 'Anthropic Claude 3.7 Sonnet introduces hybrid reasoning allowing instantaneous answers or deep chain-of-thought',
    source_url: 'https://www.anthropic.com/news/claude-3-7-sonnet',
    source_title: 'Anthropic Releases Claude 3.7 Sonnet',
    summary: 'Claude 3.7 Sonnet is the first hybrid model that gives users control over thinking budget, achieving state-of-the-art results on software engineering benchmarks and visual comprehension.'
  },
  {
    tool_name: 'ElevenLabs Reader App',
    topic: 'ElevenLabs Reader reads any article, PDF, or e-book with studio-grade natural human voices for free',
    source_url: 'https://elevenlabs.io/reader-app',
    source_title: 'ElevenLabs Reader App for iOS and Android',
    summary: 'ElevenLabs Reader app uses expressive AI narration to turn any text, article, or PDF into realistic audiobooks narrated by iconic voices including Judy Garland and Burt Reynolds.'
  },
  {
    tool_name: 'Recraft V3',
    topic: 'Recraft V3 generates vector graphics, brand design sets, and SVGs with editable vector paths',
    source_url: 'https://www.recraft.ai',
    source_title: 'Recraft V3 AI Graphic Design Suite',
    summary: 'Recraft V3 is an AI design tool built specifically for designers that can generate vector art, 3D icons, clean brand typography, and editable SVGs.'
  },
  {
    tool_name: 'Cursor AI',
    topic: 'Cursor is the AI-first code editor that predicts your next multi-line edits and codebase changes',
    source_url: 'https://cursor.com',
    source_title: 'Cursor AI Code Editor',
    summary: 'Cursor is a VS Code fork built with custom model integration that understands your entire repository, proposing multi-file diffs and predictive line tab-completions.'
  },
  {
    tool_name: 'Kling AI 1.5',
    topic: 'Kling AI generates hyper-realistic 1080p video with accurate physical motion and cinematic lighting',
    source_url: 'https://klingai.com',
    source_title: 'Kling AI Next-Gen Video Generator',
    summary: 'Kling AI produces high-definition cinematic video clips up to 10 seconds with precise camera motions, dynamic lighting, and realistic simulation of physical dynamics.'
  },
  {
    tool_name: 'Suno V4',
    topic: 'Suno V4 creates complete studio-quality songs with full vocals and instrumentation from a text prompt',
    source_url: 'https://suno.com',
    source_title: 'Suno AI Music Generation Version 4',
    summary: 'Suno V4 delivers crisp, radio-ready audio quality, genre blending, and emotional vocal performances generated in under 60 seconds from a text description.'
  },
  {
    tool_name: 'Jan AI',
    topic: 'Jan AI runs 100% private, offline open-source LLMs on your Mac or PC without an internet connection',
    source_url: 'https://jan.ai',
    source_title: 'Jan AI 100% Private Offline AI Assistant',
    summary: 'Jan AI is an open-source, local alternative to ChatGPT that runs Llama, DeepSeek, and Mistral models entirely on your computer hardware with zero data leaving your machine.'
  }
];

module.exports = {
  RSS_FEEDS,
  VERIFIED_FALLBACK_TOOLS
};
