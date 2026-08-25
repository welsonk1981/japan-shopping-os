
from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "database"
IMAGES = DB / "images"
ORIGINALS = IMAGES / "originals"
THUMBS = IMAGES / "thumbs"
ASSETS_PATH = DB / "photo_assets.json"

ORIGINALS.mkdir(parents=True, exist_ok=True)
THUMBS.mkdir(parents=True, exist_ok=True)

data = json.loads(ASSETS_PATH.read_text(encoding="utf-8"))
changed = 0

for asset in data.get("assets", []):
    filename = asset.get("檔名")
    if not filename:
        continue

    src = ORIGINALS / filename
    legacy = IMAGES / filename
    if not src.exists() and legacy.exists():
        legacy.replace(src)

    if not src.exists():
        continue

    thumb_name = Path(filename).with_suffix(".webp").name
    thumb = THUMBS / thumb_name

    rebuild = (not thumb.exists()) or (thumb.stat().st_mtime < src.stat().st_mtime)
    if rebuild:
        with Image.open(src) as im:
            im = im.convert("RGB")
            im.thumbnail((640, 640), Image.Resampling.LANCZOS)
            im.save(thumb, "WEBP", quality=76, method=6)
        changed += 1

    with Image.open(thumb) as im:
        width, height = im.size

    asset["original_path"] = f"images/originals/{filename}"
    asset["thumbnail_path"] = f"images/thumbs/{thumb_name}"
    asset["thumbnail_width"] = width
    asset["thumbnail_height"] = height
    asset["thumbnail_bytes"] = thumb.stat().st_size
    asset["original_bytes"] = src.stat().st_size
    asset["路徑"] = asset["thumbnail_path"]

data["schema_version"] = "7.1.0"
data["performance_profile"] = {
    "thumbnail_max_dimension": 640,
    "thumbnail_format": "webp",
    "thumbnail_quality": 76,
    "originals_preserved": True,
    "list_pages_use": "thumbnail_path"
}
ASSETS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"圖片最佳化完成：重建 {changed} 張縮圖")
