import json
import os
import re
from pathlib import Path

CHARACTER_JSON = Path('data/characters.json')
PARTS_JSON = Path('data/parts.json')
SOUNDS_JSON = Path('data/sounds.json')
GPIO_MD = Path('docs/hardware/gpio_assignments.md')
IMG_DIR = Path('docs/img')
OUTPUT_DIR = Path('docs')

CYBERPUNK_STYLE = '''<style>
.cyberpunk-sheet {
  background: #0d0d0d;
  color: #00ff99;
  font-family: 'Fira Mono', 'Consolas', 'Monaco', monospace;
  border: 2px solid #00ff99;
  border-radius: 10px;
  padding: 2em;
  max-width: 800px;
  margin: 2em auto;
  box-shadow: 0 0 20px #00ff9944, 0 0 5px #00ff9922;
}
.cyberpunk-sheet h1, .cyberpunk-sheet h2 {
  color: #00ff99;
  letter-spacing: 0.1em;
  border-bottom: 1px solid #00ff9944;
  padding-bottom: 0.2em;
}
.cyberpunk-sheet img {
  border: 2px solid #00ff99;
  border-radius: 8px;
  max-width: 200px;
  margin-bottom: 1em;
  box-shadow: 0 0 10px #00ff9977;
}
.cyberpunk-sheet .section {
  margin-bottom: 1.5em;
}
.cyberpunk-sheet .label {
  color: #00ffcc;
  font-weight: bold;
  margin-right: 0.5em;
}
.cyberpunk-sheet .hardware-list, .cyberpunk-sheet .sound-list {
  background: #111;
  border: 1px solid #00ff99;
  border-radius: 6px;
  padding: 0.5em 1em;
  margin: 0.5em 0;
}
.cyberpunk-sheet .note {
  background: #1a1a1a;
  border-left: 4px solid #00ff99;
  padding: 0.5em 1em;
  color: #baffd9;
  margin: 0.5em 0;
  font-size: 1em;
}
</style>'''

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def parse_gpio_md(md_path):
    """Parse the GPIO assignments markdown for each character."""
    gpio = {}
    current = None
    with open(md_path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('### '):
                current = line.strip().replace('### ', '')
                gpio[current] = []
            elif line.strip().startswith('-') and current:
                gpio[current].append(line.strip()[2:])
    return gpio

def get_character_image(image_hash):
    # Try to find the image file in public/images/characters by hash
    char_img_dir = Path('public/images/characters')
    for ext in ['png', 'jpg', 'jpeg', 'gif']:
        img_path = char_img_dir / f"{image_hash}.{ext}"
        if img_path.exists():
            # Output the relative path from docs/ for embedding in Markdown
            return f"../public/images/characters/{image_hash}.{ext}"
    # fallback
    return None

def main():
    characters = load_json(CHARACTER_JSON)
    parts = load_json(PARTS_JSON)
    sounds = load_json(SOUNDS_JSON)
    gpio = parse_gpio_md(GPIO_MD)

    # Build lookup for parts and sounds
    parts_by_char = {}
    for part in parts:
        cid = part.get('characterId')
        if cid:
            parts_by_char.setdefault(cid, []).append(part)
    sounds_by_char = {}
    for sound in sounds:
        for cid in sound.get('characterIds', []):
            sounds_by_char.setdefault(cid, []).append(sound)

    for char in characters:
        name = char['char_name']
        desc = char['char_description']
        image = get_character_image(char.get('image', ''))
        char_id = char['id']
        md_file = OUTPUT_DIR / f"character_{name.lower().replace(' ', '_')}.md"

        # Hardware overview (from parts.json and gpio_assignments.md)
        hardware_lines = []
        # From parts.json
        for part in parts_by_char.get(char_id, []):
            line = f"{part['name']} ({part['type']})"
            if 'gpioPin' in part:
                line += f", GPIO: {part['gpioPin']}"
            if 'directionPin' in part and 'pwmPin' in part:
                line += f", DIR: {part['directionPin']}, PWM: {part['pwmPin']}"
            if 'pin' in part:
                line += f", Pin: {part['pin']}"
            hardware_lines.append(line)
        # From gpio_assignments.md
        if name in gpio:
            hardware_lines.extend(gpio[name])

        # Sound list
        sound_lines = []
        for sound in sounds_by_char.get(char_id, []):
            sound_lines.append(f"{sound['name']} ({sound['filename']})")

        # Markdown content
        md = [f"# {name} — Cyberpunk Character Sheet", CYBERPUNK_STYLE, f'<div class="cyberpunk-sheet">']
        md.append(f'<h1>{name}</h1>')
        if image:
            md.append(f'<div class="section">\n  <img src="{image}" alt="{name} Picture">\n</div>')
        md.append(f'<div class="section">\n  <span class="label">Description:</span>\n  <span>{desc}</span>\n</div>')
        md.append('<div class="section">\n  <span class="label">Hardware Overview:</span>\n  <div class="hardware-list">')
        if hardware_lines:
            md.extend([f"    <div>{line}</div>" for line in hardware_lines])
        else:
            md.append("    <div>–</div>")
        md.append("  </div>\n</div>")
        md.append('<div class="section">\n  <span class="label">Sound List:</span>\n  <div class="sound-list">')
        if sound_lines:
            md.extend([f"    <div>{line}</div>" for line in sound_lines])
        else:
            md.append("    <div>–</div>")
        md.append("  </div>\n</div>")
        md.append('<div class="section">\n  <span class="label">Notes/Improvements:</span>\n  <div class="note">–</div>\n</div>')
        md.append('</div>')

        with open(md_file, 'w', encoding='utf-8') as f:
            f.write('\n'.join(md))
        print(f"Wrote {md_file}")

if __name__ == '__main__':
    main()
