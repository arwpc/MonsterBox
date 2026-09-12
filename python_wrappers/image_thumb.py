#!/usr/bin/env python3
"""
Thumbnail a character portrait for the page chrome.

    image_thumb.py <source> <destination_base> <max_edge_px>

The output is <destination_base>.png when the source carries alpha, otherwise
<destination_base>.jpg; the final path is printed on stdout so the caller can
serve it with the right Content-Type.

Why this exists: the layout draws the active character's portrait as a 28–48px
avatar on EVERY page, and the portraits are whatever the operator uploaded —
Orlok's is an 800x800 PNG, 316 KB on the wire and a 2.5 MB bitmap to decode.
Node has no image library and the project adds no npm dependencies, so the
resize is done here with Pillow, which every node already carries for the
camera scripts. The caller (services/characterImageService.js) treats any
non-zero exit as "no thumbnail" and serves the original, so failure here only
costs bandwidth, never a broken avatar.

Writes atomically (temp file + rename) so a half-written thumbnail is never
served. Keeps alpha when the source has it (PNG out), otherwise JPEG.
"""
import os
import sys


def main(argv):
    if len(argv) != 4:
        sys.stderr.write('usage: image_thumb.py <source> <destination_base> <max_edge_px>\n')
        return 2
    src, dst, edge = argv[1], argv[2], int(argv[3])
    if edge < 16 or edge > 1024:
        sys.stderr.write('max_edge_px out of range\n')
        return 2
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:
        sys.stderr.write('Pillow unavailable: %s\n' % exc)
        return 3

    with Image.open(src) as im:
        # Honour camera orientation so phone uploads do not come out sideways.
        im = ImageOps.exif_transpose(im)
        has_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
        im = im.convert('RGBA' if has_alpha else 'RGB')
        im.thumbnail((edge, edge), Image.LANCZOS)
        final = dst + ('.png' if has_alpha else '.jpg')
        tmp = final + '.tmp'
        if has_alpha:
            im.save(tmp, format='PNG', optimize=True)
        else:
            im.save(tmp, format='JPEG', quality=82, optimize=True, progressive=False)
        os.replace(tmp, final)
        # A stale sibling in the other format must not shadow this one.
        other = dst + ('.jpg' if has_alpha else '.png')
        try:
            os.remove(other)
        except OSError:
            pass
    sys.stdout.write(final + '\n')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv))
    except Exception as exc:  # any decode/write failure: report and let the caller fall back
        sys.stderr.write('thumbnail failed: %s\n' % exc)
        sys.exit(1)
