# AceMind Backend

A Node.js Express API that processes educational syllabi using AI. Supports both **Ollama** (local) and **Google Gemini** (cloud) AI providers.

## 🚀 Features

- **Dual AI Support**: Choose between Ollama (free, local) and Gemini (cloud-based)
- **Structured Output**: Converts unstructured syllabi into organized JSON format
- **Schema Validation**: Uses Zod for data validation
- **RESTful API**: Clean endpoints for syllabus processing
- **Error Handling**: Comprehensive error handling and logging
- **CORS Enabled**: Ready for frontend integration

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **Ollama** (for local AI) - Optional
- **Google Gemini API Key** (for cloud AI) - Optional

## 🛠 Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` and add your Gemini API key (optional):

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

**Get your Gemini API key**: [Google AI Studio](https://makersuite.google.com/app/apikey)

### 3. Ollama Setup (Optional)

For local AI processing with Ollama:

```bash
# Install Ollama from: https://ollama.ai/
# Then pull the required model:
ollama pull llama3

# Start Ollama service:
ollama run llama3
```

## 🏃‍♂️ Quick Start

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Enhanced Server (Both AI Providers)

```bash
node index_enhanced.js
```

The server will start on `http://localhost:8000`

## 📡 API Endpoints

### Health Check

```http
GET /api/health
```

### Process Syllabus (Flexible)

```http
POST /api/submit
Content-Type: application/json

{
  "topic": "Mobile Computing",
  "syllabus": "UNIT 1: Introduction...",
  "aiProvider": "gemini"  // "ollama" or "gemini"
}
```

### Ollama-Specific Endpoint

```http
POST /api/submit-ollama
Content-Type: application/json

{
  "topic": "Mobile Computing",
  "syllabus": "UNIT 1: Introduction..."
}
```

### Gemini-Specific Endpoint

```http
POST /api/submit-gemini
Content-Type: application/json

{
  "topic": "Mobile Computing",
  "syllabus": "UNIT 1: Introduction..."
}
```

## 📝 Example Usage

### Using cURL with Gemini:

```bash
curl -X POST http://localhost:8000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Mobile Computing",
    "syllabus": "UNIT 1: Introduction to Mobile Computing (10 hours) - Overview of mobile computing systems, architectures...",
    "aiProvider": "gemini"
  }'
```

### Using cURL with Ollama:

```bash
curl -X POST http://localhost:8000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Mobile Computing",
    "syllabus": "UNIT 1: Introduction to Mobile Computing (10 hours) - Overview of mobile computing systems...",
    "aiProvider": "ollama"
  }'
```

## 📊 Response Format

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
      "description": "Comprehensive course on mobile computing technologies...",
      "objectives": [
        "Understand mobile computing fundamentals",
        "Learn wireless communication protocols"
      ],
      "units": [
        {
          "unit_num": "1",
          "title": "Introduction to Mobile Computing",
          "duration": "10 hours",
          "sub_topics": [
            "Mobile computing overview",
            "System architectures",
            "Wireless technologies"
          ]
        }
      ]
    }
  }
}
```

## 🧪 Testing

### Test Gemini Setup

```bash
node test_gemini.mjs
```

### Test Both AI Providers

```bash
node test_both_ais.mjs
```

### API Testing

```bash
# Health check
curl http://localhost:8000/api/health

# Test with sample data
curl -X POST http://localhost:8000/api/submit \
  -H "Content-Type: application/json" \
  -d '{"topic":"Test","syllabus":"Unit 1: Sample content","aiProvider":"gemini"}'
```

## 🏗 Project Structure

```
backend/
├── 📄 index.js                 # Main server (Ollama only)
├── 📄 index_enhanced.js        # Enhanced server (both AIs)
├── 📄 get_ai_output.mjs        # Ollama implementation
├── 📄 gemini_ai.mjs           # Gemini implementation
├── 📄 ai_outpt_schema.mjs     # Zod validation schema
├── 📄 test_gemini.mjs         # Gemini testing script
├── 📄 test_both_ais.mjs       # Compare both AIs
├── 📄 .env.example            # Environment template
├── 📄 package.json            # Dependencies
└── 📄 README.md               # This file
```

## ⚙️ Configuration

### Environment Variables

| Variable         | Description                 | Required      |
| ---------------- | --------------------------- | ------------- |
| `GEMINI_API_KEY` | Google Gemini API key       | For Gemini AI |
| `PORT`           | Server port (default: 8000) | No            |

### AI Provider Comparison

| Feature          | Ollama                | Gemini            |
| ---------------- | --------------------- | ----------------- |
| **Cost**         | Free                  | Pay-per-use       |
| **Privacy**      | Local (private)       | Cloud-based       |
| **Speed**        | Hardware dependent    | Fast              |
| **Setup**        | Requires installation | API key only      |
| **Availability** | Local only            | High availability |
| **Model**        | llama3                | gemini-1.5-flash  |

## 🔧 Development

### Available Scripts

```bash
npm start          # Production server
npm run dev        # Development with nodemon
node index.js      # Standard server (Ollama)
node index_enhanced.js  # Enhanced server (both AIs)
```

### Adding New AI Providers

1. Create a new implementation file (e.g., `claude_ai.mjs`)
2. Follow the same function signature: `GetAiOutput(topic, syllabus)`
3. Return data matching `MobileComputingSyllabusSchema`
4. Add endpoint in `index_enhanced.js`

## 🐛 Troubleshooting

### Common Issues

**1. Ollama Connection Failed**

```bash
# Ensure Ollama is running
ollama serve
ollama run llama3
```

**2. Gemini API Error**

- Check your API key in `.env`
- Verify API key permissions
- Check quota limits

**3. JSON Parsing Errors**

- AI responses sometimes contain malformed JSON
- The code includes sanitization functions
- Check logs for raw AI responses

**4. Port Already in Use**

```bash
# Change port in .env or kill existing process
PORT=3000 npm start
```

## 📚 Dependencies

### Core Dependencies

- `express` - Web framework
- `cors` - Cross-origin resource sharing
- `@google/generative-ai` - Gemini AI integration
- `@langchain/ollama` - Ollama integration
- `zod` - Schema validation
- `dotenv` - Environment variables

### Development Dependencies

- `nodemon` - Development server with auto-reload

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with both AI providers
5. Submit a pull request

## 📄 License

ISC License

## 🆘 Support

For issues and questions:

1. Check the troubleshooting section
2. Review the logs for error details
3. Test with the provided test scripts
4. Create an issue in the repository
