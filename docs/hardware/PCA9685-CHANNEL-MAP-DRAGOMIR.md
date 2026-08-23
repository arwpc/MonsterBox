# Sir Dragomir — PCA9685 channel map (FINAL)

**Operator ruling, 2026-08-22, verbatim intent: "for once and always."**
This map is law. Do not reassign these pins, do not assert any other map in
any script, and do not trust any older document that disagrees (several do —
they are superseded by this file).

PCA9685 I2C `0x40`, 50 Hz:

| Part id | Part | Channel | Kind |
|---------|------|---------|------|
| 2 | Jaw Servo (Miuzei MG90S) | **3** | standard servo, 0–180 |
| 1 | Head Servo (goBILDA Stingray-2) | **7** | **multi-turn**, 900° real travel — never continuous |
| 3 | Magic Box Servo (Miuzei 25kg) | **11** | standard servo, 0–180 |

Asserted idempotently by `scripts/bench/knight-finish.sh`; enforced-by-record
here. The history that made this file necessary, so nobody repeats it:

- The channel map changed three times on 2026-08-22 (head=4 in old docs,
  head=11 in the evening handoff, jaw=7 in the same handoff). Each stale
  assertion re-created a channel collision at the bench: two parts' configs on
  one channel means commands for one part physically drive the other, and any
  guard keyed to one part's channel silences its channel-mate.
- Config channels travel by the overrides API
  (`POST /setup/calibration/api/parts/<id>/overrides {"overrides":{"channel":N}}`),
  never by committing node-local `parts.json`.
- The channel a config NAMES and the pin a lead SITS ON are two records of one
  physical fact. Only eyes at the rig can confirm the pin; nothing in software
  can. When they disagree, motion "succeeds" while the wrong part (or no part)
  moves.
