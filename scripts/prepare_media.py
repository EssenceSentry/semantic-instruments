"""Prepare bounded original thumbnails for visual inspection; no source writes."""
from pathlib import Path
import argparse,io,json
import boto3
import pandas as pd
from PIL import Image,ImageDraw
from auto_classifier.tools.secure_media import load_collection,SecureMediaGallerySource
args_parser=argparse.ArgumentParser(description=__doc__)
args_parser.add_argument('--source',type=Path,required=True)
args_parser.add_argument('--expected-caller-arn',required=True,help='Expected authenticated AWS identity for this local-only preparation')
args=args_parser.parse_args()
root=Path(__file__).resolve().parents[1];source=args.source
manifest_path=root/'public/data/collection/manifest.json';manifest=json.loads(manifest_path.read_text())
table=pd.read_parquet(source/'data/annotations.parquet').merge(pd.read_parquet(source/'data/manual_labels.parquet'),on='asset_id')
table=table.loc[(table.G==0)&(table.A==0)&table.reviewed&~table.review_conflict&~table.IRRELEVANT].sort_values('asset_id')
chosen=[]
for positive in [True,False]:
 for category in [2.,1.,0.,3.]:chosen.extend(table.loc[(table.manual_label==positive)&(table.C==category)].head(12).asset_id.tolist())
chosen=list(dict.fromkeys(chosen));out=root/'work/media-review';out.mkdir(parents=True,exist_ok=True)
session_aws=boto3.Session();assert session_aws.client('sts').get_caller_identity()['Arn']==args.expected_caller_arn
collection=load_collection(source/'data/encrypted-images');session=SecureMediaGallerySource(source/'data/encrypted-images',cipher_spec=collection.cipher).open()
inventory=[]
try:
 for i,id in enumerate(chosen):
  p=out/(id+'.jpg')
  if not p.exists():
   im=Image.open(io.BytesIO(session.load_bytes(id,max_image_bytes=20_000_000))).convert('RGB');im.thumbnail((360,250));im.save(p,quality=82)
  inventory.append({'index':i,'id':id,'path':str(p)})
finally:session.close()
for batch in range((len(inventory)+35)//36):
 sheet=Image.new('RGB',(1200,840),'#f4f2eb');draw=ImageDraw.Draw(sheet)
 for j,r in enumerate(inventory[batch*36:(batch+1)*36]):
  im=Image.open(r['path']);im.thumbnail((188,113));x=j%6*200;y=j//6*140;sheet.paste(im,(x+(200-im.width)//2,y+3));draw.text((x+7,y+119),str(r['index'])+' / '+r['id'][:8],fill='#182724')
 sheet.save(out/f'contact-{batch}.jpg')
(out/'inventory.json').write_text(json.dumps(inventory));print('Prepared',len(inventory),'original thumbnails for inspection.')
