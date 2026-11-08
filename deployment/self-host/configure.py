#!/usr/bin/env python3
"""Configure provider secrets over an interactive SSH terminal, without echoing them."""
import getpass
import json
import os
from pathlib import Path
import re
import subprocess

path = Path(os.environ.get("MEDATLAS_CONFIG", Path.home() / ".config/medatlas/config.json"))
config = json.loads(path.read_text())
settings = config.setdefault("env", {})
for key in ["DEEPSEEK_API_KEY", "LEXMOUNT_API_KEY", "LEXMOUNT_PROJECT_ID"]:
    value = getpass.getpass(key + "（输入不回显；留空保留现值）: ").strip()
    if value:
        if key == "LEXMOUNT_PROJECT_ID" and not re.fullmatch(r"[0-9a-fA-F-]{36}", value):
            raise SystemExit("项目 ID 格式不正确，配置未保存")
        settings[key] = value
if not all(settings.get(key) for key in ["DEEPSEEK_API_KEY", "LEXMOUNT_API_KEY", "LEXMOUNT_PROJECT_ID"]):
    raise SystemExit("三项配置不完整，配置未保存")
temporary = path.with_suffix(".tmp")
fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as stream:
    json.dump(config, stream, ensure_ascii=False, indent=2)
temporary.replace(path)
print("配置已保存（未显示密钥）。")
subprocess.run(["sudo", "systemctl", "restart", "medatlas.service"], check=True)
print("MedAtlas 服务已重启。")
