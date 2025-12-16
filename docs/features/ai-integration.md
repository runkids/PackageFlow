# AI Integration

Connect multiple AI providers and use intelligent assistance throughout PackageFlow.

## Overview

PackageFlow supports multiple AI providers for intelligent features like:

- Commit message generation
- Code analysis
- Security advisory summaries
- Custom AI prompts

<!-- TODO: Add screenshot of AI settings panel -->

## Supported Providers

| Provider | Models | Auth |
|----------|--------|------|
| **OpenAI** | GPT-3.5, GPT-4, GPT-4 Turbo | API Key |
| **Anthropic** | Claude 3 family | API Key |
| **Google** | Gemini Pro, Gemini Ultra | API Key |
| **Ollama** | Any local model | Local |
| **LM Studio** | Any local model | Local |

## Adding AI Services

### Cloud Providers (OpenAI, Anthropic, Google)

1. Go to **Settings** → **AI Services**
2. Click **Add Service**
3. Select the provider
4. Enter your API key
5. Click **Verify & Save**

<!-- TODO: Add screenshot of add service dialog -->

### Local Providers (Ollama, LM Studio)

1. Ensure Ollama/LM Studio is running locally
2. Go to **Settings** → **AI Services**
3. Click **Add Service**
4. Select **Ollama** or **LM Studio**
5. Enter the local URL (default: `http://localhost:11434`)
6. Click **Connect**

## API Key Security

API keys are encrypted using AES-256-GCM and stored securely:

- Keys are never exposed in logs
- Encrypted at rest
- Stored in your system's keychain (macOS)

## Selecting Models

### Per-Service Models

Each service has available models:

1. Click on a service
2. Click **Fetch Models**
3. Select your preferred default model

### Per-Feature Models

Choose different models for different tasks:

- Commit messages: Faster model (GPT-3.5)
- Code review: More capable model (GPT-4)

## AI Features

### Commit Message Generation

Generate meaningful commit messages from your diffs:

1. Stage your changes
2. Click the **AI** button in the commit form
3. AI analyzes the diff and generates a message
4. Edit if needed, then commit

<!-- TODO: Add gif of AI commit message generation -->

### Code Analysis (Coming Soon)

AI-powered code review suggestions.

### Security Summaries (Coming Soon)

Plain-language explanations of security vulnerabilities.

## Prompt Templates

Customize how AI generates content with templates.

### Default Templates

PackageFlow includes templates for:

- Git commit messages
- Pull request descriptions
- Code review comments
- Release notes
- Security advisories

### Creating Custom Templates

1. Go to **Settings** → **AI Services** → **Templates**
2. Click **New Template**
3. Configure:
   - Name
   - Category
   - Prompt text with variables
4. Save

<!-- TODO: Add screenshot of template editor -->

### Template Variables

Use variables in your prompts:

| Variable | Description |
|----------|-------------|
| `{diff}` | Git diff content |
| `{code}` | Selected code |
| `{file_path}` | Current file path |
| `{language}` | File language |
| `{project_name}` | Project name |

### Example Template

**Commit Message Template:**

```
Based on the following git diff, generate a concise commit message
following conventional commit format.

Focus on:
- What changed (not how)
- Why it changed (if apparent)
- Keep the first line under 72 characters

Diff:
{diff}
```

### Per-Project Templates

Override templates for specific projects:

1. Open a project
2. Go to **Settings** → **AI**
3. Select template overrides
4. Customize as needed

## Testing Services

### Connection Test

Verify your API key works:

1. Click **Test Connection** on a service
2. PackageFlow sends a simple request
3. Shows success or error details

### Latency Test

Check response times:

1. Click **Test Latency**
2. Multiple requests are timed
3. Average latency is displayed

<!-- TODO: Add screenshot of latency test results -->

## Default Service

Set a default AI service:

1. Go to **Settings** → **AI Services**
2. Click the star icon next to a service
3. This service is used when no specific one is selected

## Usage Limits

### Cloud Providers

Be aware of API rate limits and costs:

- OpenAI: Pay-per-token
- Anthropic: Pay-per-token
- Google: Free tier available

### Local Providers

No limits when running locally:

- Ollama: Unlimited
- LM Studio: Unlimited

## Tips

1. **Start with GPT-3.5**: It's fast and cheap for most tasks
2. **Use local models**: For sensitive code, use Ollama
3. **Customize templates**: Better prompts = better results
4. **Test connections**: Verify API keys work before relying on AI features
5. **Monitor costs**: Cloud API calls add up quickly

## Troubleshooting

### API Key Invalid

- Verify the key is correct
- Check if the key has required permissions
- Ensure billing is active (for cloud providers)

### Slow Responses

- Try a smaller/faster model
- Check your internet connection
- Consider local models for faster responses

### Poor Quality Output

- Review and improve your prompt templates
- Try a more capable model
- Provide more context in templates
