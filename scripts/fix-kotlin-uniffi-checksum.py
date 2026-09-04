#!/usr/bin/env python3
"""Patch UniFFI Kotlin checksum comparisons to mask u16 sign-extension on Android ART.

See: mozilla/uniffi-rs#2939 - u16 return values >= 0x8000 are sign-extended
by Android's ART when crossing JNA, causing checksum mismatches.

Fix: wrap checksum call in ((x & 0xFFFF) != EXPECTED) which:
  1. Masks the sign-extension: (u16_value & 0xFFFF)
  2. Compares to expected: (... != EXPECTED)  -- this is the Boolean condition
"""
import re
import sys

path = sys.argv[1]

with open(path) as f:
    content = f.read()

# Already patched?
if '0xFFFF) !=' in content:
    count = content.count('0xFFFF) !=')
    print(f"Already patched {count} checksum comparisons — skipping")
    sys.exit(0)

# Pattern: if (lib.<checksum_func>() != <value>) {
checksum_pattern = re.compile(
    r'if \(lib\.(\w+)\(\) != (\d+)\) \{',
    re.MULTILINE
)

def mask_match(m):
    func = m.group(1)
    val = m.group(2)
    return f'if ((lib.{func}() & 0xFFFF) != {val}) {{'

patched = checksum_pattern.sub(mask_match, content)

count = len(checksum_pattern.findall(content))
if count > 0:
    with open(path, 'w') as f:
        f.write(patched)
    print(f"Patched {count} checksum comparisons in {path}")
else:
    print(f"No checksum comparisons found in {path}")
