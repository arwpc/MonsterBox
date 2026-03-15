#!/usr/bin/env python3
"""Read a GPIO pin directly from /dev/gpiomem register. No GPIO claim, no contention."""
import mmap, struct, os, sys
if len(sys.argv) < 2:
    print("-1")
    sys.exit(1)
pin = int(sys.argv[1])
fd = os.open('/dev/gpiomem', os.O_RDONLY | os.O_SYNC)
m = mmap.mmap(fd, 4096, mmap.MAP_SHARED, mmap.PROT_READ)
m.seek(0x34)
val = (struct.unpack('<I', m.read(4))[0] >> pin) & 1
m.close()
os.close(fd)
print(val)
