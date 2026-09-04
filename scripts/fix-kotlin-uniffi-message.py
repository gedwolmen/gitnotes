#!/usr/bin/env python3
"""Fix a UniFFI Kotlin codegen collision in the gitnotes_git2 bindings.

UniFFI (as of 0.32) generates Kotlin that does not compile when a
`uniffi::Error` enum variant has a field named `message`: the generated
variant class declares a constructor property `val message` AND an
`override val message` getter, which collide with each other and with
`kotlin.Throwable.message` (mozilla/uniffi-rs#1434, #2065, #2938).

This script renames the colliding field to `errorMessage` inside the
`BridgeException` sealed class and its `FfiConverterTypeBridgeError`
converter only. Other generated types that legitimately carry a `message`
field (CommitInfo, PullResult, PushResult, PushIntegrateResult) are plain
data classes with no Throwable ancestor and are left untouched.

Invoked automatically by `scripts/build-rust.sh --bindings`. Idempotent:
running it on an already-patched file is a no-op.
"""

import sys

START_MARKER = "sealed class BridgeException"
END_MARKER = "public object FfiConverterTypeCredentialSource"


def fix(src: str) -> str:
    start = src.index(START_MARKER)
    end = src.index(END_MARKER)
    region = src[start:end]
    region = region.replace(
        "val `message`: kotlin.String", "val `errorMessage`: kotlin.String"
    )
    region = region.replace("value.`message`", "value.`errorMessage`")
    region = region.replace("${ `message` }", "${ `errorMessage` }")
    return src[:start] + region + src[end:]


def main() -> None:
    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        src = f.read()
    with open(path, "w", encoding="utf-8") as f:
        f.write(fix(src))
    print(f"[fix-kotlin] patched BridgeException message-field collision in {path}")


if __name__ == "__main__":
    main()
