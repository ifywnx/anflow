#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"
if [ ! -x .venv/bin/python ]; then
  if command -v uv >/dev/null 2>&1; then
    uv venv .venv --python 3.13
    uv pip install --python .venv/bin/python -r requirements.txt
  else
    python3 -m venv .venv
    .venv/bin/python -m pip install -r requirements.txt
  fi
fi
printf '\nVietFlow: mở http://127.0.0.1:4174/video.html trong Chrome/Edge.\nGiữ cửa sổ này mở; Ctrl+C để dừng.\nNhập ElevenLabs key trong Cài đặt của app nếu cần.\n\n'
exec .venv/bin/python server.py
