# 🦞 OpenClaw - Explained Like You're 5!

## What IS OpenClaw? (The Simple Version)

Imagine you have a **super smart AI assistant** (like Claude or ChatGPT) but instead of having to go to a website to talk to it, it comes to **YOU** - on all the apps you already use every day!

**Think of it like this:**

- You message your AI on WhatsApp 📱
- You ask it questions in Telegram 💬
- You chat with it in Discord 🎮
- You text it through iMessage 💙
- It can even talk to you out loud on your phone! 🔊

OpenClaw is the **magic bridge** that connects AI models to all your favorite messaging apps.

---

## The Big Picture (How Everything Fits Together)

```
Your Messaging Apps           The Gateway              AI Brain
    (Where you chat)    →   (The Controller)    →   (Claude/ChatGPT)

WhatsApp
Telegram                      Running on                   Anthropic
Slack                    →    your computer         →     or OpenAI
Discord                       at port 18789
Signal                        (like a traffic cop)
iMessage
```

---

## The Three Main Parts

### 1. **The Gateway** 🚦 (The Traffic Controller)

This is the **heart** of OpenClaw. It runs on your computer as a background service.

**What it does:**

- Listens for messages from all your apps
- Routes them to the AI
- Sends AI responses back to you
- Manages all the connections
- Stores conversation history
- Handles settings and permissions

**Where it lives:** Running at `ws://127.0.0.1:18789` (a web server on your computer)

**Key commands:**

```bash
openclaw gateway --port 18789 --verbose    # Start the gateway
openclaw gateway status                    # Check if it's running
```

---

### 2. **Channels** 📡 (The Messengers)

These are the **bridges** to each messaging platform.

**Built-in channels:**

- 📱 **WhatsApp** - Uses Baileys library to connect
- 💬 **Telegram** - Uses grammY library
- 💼 **Slack** - Uses Bolt SDK
- 🎮 **Discord** - Uses discord.js
- 💙 **iMessage** - Two options: BlueBubbles (recommended) or legacy
- 📧 **Google Chat** - Google Chat API
- 🔒 **Signal** - Uses signal-cli
- 💼 **Microsoft Teams** - Available as extension
- 🔗 **Matrix** - Available as extension
- 🌐 **WebChat** - Browser-based chat interface

**Extensions** (in the `extensions/` folder):

- Additional channels you can add
- Examples: Matrix, Zalo, Microsoft Teams, Voice Call

---

### 3. **Apps & Nodes** 📲 (The Extras)

These are **native apps** that give you extra superpowers:

#### **macOS App** (Menu Bar App)

Lives in your Mac's menu bar and lets you:

- Control the gateway with a GUI
- Use voice wake ("Hey Assistant!")
- See a live Canvas (visual workspace)
- Quick access to WebChat

#### **iOS App**

Runs on your iPhone/iPad:

- Voice wake and talk mode
- Canvas display
- Camera/screen sharing with AI
- Can discover gateway via Bonjour

#### **Android App**

Similar to iOS but for Android phones:

- Canvas display
- Talk mode
- Camera/screen recording
- Optional SMS integration

**These apps are called "nodes"** - they can execute local commands like taking photos, recording screen, running terminal commands, etc.

---

## The Directory Structure (What's Where)

```
openclaw/
├── src/                    # Main TypeScript source code
│   ├── cli/               # Command-line interface
│   ├── commands/          # CLI commands (send, agent, etc.)
│   ├── gateway/           # Gateway core logic
│   ├── channels/          # Channel routing logic
│   ├── telegram/          # Telegram channel
│   ├── discord/           # Discord channel
│   ├── slack/             # Slack channel
│   ├── signal/            # Signal channel
│   ├── imessage/          # iMessage channel
│   ├── infra/             # Infrastructure (database, etc.)
│   ├── agents/            # AI agent logic
│   ├── media/             # Media handling (images, audio)
│   └── config/            # Configuration management
│
├── apps/                   # Native applications
│   ├── ios/               # iOS app (Swift)
│   ├── macos/             # macOS menu bar app (Swift)
│   ├── android/           # Android app (Kotlin)
│   └── shared/            # Shared code between apps
│
├── extensions/            # Plugin extensions
│   ├── msteams/           # Microsoft Teams
│   ├── matrix/            # Matrix protocol
│   ├── bluebubbles/       # BlueBubbles (iMessage)
│   ├── voice-call/        # Voice calling
│   └── ...                # Many more!
│
├── ui/                    # Web UI (Control Panel)
│   └── src/              # Vue/React frontend
│
├── docs/                  # Documentation
│   ├── channels/         # Channel setup guides
│   ├── gateway/          # Gateway configuration
│   ├── platforms/        # Platform-specific guides
│   └── concepts/         # Core concepts
│
└── scripts/              # Build and utility scripts
```

---

## Key Features (The Cool Stuff)

### 🎤 **Voice Wake & Talk Mode**

- Say "Hey Assistant!" and talk to your AI
- Works on Mac, iOS, and Android
- Uses ElevenLabs for realistic voice

### 🎨 **Canvas**

- A visual workspace the AI can control
- Like giving the AI a whiteboard to draw on
- The AI can create interactive UIs

### 🌐 **Browser Control**

- The AI can control a Chrome browser
- Take screenshots, click buttons, fill forms
- Super useful for web automation

### 📸 **Camera & Screen**

- AI can request photos from your phone
- Screen recording
- Location data

### ⏰ **Cron Jobs**

- Schedule tasks ("Remind me every Monday at 9am")
- Automated workflows
- Webhooks for external triggers

### 🔒 **Security (Important!)**

By default, OpenClaw uses **pairing codes** - random people can't just message your AI without permission!

---

## Configuration (How to Set It Up)

### The Main Config File

Located at: `~/.openclaw/config.yaml` (or set via environment variables)

**Key settings:**

```yaml
gateway:
  port: 18789 # Where gateway listens
  bind: loopback # Only local access (safe!)
  mode: local # Run locally (not remote)

channels:
  telegram:
    enabled: true
    token: "your-bot-token" # Get from @BotFather

  discord:
    enabled: true
    token: "your-bot-token" # Get from Discord Dev Portal

  whatsapp:
    enabled: true
    # Scans QR code on first run

models:
  primary: "anthropic" # Or "openai"
  anthropic:
    apiKey: "your-key"
  openai:
    apiKey: "your-key"
```

---

## Common Commands (The Basics)

### Initial Setup

```bash
# Install OpenClaw globally
npm install -g openclaw@latest

# Run the setup wizard (does everything for you!)
openclaw onboard --install-daemon

# Check if everything is working
openclaw doctor
```

### Starting the Gateway

```bash
# Start gateway (stays running in background)
openclaw gateway --port 18789 --verbose

# Check gateway status
openclaw gateway status

# Stop gateway
openclaw gateway stop
```

### Sending Messages

```bash
# Send a message to a phone number
openclaw message send --to +1234567890 --message "Hello!"

# Talk directly to the AI
openclaw agent --message "What's the weather?"

# Send to a specific channel
openclaw message send --channel telegram --to @username --message "Hi!"
```

### Managing Channels

```bash
# See which channels are active
openclaw channels status

# Check for issues
openclaw channels status --probe
```

### Pairing (Security)

```bash
# When someone messages you, they get a pairing code
# To approve them:
openclaw pairing approve telegram abc123

# See who's paired
openclaw pairing list
```

---

## How Messages Flow (Step by Step)

1. **You send a message** on WhatsApp: "What's 2+2?"

2. **WhatsApp channel** in OpenClaw receives it
   - Checks if you're allowed (pairing/allowlist)
   - Extracts the message text

3. **Gateway routes it** to the AI agent
   - Loads your conversation history
   - Adds context about what tools are available

4. **AI (Claude/GPT) thinks** and responds
   - Uses tools if needed (browser, calculator, etc.)
   - Generates response text

5. **Gateway routes response back** to WhatsApp channel

6. **You receive** "4" on WhatsApp!

All of this happens in **seconds**! 🚀

---

## Extensions System (Adding Features)

Extensions live in `extensions/` and add extra functionality:

### Types of Extensions:

1. **Channel Extensions** - New messaging platforms
   - Example: `extensions/matrix/` for Matrix protocol
   - Example: `extensions/zalo/` for Zalo messenger

2. **Integration Extensions** - External services
   - Example: `extensions/copilot-proxy/` for GitHub Copilot
   - Example: `extensions/google-gemini-cli-auth/` for Gemini

3. **Feature Extensions** - New capabilities
   - Example: `extensions/voice-call/` for voice calling
   - Example: `extensions/memory-core/` for persistent memory

**Each extension is a mini-app** with its own `package.json` and code.

---

## The Mobile Apps (Swift/Kotlin)

### iOS App (`apps/ios/`)

- Written in **Swift**
- Uses **SwiftUI** for the interface
- Connects to gateway via **WebSocket** or **Bonjour**
- Can execute local commands (camera, location, etc.)

### macOS App (`apps/macos/`)

- **Menu bar app** (lives in top-right corner)
- Quick access to all features
- Can run gateway in the app itself
- Voice wake integration

### Android App (`apps/android/`)

- Written in **Kotlin**
- Similar features to iOS
- Native Android permissions
- Optional SMS channel

**They communicate using the Gateway Protocol** - a WebSocket-based API defined in `dist/protocol.schema.json`

---

## Development vs Production

### Development (You're modifying code):

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install           # Install dependencies
pnpm build             # Build TypeScript → JavaScript
pnpm openclaw gateway  # Run from source
```

### Production (Just using it):

```bash
npm install -g openclaw@latest  # Install as global command
openclaw gateway --daemon       # Run as background service
```

---

## The AI Models (Who's Actually Thinking)

OpenClaw doesn't include AI - it **connects** to AI services:

### Supported Providers:

- **Anthropic** (Claude) - Recommended, best for coding
- **OpenAI** (ChatGPT/GPT-4)
- **Local models** via Ollama
- **Azure OpenAI**
- **AWS Bedrock**
- Many more via extensions!

You provide your own API keys - OpenClaw is just the messenger.

---

## Common Use Cases

### 1. **Personal Assistant**

"Hey AI, remind me to call Mom tomorrow at 3pm"

- Sets up a cron job
- Sends you a message at the right time

### 2. **Code Helper**

"Debug this Python code: [paste code]"

- AI analyzes and suggests fixes
- Can even run tests if you give it access

### 3. **Research Assistant**

"Search for information about quantum computing"

- AI can browse web (if browser tool enabled)
- Summarizes findings

### 4. **Automation**

"Every morning at 8am, send me a weather report"

- Cron job triggers
- AI fetches weather
- Messages you automatically

### 5. **Group Chat Moderator**

- Add bot to Discord server
- Answers questions automatically
- Can be mentioned with @bot

---

## Security & Privacy

### 🔒 **Default Security:**

- Gateway runs **locally only** (loopback)
- **Pairing codes** for new contacts
- **Allowlists** for who can message
- No data sent to OpenClaw servers (only to AI provider you choose)

### 🌐 **Remote Access (Optional):**

If you want to access from anywhere:

- Use **Tailscale Serve** (private network)
- Use **Tailscale Funnel** (public, requires password)
- Use **SSH tunnels**

### ⚠️ **Things to Know:**

- Your messages ARE sent to AI provider (Anthropic/OpenAI)
- Conversation history stored locally in `~/.openclaw/workspace/`
- API keys stored in config file - keep it safe!

---

## Troubleshooting (When Things Break)

### Run the Doctor:

```bash
openclaw doctor
```

This checks for common issues!

### Common Problems:

**Gateway won't start:**

```bash
# Check if port is already in use
lsof -i :18789

# Try a different port
openclaw gateway --port 18790
```

**Channel not connecting:**

```bash
# Check channel status
openclaw channels status --probe

# View logs
openclaw gateway --verbose
```

**AI not responding:**

- Check API key in config
- Verify API credits/quota
- Check internet connection

---

## Where Everything Lives

### On Your Computer:

```
~/.openclaw/                    # Main config directory
├── config.yaml                # Main configuration
├── workspace/                 # Sessions & history
│   ├── session-main.db       # Main conversation
│   └── session-*.db          # Other sessions
├── browser-profiles/         # Browser data
├── cache/                    # Temporary files
└── logs/                     # Log files

~/.openclaw-gateway/          # Gateway state
└── state.json               # Runtime state
```

### In the Repository:

```
dist/                        # Compiled JavaScript (after build)
node_modules/               # Dependencies
apps/                       # Native apps
extensions/                 # Plugins
docs/                       # Documentation
```

---

## The Key Commands Reference

```bash
# Setup & Installation
openclaw onboard             # Wizard setup
openclaw onboard --install-daemon  # Install as service
openclaw doctor              # Diagnose problems

# Gateway Control
openclaw gateway             # Start gateway
openclaw gateway stop        # Stop gateway
openclaw gateway status      # Check status
openclaw gateway --reset     # Reset everything

# Channels
openclaw channels list       # Show all channels
openclaw channels status     # Channel health check
openclaw channels auth telegram  # Authenticate channel

# Messaging
openclaw agent --message "Hi"    # Talk to AI directly
openclaw message send --to +1... --message "Hi"  # Send message
openclaw message send --channel telegram --to @user --message "Hi"

# Pairing & Security
openclaw pairing list        # Who's approved
openclaw pairing approve <channel> <code>  # Approve someone
openclaw pairing revoke <channel> <id>     # Remove someone

# Config Management
openclaw config get          # Show all config
openclaw config set gateway.port 18790  # Change setting
openclaw config edit         # Open in editor

# Updates
openclaw update              # Update to latest
openclaw update --channel beta  # Switch to beta channel
```

---

## Next Steps (Getting Started)

### Absolute Beginner Path:

1. **Install:**

   ```bash
   npm install -g openclaw@latest
   ```

2. **Run Setup Wizard:**

   ```bash
   openclaw onboard --install-daemon
   ```

   - Follow the prompts
   - Add your API keys
   - Choose which channels to enable

3. **Start Gateway:**

   ```bash
   openclaw gateway --verbose
   ```

4. **Connect a Channel:**
   - For Telegram: Create bot with @BotFather
   - For WhatsApp: Scan QR code
   - For Discord: Create bot in Developer Portal

5. **Test It:**

   ```bash
   openclaw agent --message "Hello world!"
   ```

6. **Message from your app** and see the magic! ✨

---

## Resources & Help

- **Documentation:** [https://docs.openclaw.ai](https://docs.openclaw.ai)
- **GitHub:** [https://github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)
- **Discord:** [https://discord.gg/clawd](https://discord.gg/clawd)
- **Getting Started:** [https://docs.openclaw.ai/start/getting-started](https://docs.openclaw.ai/start/getting-started)

---

## TL;DR (Too Long; Didn't Read)

**OpenClaw = AI Assistant + Messaging Apps**

1. Install: `npm install -g openclaw@latest`
2. Setup: `openclaw onboard --install-daemon`
3. Start: `openclaw gateway`
4. Connect your favorite messaging app
5. Message your AI from anywhere! 🎉

**It's like having ChatGPT/Claude in your pocket, on every messaging app you already use!**

---

## Have Questions?

This guide covers the essentials, but there's so much more! Check out:

- [Full Documentation](https://docs.openclaw.ai) for deep dives
- [Discord Community](https://discord.gg/clawd) for help
- [GitHub Issues](https://github.com/openclaw/openclaw/issues) to report bugs
- Individual channel guides in `docs/channels/` for setup instructions

Happy chatting! 🦞✨
