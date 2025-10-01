## Usage Instructions

### Steps
- **Steps** are the fundamental actions in MonsterBox. Each Step represents a single operation, such as moving a part, playing a sound, or turning on a light.
- Steps can be set to run **serially** (one after another) or **concurrently** (at the same time as the next step). For example, you can play a sound while a servo moves by marking both steps as concurrent.

### Scenes
- **Scenes** are ordered sequences of Steps. Scenes let you create complex behaviors by arranging Steps in the desired order.
- Scenes can include Steps that wait for sensor input before proceeding, allowing for interactive or reactive behaviors.
- Steps within a Scene can be run in sequence or concurrently, enabling synchronized actions.

### Active Mode
- **Active Mode** allows you to select one or more Scenes to run automatically.
- In Active Mode, MonsterBox cycles through the selected Scenes with a configurable delay between each Scene. This enables unattended operation or looping performances.
- Scenes in Active Mode can include sensor waits, so your animatronic can react to the environment before moving to the next Scene.

- Access the MonsterBox web interface at `http://localhost:3000` (or your configured port).
- Select a character and navigate through Characters, Parts, Sounds, Scenes, etc.
- Trigger scenes, view logs, and control devices in real time.

## Installation & Updates

- For full installation instructions—including first-time setup, GitHub connection, and running the install script—see [install.md](./install.md).
- For regular updates (dependencies/services), use the update script:
  ```bash
  sudo bash update.sh
  ```
- For a major re-deployment or after long periods, use the install script:
  ```bash
  sudo bash install.sh
  ```

Refer to [install.md](./install.md) for detailed steps and troubleshooting.