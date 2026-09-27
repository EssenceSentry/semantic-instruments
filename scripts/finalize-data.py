"""Attach thumbnail URLs, reference ranks, and content hashes.

Run after export_weapons.py and prepare_overview.py. Paired record IDs are
YouTube video IDs, so every record can link to its thumbnail on demand.
The reviewed inventory preserves example names. No images are downloaded,
copied or embedded.
"""
from pathlib import Path
import gzip
import hashlib
import json
import re
from array import array
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
selected = json.loads((ROOT / "scripts/media-selection.json").read_text())
for name in ["collection", "paired"]:
    folder = ROOT / "public/data" / name
    path = folder / "manifest.json"
    manifest = json.loads(path.read_text())
    previews = {row["id"]: row for row in selected[name]}
    for item in manifest["items"]:
        item.pop("media", None)
        item.pop("mediaFallback", None)
        if name == "paired":
            if not re.fullmatch(r"[A-Za-z0-9_-]{11}", item["id"]):
                raise ValueError(f"Expected a YouTube video ID: {item['id']}")
            item["media"] = f"https://i.ytimg.com/vi/{item['id']}/hqdefault.jpg"
        if item["id"] in previews:
            preview = previews[item["id"]]
            url = urlparse(preview["media"])
            if url.scheme != "https" or url.hostname != "i.ytimg.com":
                raise ValueError(f"Expected a verified YouTube thumbnail URL for {item['id']}")
            item.update(preview)
        if "text" in item["scores"]:
            item["scores"]["text_auxiliary"] = item["scores"].pop("text")
    provenance = manifest["provenance"]
    provenance.update(positiveLabel="Weapon", negativeLabel="Other")
    provenance["auditQuestion"] = "Select every image containing a weapon."
    manifest["primaryScore"] = "model"
    manifest["presets"] = {
        "groupBy": "category" if name == "collection" else "group",
        "ranking": {"left": "query_percentile" if name == "collection" else "image", "right": "model"},
        "queryFamily": next((q["family"] for q in manifest["queries"][0]["items"] if "firearm" in q["family"]), manifest["queries"][0]["items"][0]["family"]),
        "relatedDataset": {"label": "Explore paired video collections" if name == "collection" else "Explore the image collection", "url": "/data/paired/manifest.json" if name == "collection" else "/data/collection/manifest.json"},
    }
    manifest["model"]["kind"] = "probability"
    manifest["model"]["description"] = "Three saved ensemble members are evaluated separately, then their sigmoid probabilities are averaged. Named intermediate views show member zero."
    provenance["projection"] = (
        "Initial image UMAP: cosine, 25 neighbors, min_dist 0.15, seed 42, no labels. "
        "PCA views use three fitted components. Transitions interpolate display coordinates."
    )
    if name == "collection":
        representation = next(r for r in manifest["representations"] if r["id"] == "features.image")
        ref = representation["matrix"]
        values = array("f", gzip.decompress((folder / ref["url"]).read_bytes()))
        if sys.byteorder != "little":
            values.byteswap()
        index = next(i for i, d in enumerate(manifest["featureDefinitions"]["image"]) if d["kind"] == "groupMargin")
        scores = [values[i * ref["cols"] + index] for i in range(ref["rows"])]
        order = sorted(range(len(scores)), key=scores.__getitem__)
        percentiles = [0.0] * len(scores)
        start = 0
        while start < len(order):
            stop = start + 1
            while stop < len(order) and scores[order[stop]] == scores[order[start]]:
                stop += 1
            for i in order[start:stop]:
                percentiles[i] = ((start + 1 + stop) / 2) / len(order)
            start = stop
        for item, percentile in zip(manifest["items"], percentiles):
            item["scores"]["query_percentile"] = float(percentile)
        provenance["queryPercentile"] = "Average rank / N of global positive-minus-negative query margin; a reference percentile, not a calibrated label probability."
        provenance["media"] = "Numerical reference collection. Source thumbnail URLs were not recorded, so no image files or preview links are included."
        provenance["scoreLabels"] = {"model": "Image model", "image": "Image model (same score)", "query_percentile": "Query margin percentile"}
    else:
        provenance["media"] = f"{len(manifest['items'])} thumbnail URLs derived from recorded YouTube video IDs, loaded on demand. No image files are bundled. Current thumbnails can differ from historical embedding inputs or become unavailable."
        provenance["scoreLabels"] = {"model": "Fusion model", "image": "Image model", "text_auxiliary": "Text auxiliary readout"}
        provenance["textAuxiliary"] = "Sigmoid of coordinate zero of member 0's text code. This is the branch's auxiliary readout, not a standalone text-model ensemble."
    manifest["scoreDefinitions"] = {key: {"label": label, "kind": "score" if key == "query_percentile" else "probability"} for key, label in provenance["scoreLabels"].items()}
    manifest["files"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(folder.glob("*.f32.gz"))}
    path.write_text(json.dumps(manifest, separators=(",", ":"), allow_nan=False))
    print(name, len(manifest["items"]), "records;", sum(bool(item.get("media")) for item in manifest["items"]), "thumbnail URLs")
