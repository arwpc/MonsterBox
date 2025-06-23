# Page snapshot

```yaml
- banner:
  - heading "Add New Sound" [level=1]
- main:
  - text: "Characters:"
  - listbox "Characters:":
    - option "Orlok"
    - option "Coffin Breaker"
    - option "PumpkinHead"
    - option "Skulltalker"
    - option "Test Character 1750704145907"
    - option "Test Character 1750705258098"
  - text: "Sound Name:"
  - textbox "Sound Name:"
  - text: "Sound File:"
  - button "Sound File:"
  - button "Save Sound"
  - link "Configure Voice":
    - /url: /api/voice/configure?characterId=1
  - link "Back to Sounds":
    - /url: /sounds
```