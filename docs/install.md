## Installation

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/monsterbox.git
cd monsterbox
```

### 2. First-Time Setup (Full System)
Use this for a fresh Raspberry Pi or major re-deployment. This will upgrade the OS, install all dependencies, configure hardware, and set permissions:
```bash
sudo bash install.sh
```

### 3. Set up environment variables
Create a `.env` file in the project root. See `.env.example` for variables.

### 4. Routine Updates (Dependencies/Services)
For regular updates (after initial setup), use:
```bash
sudo bash update.sh
```
This script updates only project dependencies and ensures required services are running (no full OS upgrade).

### 5. Run the application
```bash
npm start
```