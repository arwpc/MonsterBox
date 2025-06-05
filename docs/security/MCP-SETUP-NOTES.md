# 🔧 MCP Configuration Setup Notes

## Important Security Notice

The `.cursor/mcp.json` file in this repository contains placeholder values for API keys. **Do NOT commit actual API keys to this file.**

## Setting Up MCP with Your API Keys

### Option 1: Local Environment Variables (Recommended)

1. **Ensure your `.env` file contains your actual API keys:**
   ```bash
   ANTHROPIC_API_KEY="your_actual_anthropic_key_here"
   OPENAI_API_KEY="your_actual_openai_key_here"
   GOOGLE_API_KEY="your_actual_google_key_here"
   # ... other keys as needed
   ```

2. **The MCP server will automatically load these from your environment**

### Option 2: Local MCP Configuration (Advanced)

If you need to customize the MCP configuration locally:

1. **Create a local copy of the MCP config:**
   ```bash
   cp .cursor/mcp.json .cursor/mcp.local.json
   ```

2. **Add `.cursor/mcp.local.json` to your `.gitignore`:**
   ```bash
   echo ".cursor/mcp.local.json" >> .gitignore
   ```

3. **Update your local copy with actual API keys:**
   ```json
   {
       "mcpServers": {
           "task-master-ai": {
               "command": "npx",
               "args": ["-y", "--package=task-master-ai", "task-master-ai"],
               "env": {
                   "ANTHROPIC_API_KEY": "your_actual_anthropic_key_here",
                   "OPENAI_API_KEY": "your_actual_openai_key_here",
                   "GOOGLE_API_KEY": "your_actual_google_key_here"
               }
           }
       }
   }
   ```

4. **Configure your IDE to use the local config file**

## Current MCP Servers

### 1. Task Master AI
- **Purpose**: AI-powered task management and automation
- **Required Keys**: ANTHROPIC_API_KEY (minimum)
- **Optional Keys**: OPENAI_API_KEY, GOOGLE_API_KEY, PERPLEXITY_API_KEY

### 2. MonsterBox Log Collector
- **Purpose**: Collects logs from various sources for MCP integration
- **Required Keys**: None (uses environment variables from .env)
- **Features**: 
  - Browser console logs
  - GitHub API logs  
  - RPI console logs (via SSH)
  - Ubuntu system logs
  - MonsterBox application logs

## Security Best Practices

1. **Never commit actual API keys to version control**
2. **Use environment variables for sensitive data**
3. **Keep `.env` files in `.gitignore`**
4. **Use placeholder values in committed configuration files**
5. **Regularly rotate API keys**
6. **Monitor for accidental key exposure**

## Testing MCP Setup

After configuring your API keys, test the MCP setup:

```bash
# Test the complete MCP setup including log collection
npm run test:mcp

# Test animatronic SSH connectivity
npm run test:animatronic-ssh
```

## Troubleshooting

### "API key not found" errors
- Verify your `.env` file contains the required keys
- Ensure the `.env` file is in the project root
- Check that key names match exactly (case-sensitive)

### MCP server connection issues
- Verify the MCP server is properly configured in your IDE
- Check that the server command and arguments are correct
- Review server logs for detailed error messages

### SSH connectivity issues
- Ensure animatronic RPIs are powered on and connected
- Verify SSH credentials are properly configured
- Test network connectivity to each RPI

## Related Documentation

- [Animatronic SSH Setup Guide](../setup/ANIMATRONIC-SSH-SETUP.md)
- [Environment Variables Guide](../../.env.example)
- [MCP Server Documentation](../../mcp-servers/README.md)
- [Main Documentation Index](../README.md)
