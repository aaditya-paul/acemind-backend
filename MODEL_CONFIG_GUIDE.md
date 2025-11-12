# Model Configuration Guide

## Overview

All AI model configurations, pricing, and service mappings are now centralized in `modelConfig.mjs`. This single source of truth makes it easy to update models across the entire application.

## Quick Start

### Importing the Config

```javascript
// ESM modules (.mjs files)
import { getModelForService, getModelPricing } from "./modelConfig.mjs";

// CommonJS modules (.js files) - use dynamic import
let modelConfig;
(async () => {
  modelConfig = await import("./modelConfig.mjs");
})();
```

### Getting the Right Model

```javascript
// Get model by service name
const model = getModelForService("generate-quiz"); // Returns "gemini-2.5-flash"

// Get model by API endpoint
const model = getModelForEndpoint("/api/notes"); // Returns "gemini-2.0-flash"
```

### Getting Pricing Info

```javascript
// Get pricing for a specific model
const pricing = getModelPricing("gemini-2.5-flash");
// Returns: { input: 0.3, output: 2.5, description: "...", tier: "premium" }

// Calculate cost for an API call
const cost = calculateCost("gemini-2.5-flash", 1000, 500);
// Returns: { costs: { totalUSD: 1.55, totalINR: 137.30 }, ... }
```

## Service Tiers

### CRITICAL Accuracy (Use 2.5-flash)

- **generate-quiz**: Quiz questions MUST be factually correct
- **Cost**: $0.30/$2.50 per 1M tokens

### HIGH Accuracy (Use 2.0-flash)

- **notes**: Educational notes need good accuracy
- **syllabus**: Syllabus parsing needs accuracy
- **syllabus-context**: Context generation needs accuracy
- **Cost**: $0.10/$0.40 per 1M tokens (67-84% cheaper)

### MEDIUM Accuracy (Use 2.0-flash-lite)

- **expand-subtopics**: Subtopic suggestions can be flexible
- **doubt-chat**: Conversational, doesn't need highest accuracy
- **suggested-questions**: Question suggestions can be creative
- **Cost**: $0.075/$0.30 per 1M tokens (75-88% cheaper)

## Updating Models

### Changing a Service's Model

1. Open `modelConfig.mjs`
2. Find the service in `SERVICE_MODEL_MAP`
3. Update the `model` field:

```javascript
export const SERVICE_MODEL_MAP = {
  "generate-quiz": {
    model: "gemini-2.5-flash", // Change this
    reason: "Quiz questions MUST be factually correct",
    accuracy: "critical",
  },
  // ... other services
};
```

4. **That's it!** All files automatically use the new model.

### Adding a New Service

```javascript
export const SERVICE_MODEL_MAP = {
  // ... existing services
  "my-new-service": {
    model: "gemini-2.0-flash-lite",
    reason: "Explain why this model was chosen",
    accuracy: "medium", // critical, high, or medium
  },
};

export const ENDPOINT_TO_SERVICE = {
  // ... existing endpoints
  "/api/my-new-endpoint": "my-new-service",
};
```

### Updating Pricing

Pricing is updated in `MODEL_PRICING`:

```javascript
export const MODEL_PRICING = {
  "gemini-2.5-flash": {
    input: 0.3, // $ per 1M tokens
    output: 2.5,
    description: "Flash 2.5 - Hybrid Reasoning, 1M context",
    tier: "premium",
    contextWindow: 1_000_000,
  },
  // ... other models
};
```

## Files Using Model Config

All AI service files now import from `modelConfig.mjs`:

- ✅ `gemini_ai.mjs` - Syllabus parsing
- ✅ `doubt_chat_ai.mjs` - Chat and suggestions
- ✅ `getExpandedSubtopics.mjs` - Subtopic generation
- ✅ `get_notes_gemini.mjs` - Notes generation
- ✅ `getSyllabusContext.mjs` - Context generation
- ✅ `generate_quiz_ai.mjs` - Quiz generation
- ✅ `analyticsMiddleware.js` - Analytics tracking
- ✅ `analyticsDB.js` - Cost calculation

## Benefits

1. **Single Update Point**: Change a model once, applies everywhere
2. **Consistency**: All services use the correct model
3. **Documentation**: Each service explains why it uses that model
4. **Easy Optimization**: Compare costs and accuracy in one place
5. **Type Safety**: JSDoc documentation for all functions

## Cost Optimization Example

Want to reduce costs? Check the service tier and consider:

```javascript
// Before: Using 2.0-flash for chat (medium accuracy needed)
"doubt-chat": {
  model: "gemini-2.0-flash", // $0.10/$0.40 per 1M
  accuracy: "medium",
},

// After: Switch to 2.0-flash-lite (25% cheaper)
"doubt-chat": {
  model: "gemini-2.0-flash-lite", // $0.075/$0.30 per 1M
  accuracy: "medium",
},
```

**Savings**: 25% on input, 25% on output for that service.

## Debugging

Print all service configurations:

```javascript
import { printServiceConfigurations } from "./modelConfig.mjs";

printServiceConfigurations();
```

Output:

```
🎯 SERVICE MODEL CONFIGURATIONS
================================================================================

📌 GENERATE-QUIZ (critical accuracy)
   Model: gemini-2.5-flash
   Reason: Quiz questions MUST be factually correct
   Cost: $0.3/$2.5 per 1M tokens

📌 NOTES (high accuracy)
   Model: gemini-2.0-flash
   Reason: Educational notes need good accuracy
   Cost: $0.1/$0.4 per 1M tokens
...
```

## Model Tiers

Models are organized by tier:

- **Ultra**: gemini-2.5-pro ($1.25/$10.00)
- **Premium**: gemini-2.5-flash ($0.30/$2.50)
- **Standard**: gemini-2.0-flash ($0.10/$0.40)
- **Economy**: gemini-2.0-flash-lite ($0.075/$0.30)
- **Free**: gemini-2.0-flash-exp ($0/$0)

Access via:

```javascript
import { MODELS_BY_TIER } from "./modelConfig.mjs";
console.log(MODELS_BY_TIER.economy); // ["gemini-2.0-flash-lite", "gemini-1.5-flash"]
```

## Best Practices

1. **Always use getModelForService()** - Never hardcode model names
2. **Document your reason** - Explain why you chose that model
3. **Match accuracy to need** - Don't overspend on models
4. **Update pricing quarterly** - Google may adjust prices
5. **Test after changes** - Verify all endpoints still work

## Support

Questions? Check these functions in `modelConfig.mjs`:

- `getModelForService(serviceName)` - Get model for a service
- `getModelForEndpoint(endpoint)` - Get model for an API endpoint
- `getModelPricing(modelName)` - Get pricing info
- `calculateCost(model, inputTokens, outputTokens)` - Calculate costs
- `getServiceConfig(serviceName)` - Get complete service config
