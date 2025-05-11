# Installation Guide

MonsterBox supports easy setup on a Raspberry Pi 4B. Follow these steps for a fresh install or major redeployment.

## 1. Prepare Your Raspberry Pi 4B
- Install the latest Raspberry Pi OS (Lite or Desktop) on your microSD card using the [Raspberry Pi Imager](https://www.raspberrypi.com/software/).
- Boot the Pi, connect to your network, and perform initial setup (locale, WiFi, etc.).
- Ensure your Pi is connected to the Internet.

## 2. Set Up GitHub Access
- Install Git:
  ```bash
  sudo apt-get update
  sudo apt-get install -y git
  ```
- (Optional but recommended) [Generate SSH keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) and add them to your GitHub account for secure access:
  ```bash
  ssh-keygen -t ed25519 -C "your_email@example.com"
  cat ~/.ssh/id_ed25519.pub
  # Copy this key to your GitHub SSH keys
  ```

## 3. Download MonsterBox Files
- Clone the repository:
  ```bash
  git clone https://github.com/yourusername/monsterbox.git
  cd monsterbox
  ```

## 4. Run the Installation Script
- The install script will upgrade your OS, install all system and Python/Node dependencies, configure hardware interfaces, and set permissions:
  ```bash
  sudo bash install.sh
  ```
  > **Note:** This may take several minutes. The script will prompt if any errors occur.

## 5. Set Up Environment Variables
- Create a `.env` file in the project root. See `.env.example` for required variables (e.g., PORT, NODE_ENV, hardware settings).

## 6. Start the Application
- Launch MonsterBox:
  ```bash
  npm start
  ```
- Access the web interface at `http://<your-pi-ip>:3000` from your browser.

---

# Update Guide

Routine updates keep your MonsterBox system and dependencies current without a full OS upgrade.

## 1. Update MonsterBox Files
- Pull the latest changes from GitHub:
  ```bash
  git pull origin main
  ```

## 2. Run the Update Script
- This updates project dependencies and ensures required services are running:
  ```bash
  sudo bash update.sh
  ```
  > **Note:** No OS upgrade is performed. For major upgrades or after long periods, re-run the full install script.

---

For troubleshooting, see the FAQ or contact the project maintainer.