#!/bin/bash

# Copy 5 test videos from goblin1 to MonsterBox, then to goblin2

echo "=== Copying videos from goblin1 to MonsterBox ===" 
mkdir -p /tmp/goblin2-videos

echo "1. Copying Poltergeist video..."
sshpass -p "klrklr89!" scp remote@goblin1.local:/media/usb/video/Poltergeist/PHA_Poltergeist_AmpedUp_Win_H.mp4 /tmp/goblin2-videos/

echo "2. Copying Fire video..."
sshpass -p "klrklr89!" scp remote@goblin1.local:/media/usb/video/fire/541_JB_HD.mov /tmp/goblin2-videos/

echo "3. Copying Ethereal video..."
sshpass -p "klrklr89!" scp remote@goblin1.local:/media/usb/video/ethereal/307_JB_HD.mov /tmp/goblin2-videos/

echo "4. Copying Wraith video..."
sshpass -p "klrklr89!" scp remote@goblin1.local:/media/usb/video/wraith/PHA_Wraith_FaceOfDeath_Win_H.mp4 /tmp/goblin2-videos/

echo "5. Copying Siren video..."
sshpass -p "klrklr89!" scp remote@goblin1.local:/media/usb/video/siren/PHA_Siren_FearsAfloat_Win_H.mp4 /tmp/goblin2-videos/

echo ""
echo "=== Videos on MonsterBox ===" 
ls -lh /tmp/goblin2-videos/

echo ""
echo "=== Copying videos to goblin2 ===" 

echo "1. Copying Poltergeist to goblin2..."
sshpass -p "klrklr89!" scp /tmp/goblin2-videos/PHA_Poltergeist_AmpedUp_Win_H.mp4 remote@192.168.8.155:/home/remote/goblin/media/video/Poltergeist/

echo "2. Copying Fire to goblin2..."
sshpass -p "klrklr89!" scp /tmp/goblin2-videos/541_JB_HD.mov remote@192.168.8.155:/home/remote/goblin/media/video/fire/

echo "3. Copying Ethereal to goblin2..."
sshpass -p "klrklr89!" scp /tmp/goblin2-videos/307_JB_HD.mov remote@192.168.8.155:/home/remote/goblin/media/video/ethereal/

echo "4. Copying Wraith to goblin2..."
sshpass -p "klrklr89!" scp /tmp/goblin2-videos/PHA_Wraith_FaceOfDeath_Win_H.mp4 remote@192.168.8.155:/home/remote/goblin/media/video/wraith/

echo "5. Copying Siren to goblin2..."
sshpass -p "klrklr89!" scp /tmp/goblin2-videos/PHA_Siren_FearsAfloat_Win_H.mp4 remote@192.168.8.155:/home/remote/goblin/media/video/siren/

echo ""
echo "=== Verifying videos on goblin2 ===" 
sshpass -p "klrklr89!" ssh remote@192.168.8.155 "find /home/remote/goblin/media/video -type f \( -name '*.mp4' -o -name '*.mov' \) -exec ls -lh {} \;"

echo ""
echo "=== Done! ===" 

