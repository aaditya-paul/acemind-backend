# AceMind Backend - AI Integration Guide

This backend supports both **Ollama** and **Google Gemini** AI providers for processing syllabus data.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` and add your Gemini API key:

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

**Get your Gemini API key from:** https://makersuite.google.com/app/apikey

### 3. For Ollama Setup

Make sure Ollama is installed and running with the llama3 model:

```bash
# Install Ollama (if not already installed)
# Download from: https://ollama.ai/

# Pull the llama3 model
ollama pull llama3

# Start Ollama (if not running)
ollama serve
```

## Usage

### Option 1: Using Individual AI Functions

#### Ollama (Original)

```javascript
import {GetAiOutput} from "./get_ai_output.mjs";

const result = await GetAiOutput(topic, syllabus);
```

#### Gemini (New)

```javascript
import {GetAiOutputGemini} from "./gemini_ai.mjs";

const result = await GetAiOutputGemini(topic, syllabus);
```

### Option 2: Using API Endpoints

#### Flexible Endpoint (Choose AI Provider)

```bash
POST /api/submit
Content-Type: application/json

{
  "topic": "Mobile Computing",
  "syllabus": "Your syllabus content here...",
  "aiProvider": "gemini"  // or "ollama" (default)
}
```

#### Specific Endpoints

```bash
# Ollama only
POST /api/submit-ollama

# Gemini only
POST /api/submit-gemini
```

### Example Request with cURL

#### Using Gemini:

```bash
curl -X POST http://localhost:8000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Mobile Computing",
    "syllabus": "UNIT 1: Introduction to Mobile Computing...",
    "aiProvider": "gemini"
  }'
```

#### Using Ollama:

```bash
curl -X POST http://localhost:8000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Mobile Computing",
    "syllabus": "UNIT 1: Introduction to Mobile Computing...",
    "aiProvider": "ollama"
  }'
```

## Response Format

Both AI providers return the same structured format:

```json
{
  "success": true,
  "message": "Data received and processed successfully using gemini",
  "data": {
    "topic": "Mobile Computing",
    "syllabus": "...",
    "aiProvider": "gemini",
    "aiResponse": {
      "courseTitle": "Mobile Computing",
      "description": "Course description...",
      "objectives": ["objective1", "objective2"],
      "units": [
        {
          "unit_num": "1",
          "title": "Introduction to Mobile Computing",
          "duration": "10",
          "sub_topics": ["topic1", "topic2"]
        }
      ]
    }
  }
}
```

## Testing

Test both AI providers:

```bash
node test_both_ais.mjs
```

## Running the Server

### Standard version (Ollama only):

```bash
npm start
# or
node index.js
```

### Enhanced version (Both AI providers):

```bash
node index_enhanced.js
```

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/submit` - Flexible endpoint (specify aiProvider)
- `POST /api/submit-ollama` - Ollama-specific endpoint
- `POST /api/submit-gemini` - Gemini-specific endpoint

## Comparison: Ollama vs Gemini

| Feature         | Ollama                      | Gemini            |
| --------------- | --------------------------- | ----------------- |
| **Cost**        | Free (local)                | Pay-per-use       |
| **Speed**       | Depends on hardware         | Fast (cloud)      |
| **Privacy**     | Fully local                 | Cloud-based       |
| **Setup**       | Requires local installation | API key only      |
| **Reliability** | Depends on local resources  | High availability |
| **Model**       | llama3                      | gemini-1.5-flash  |

## Error Handling

Both implementations include comprehensive error handling:

- JSON parsing errors
- Schema validation with Zod
- API connectivity issues
- Missing environment variables

## File Structure

```
backend/
├── get_ai_output.mjs      # Ollama implementation
├── gemini_ai.mjs          # Gemini implementation
├── ai_outpt_schema.mjs    # Shared Zod schema
├── index.js               # Original server (Ollama only)
├── index_enhanced.js      # Enhanced server (both AIs)
├── test_both_ais.mjs      # Testing script
├── .env.example           # Environment template
└── package.json           # Dependencies
```
