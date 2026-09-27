"""Extract the compact result emitted by the browser CLI into an evidence file."""
import json
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
if "### Result\n" not in text:
    print(text[-4000:])
    raise SystemExit(1)
result = json.loads(text.split("### Result\n", 1)[1].split("\n###", 1)[0])
path.with_suffix('.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
