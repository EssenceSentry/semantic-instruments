from pathlib import Path
import gzip,json
import numpy as np
import umap
root=Path(__file__).resolve().parents[1]
for dataset in ['collection','paired']:
 folder=root/'public/data'/dataset;path=folder/'manifest.json';m=json.loads(path.read_text());rep=m['representations'][0];ref=rep['matrix'];x=np.frombuffer(gzip.decompress((folder/ref['url']).read_bytes()),dtype='<f4').reshape(ref['rows'],ref['cols'])
 print('Computing label-free UMAP',dataset,x.shape,flush=True)
 coordinates=umap.UMAP(n_components=2,n_neighbors=25,min_dist=.15,metric='cosine',random_state=42,n_jobs=1,low_memory=True).fit_transform(x)
 assert np.isfinite(coordinates).all()
 name='embedding.image.umap.f32.gz';(folder/name).write_bytes(gzip.compress(np.asarray(coordinates,dtype='<f4').tobytes(),mtime=0))
 rep['overview']={'method':'UMAP','positions':{'url':name,'rows':len(x),'cols':2,'encoding':'f32-gzip'},'parameters':{'neighbors':25,'minDistance':.15,'metric':'cosine','seed':42,'labelsUsed':False}}
 path.write_text(json.dumps(m,separators=(',',':')));print('Saved',dataset,flush=True)
