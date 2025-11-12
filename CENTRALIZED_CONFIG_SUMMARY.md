# Centralized Model Configuration - Implementation Summary

## What Was Done

Created a **centralized configuration system** for all AI models across the AceMind backend. Now you only need to update models in **ONE file** (`modelConfig.mjs`) instead of changing 7+ different files.

## Files Created

### 1. `modelConfig.mjs` (NEW)

**Single source of truth for all AI configuration**

Contains:

- `MODEL_PRICING` - All Gemini models with pricing (per 1M tokens)
- `SERVICE_MODEL_MAP` - Which model each service uses and why
- `ENDPOINT_TO_SERVICE` - Maps API endpoints to services
- Helper functions:
  - `getModelForService(serviceName)` - Get model by service name
  - `getModelForEndpoint(endpoint)` - Get model by API endpoint
  - `getModelPricing(modelName)` - Get pricing info
  - `calculateCost(model, inputTokens, outputTokens)` - Calculate costs
  - `getServiceConfig(serviceName)` - Get complete config
  - `printServiceConfigurations()` - Debug utility

### 2. `MODEL_CONFIG_GUIDE.md` (NEW)

**Complete documentation** on how to use the centralized config

Includes:

- Quick start guide
- How to change models
- How to add new services
- Cost optimization tips
- Debugging commands

## Files Updated

All AI service files now import from `modelConfig.mjs`:

1. ✅ **gemini_ai.mjs** - Syllabus parsing

   - Uses `getModelForService("syllabus")`
   - Returns: `gemini-2.0-flash`

2. ✅ **doubt_chat_ai.mjs** - Chat and suggestions

   - Uses `getModelForService("doubt-chat")`
   - Uses `getModelForService("suggested-questions")`
   - Returns: `gemini-2.0-flash-lite`

3. ✅ **getExpandedSubtopics.mjs** - Subtopic generation

   - Uses `getModelForService("expand-subtopics")`
   - Returns: `gemini-2.0-flash-lite`

4. ✅ **get_notes_gemini.mjs** - Notes generation

   - Uses `getModelForService("notes")`
   - Returns: `gemini-2.0-flash`

5. ✅ **getSyllabusContext.mjs** - Context generation

   - Uses `getModelForService("syllabus-context")`
   - Returns: `gemini-2.0-flash`

6. ✅ **generate_quiz_ai.mjs** - Quiz generation (3 stages)

   - Uses `getModelForService("generate-quiz")`
   - Returns: `gemini-2.5-flash`

7. ✅ **analyticsMiddleware.js** - API tracking

   - Uses `getModelForEndpoint(endpoint)`
   - Async import from ESM module

8. ✅ **analyticsDB.js** - Cost calculation

   - Imports `MODEL_PRICING` and `USD_TO_INR`
   - Async import with fallback

9. ✅ **retryUtils.mjs** - Retry logic
   - Added handling for `fetch failed` errors
   - Added network error codes (ECONNRESET, ETIMEDOUT, ENOTFOUND)

## Current Model Mapping

### CRITICAL Accuracy (Most Expensive)

- **generate-quiz**: `gemini-2.5-flash` ($0.30/$2.50 per 1M)
  - Why: Quiz questions MUST be factually correct

### HIGH Accuracy (Balanced)

- **notes**: `gemini-2.0-flash` ($0.10/$0.40 per 1M)
  - Why: Educational notes need good accuracy
- **syllabus**: `gemini-2.0-flash` ($0.10/$0.40 per 1M)
  - Why: Syllabus parsing needs accuracy
- **syllabus-context**: `gemini-2.0-flash` ($0.10/$0.40 per 1M)
  - Why: Context generation needs accuracy

### MEDIUM Accuracy (Most Cost-Effective)

- **expand-subtopics**: `gemini-2.0-flash-lite` ($0.075/$0.30 per 1M)
  - Why: Subtopic suggestions can be flexible
- **doubt-chat**: `gemini-2.0-flash-lite` ($0.075/$0.30 per 1M)
  - Why: Conversational, doesn't need highest accuracy
- **suggested-questions**: `gemini-2.0-flash-lite` ($0.075/$0.30 per 1M)
  - Why: Question suggestions can be creative

## How to Change Models Now

### Before (Changed in 7+ files)

```javascript
// gemini_ai.mjs
model: "gemini-2.0-flash";

// doubt_chat_ai.mjs
model: "gemini-2.0-flash-lite";

// getExpandedSubtopics.mjs
model: "gemini-2.0-flash-lite";

// get_notes_gemini.mjs
model: "gemini-2.0-flash";

// ... and 3 more files
```

### After (Changed in 1 file)

```javascript
// modelConfig.mjs
export const SERVICE_MODEL_MAP = {
  notes: {
    model: "gemini-2.0-flash", // Change ONLY here
    reason: "Educational notes need good accuracy",
    accuracy: "high",
  },
};
```

**All 7+ files automatically use the new model!**

## Example: Switching Notes to Flash Lite

Want to reduce notes generation cost?

1. Open `modelConfig.mjs`
2. Find the `notes` service
3. Change model:
   ```javascript
   "notes": {
     model: "gemini-2.0-flash-lite", // Was: gemini-2.0-flash
     reason: "Acceptable accuracy for notes, 25% cheaper",
     accuracy: "medium", // Was: high
   },
   ```
4. **Done!** All API calls use the new model.

**Savings**: 25% on input tokens, 25% on output tokens

## Fixed Issues

### 1. "fetch failed" Error

**Problem**: Network errors weren't being retried
**Solution**: Updated `retryUtils.mjs` to handle:

- `fetch failed` errors
- `ECONNRESET` (connection reset)
- `ETIMEDOUT` (timeout)
- `ENOTFOUND` (DNS lookup failed)

These errors now trigger automatic retry with exponential backoff.

### 2. Model Changes Required Editing Multiple Files

**Problem**: Changing a model required updating 7+ files
**Solution**: Centralized all model configs in `modelConfig.mjs`

## Benefits

1. ✅ **Single Update Point** - Change model once, applies everywhere
2. ✅ **Consistency** - All services guaranteed to use correct model
3. ✅ **Documentation** - Each service explains why it uses that model
4. ✅ **Easy Optimization** - Compare costs/accuracy in one place
5. ✅ **Type Safety** - JSDoc documentation for all functions
6. ✅ **Future-Proof** - Easy to add new models/services
7. ✅ **Cost Tracking** - Centralized pricing makes analytics accurate

## Testing

To verify everything works:

```bash
# 1. Test quiz generation
curl -X POST http://localhost:5000/api/generate-quiz \
  -H "Content-Type: application/json" \
  -d '{"topic":"Math","difficulty":"beginner","count":5}'

# 2. Test notes generation
curl -X POST http://localhost:5000/api/notes \
  -H "Content-Type: application/json" \
  -d '{"topic":"Physics","subtopic":"Motion"}'

# 3. Test subtopic expansion
curl -X POST http://localhost:5000/api/expand-subtopics \
  -H "Content-Type: application/json" \
  -d '{"subtopic":"Calculus","level":1}'
```

All should work with the new centralized config.

## Next Steps

1. **Monitor costs** - Check if model selections are optimal
2. **Test accuracy** - Verify output quality with cheaper models
3. **Consider upgrades** - If needed, easy to upgrade specific services
4. **Add new services** - Follow the pattern in `modelConfig.mjs`

## Quick Reference

```javascript
// Import in ESM files (.mjs)
import { getModelForService } from "./modelConfig.mjs";

// Use in your code
const model = getModelForService("notes");
await genAI.models.generateContent({ model, contents: [...] });
```

## Support Files

- `modelConfig.mjs` - Main configuration file
- `MODEL_CONFIG_GUIDE.md` - Detailed usage guide
- `MODEL_OPTIMIZATION.md` - Cost analysis (existing)

---

**Result**: You can now change AI models for the entire application by editing just ONE line in ONE file! 🎉
