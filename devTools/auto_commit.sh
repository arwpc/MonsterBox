#!/bin/bash
cd /home/remote/monsterbox/MonsterBox
git add .
git commit -m "Auto-commit: $(date)"
git push origin master
