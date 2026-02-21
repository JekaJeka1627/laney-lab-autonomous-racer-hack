# Getting Started — Autonomous Deep Racer Project

Welcome to the team! This guide will get you from zero to contributing in about 10 minutes.

---

## 1. Access the live app (no install needed)

The project management app is already running online. You can start contributing right away:

**https://project-map.up.railway.app**

If you haven't joined yet, use the invite link shared in Discord or by your team lead. When you join, you'll be asked to fill in your name, email, and skills — this helps us match you to the right tasks.

---

## 2. Join a team

After joining the project, head to the **Team** page:

https://project-map.up.railway.app/v9/projects/6753703e-3fa7-4253-b042-bea221942db8/team

You'll see the formed teams listed with their focus areas. If you're not on a team yet, talk to the PM or your classmates to get placed. Current teams:

- **Team 1 — Data Pipeline** (data capture, APIs, infrastructure)
- **Team 2 — Environment** (tracks, 3D, simulator world)
- **Team 3 — Ops / Infra** (ops, logistics, testing)
- **Team 4 — Simulator UX** (UI, controls, user experience)
- **Team 5 — ML / Training** (models, datasets, training pipeline)

---

## 3. Pick a task on the Kanban board

Open the **Kanban board** to see all available work:

https://project-map.up.railway.app/v9/projects/6753703e-3fa7-4253-b042-bea221942db8/kanban

Here's how the lanes work:

| Lane | Meaning |
|------|---------|
| **Ready** | Tasks available to pick up |
| **In Progress** | Someone is actively working on it |
| **Review** | Work is done, needs a check |
| **Done** | Completed |

**To claim a task:**
1. Click on a task card
2. Click the **Assign** button
3. Choose **"Assign to me"** or **"Assign to [your team]"**
4. Drag the card into the **In Progress** lane

**To see details:** Click on any card to expand it. Most tasks include an **Execution Guide** with step-by-step instructions so you know exactly what to do.

---

## 4. Set up for local development (optional)

If your task involves writing code, you'll need to run the project locally. Here's how:

### Install Node.js and npm

Go to **https://nodejs.org** and download the **LTS** version (the one labeled "Recommended for Most Users"). This installs both Node.js and npm.

After installing, open a terminal and verify:

```
node --version
npm --version
```

You should see version numbers. If you get "command not found," restart your terminal or computer.

**Windows:** Use PowerShell or the Command Prompt. You can also use Git Bash.
**Mac:** Use the built-in Terminal app.
**Linux:** Use your distro's terminal. You can also install Node via your package manager:
```
# Ubuntu/Debian
sudo apt install nodejs npm

# Or use nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
```

### Install Git

If you don't have Git installed:

- **Windows:** Download from https://git-scm.com/download/win
- **Mac:** Run `xcode-select --install` in Terminal
- **Linux:** `sudo apt install git` (Ubuntu/Debian) or `sudo dnf install git` (Fedora)

### Clone the repo

```
git clone https://github.com/JekaJeka1627/laney-lab-autonomous-racer-hack.git
cd laney-lab-autonomous-racer-hack/simulator
```

### Install dependencies and run

```
npm install
npm run dev
```

Then open **http://localhost:3000** in your browser. You should see the simulator with a track selection screen.

### Controls

- **WASD** or **Arrow Keys** — steer and accelerate
- **ESC** — pause
- Drive laps to generate training data for the AI model

---

## 5. What can I work on if I don't code?

Not every task requires programming. Here are ways to contribute:

- **Drive laps in the simulator** — every manual driving session generates training data that teaches the AI how to drive. More data = better model.
- **Test and report bugs** — try the app, note what's confusing or broken.
- **UX feedback** — suggest improvements to the interface.
- **Documentation** — help improve guides, write instructions, organize information.
- **Data analysis** — review driving session data, identify patterns.
- **Project management** — help track progress, coordinate with teammates.

---

## 6. Need help?

- **Discord** — ask questions in the project channel, someone will respond
- **Kanban board** — check the execution guide on your task card for step-by-step help
- **Team lead** — reach out to your team lead for task-specific guidance

---

## Quick reference

| What | Link |
|------|------|
| Live app | https://project-map.up.railway.app |
| Kanban board | https://project-map.up.railway.app/v9/projects/6753703e-3fa7-4253-b042-bea221942db8/kanban |
| Team page | https://project-map.up.railway.app/v9/projects/6753703e-3fa7-4253-b042-bea221942db8/team |
| Simulator repo | https://github.com/JekaJeka1627/laney-lab-autonomous-racer-hack |
| Node.js download | https://nodejs.org |
