"""Read native artifacts; export identity-aligned, portable browser datasets.

All writes go to this repository. Run with an environment containing numpy,
pandas, sklearn and torch. Source repositories are never modified.
"""
from pathlib import Path
import argparse, gzip, hashlib, io, json, tarfile
import numpy as np
import pandas as pd
import torch
from sklearn.decomposition import PCA
from sklearn.model_selection import GroupShuffleSplit

ROOT = Path(__file__).resolve().parents[1]

def read_member(path, suffix):
    with tarfile.open(path) as archive:
        name = next(x for x in archive.getnames() if x.endswith(suffix))
        return archive.extractfile(name).read()

def model_parts(path):
    out = {}
    with tarfile.open(path) as archive:
        names = archive.getnames()
        base = next(n for n in names if n.endswith('children/operator_0/operator.json')).rsplit('/',1)[0]
        for name in ['encoder_0','encoder_1','head']:
            prefix=f'{base}/{name}'
            if f'{prefix}/operator.json' not in names: continue
            op=json.loads(archive.extractfile(f'{prefix}/operator.json').read())['payload']
            ts=torch.load(io.BytesIO(archive.extractfile(f'{prefix}/tensors.pt').read()),weights_only=True,map_location='cpu')
            out[name]={'spec':op,'tensors':{k:v.detach().numpy() for k,v in ts.items()}}
    return out

def graph_model(parts, prefix, inputs, nodes, capture=False):
    outputs=[]
    for member in range(3):
        codes=[]
        for index,input_id in enumerate(inputs):
            part=parts[f'encoder_{index}']['tensors']; p=f'{prefix}.{member}.encoder{index}'
            t=lambda k:part[f'members.{member}.{k}'].tolist()
            nodes.append(dict(id=p+'.norm',op='normalize',inputs=[input_id],mean=t('mean'),scale=t('scale'),name='Standardized inputs'))
            current=p+'.norm'
            for j,layer in enumerate([0,3,6]):
                target=p+f'.layer{j}'
                nodes.append(dict(id=target,op='dense',inputs=[current],weight=t(f'network.{layer}.weight'),bias=t(f'network.{layer}.bias'),activation='relu' if j<2 else 'linear',name=['Hidden layer · 16','Hidden layer · 8','Learned code · 8'][j]))
                current=target
            codes.append(current)
        joined=f'{prefix}.{member}.joined'
        nodes.append(dict(id=joined,op='concat',inputs=codes,name='Joined codes'))
        t=lambda k:parts['head']['tensors'][f'members.{member}.{k}'].tolist()
        current=joined
        indices=sorted(int(k.split('.')[3]) for k in parts['head']['tensors'] if k.startswith(f'members.{member}.network.') and k.endswith('.weight'))
        for j,layer in enumerate(indices):
            target=f'{prefix}.{member}.head{j}'
            nodes.append(dict(id=target,op='dense',inputs=[current],weight=t(f'network.{layer}.weight'),bias=t(f'network.{layer}.bias'),activation='relu' if j<len(indices)-1 else 'linear',name='Fusion hidden' if j<len(indices)-1 else 'Nonlinear logit'))
            current=target
        residual=f'{prefix}.{member}.residual'
        nodes.append(dict(id=residual,op='dense',inputs=[joined],weight=t('residual.weight'),bias=t('residual.bias'),activation='linear',name='Linear residual'))
        logit=f'{prefix}.{member}.logit'; prob=f'{prefix}.{member}.probability'
        nodes.extend([dict(id=logit,op='add',inputs=[current,residual],name='Combined logit'),dict(id=prob,op='sigmoid',inputs=[logit],name='Member probability')])
        outputs.append(prob)
    result=f'{prefix}.probability'
    nodes.append(dict(id=result,op='mean',inputs=outputs,name='Ensemble probability'))
    return result

def evaluate(nodes, inputs):
    values={k:torch.from_numpy(np.array(v,dtype=np.float32)) for k,v in inputs.items()}
    with torch.no_grad():
        for node in nodes:
            xs=[values[k] for k in node['inputs']]; op=node['op']
            if op=='normalize': value=(xs[0]-torch.tensor(node['mean']))/torch.tensor(node['scale'])
            elif op=='dense':
                value=xs[0]@torch.tensor(node['weight']).T+torch.tensor(node['bias'])
                if node['activation']=='relu':value=value.relu()
            elif op=='concat':value=torch.cat(xs,dim=1)
            elif op=='add':value=sum(xs)
            elif op=='mean':value=torch.stack(xs).mean(0)
            elif op=='sigmoid':value=xs[0].sigmoid()
            else:raise ValueError(op)
            values[node['id']]=value
    return {k:v.numpy() for k,v in values.items()}

def feature_defs(columns, queries):
    families=list(dict.fromkeys(q['family'] for q in queries)); out=[]
    for column in columns:
        family=next((f for f in families if '__'+f.lower()+'__' in column),None)
        if family is None:
            out.append(dict(name=column,kind='groupMargin'));continue
        tail=column.split('__'+family.lower()+'__')[1]
        if tail=='positive_vs_negative__margin':kind='margin';polarity=None
        elif tail=='positive_vs_negative__gated_positive':kind='gate';polarity=None
        else:
            polarity=tail.split('__')[0]; metric=tail.split('__')[1]
            kind='lse' if metric.startswith('lse') else metric
        d=dict(name=column,family=family,kind=kind,polarity=polarity)
        if kind=='lse':d['temperature']=.25 if '0_25' in tail else 1.
        out.append(d)
    return out

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,required=True,help='Read-only directory containing the saved weapons artifacts');args=ap.parse_args()
    w=args.source;nn=w/'cache/supervised-neural-network/native-nn';dest=ROOT/'public/data';dest.mkdir(parents=True,exist_ok=True)
    selected=json.loads((ROOT/'scripts/media-selection.json').read_text())
    known_media={row['id']:(row['media'],row['name']) for rows in selected.values() for row in rows}
    def parts(slug):return pd.concat([pd.read_parquet(p) for p in sorted((w/'cache'/slug/'parts').glob('*.parquet'))],ignore_index=True)
    banks={}
    for modality in ['image','text']:
        q=pd.read_parquet(io.BytesIO(read_member(nn/f'bundle/{modality}-query-bank.tar','.parquet')))
        banks[modality]=(q,np.stack(q.embedding).astype('float32'))
    image_eval=model_parts(nn/'image-only/evaluation/weapon_image_only.tar')
    image_final=model_parts(nn/'image-only/final/weapon_image_only.tar')
    fusion_eval=model_parts(nn/'fusion/evaluation/weapon_multimodal_nn.tar')
    cols={m:json.loads((nn/'bundle/contract.json').read_text())['feature_columns'][m] for m in ['image','text']}
    coll=parts('nn-image-features-siglip-base-patch16-224-d0a3ba67')
    coll=coll.merge(pd.read_parquet(w/'data/manual_labels.parquet'),on='asset_id',validate='1:1').merge(pd.read_parquet(w/'data/annotations.parquet'),on='asset_id',validate='1:1').merge(pd.read_parquet(w/'data/items.parquet'),on='asset_id',validate='1:1')
    split=np.full(len(coll),'fit',object);_,holdout=next(GroupShuffleSplit(n_splits=1,test_size=.3,random_state=42).split(coll,groups=coll.plaintext_sha256));split[holdout]='holdout'
    assert len(holdout)==5494
    dev=pd.read_parquet(nn/'development-predictions.parquet')
    pi=parts('nn-image-features-siglip-base-patch16-224-cbc2be01').set_index('video_id').loc[dev.video_id]
    pt=parts('nn-text-features-multilingual-e5-large-instruct-cbc2be01').set_index('video_id').loc[dev.video_id]
    catalog=[];validation={}
    for kind in ['collection','paired']:
        is_pair=kind=='paired';folder=dest/kind;folder.mkdir(exist_ok=True)
        n=len(dev) if is_pair else len(coll);print(kind,n,flush=True)
        representations=[];matrices={};filehashes={}
        def binary(name,array):
            a=np.asarray(array,dtype='<f4');a=a.reshape(n,-1) if a.ndim==1 else a
            raw=a.tobytes();path=folder/(name+'.f32.gz');path.write_bytes(gzip.compress(raw,compresslevel=6,mtime=0));filehashes[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
            return dict(url=path.name,rows=a.shape[0],cols=a.shape[1],encoding='f32-gzip')
        def representation(id,name,a,category,space=None,project=True):
            a=np.asarray(a,dtype=np.float32);a=a.reshape(n,-1) if a.ndim==1 else a;matrices[id]=a
            rep=dict(id=id,name=name,kind=category,dimensions=a.shape[1],matrix=binary(id,a),space=space)
            if project and a.shape[1]>1:
                pca=PCA(n_components=min(3,a.shape[1],n),svd_solver='randomized',random_state=42)
                pos=pca.fit_transform(a);pos=np.pad(pos,((0,0),(0,3-pos.shape[1])))
                rep['projection']=dict(method='PCA',positions=binary(id+'.pca',pos),mean=pca.mean_.tolist(),components=pca.components_.tolist(),explained=pca.explained_variance_ratio_.tolist())
            representations.append(rep)
        image_x=np.stack(pi.embedding if is_pair else coll.embedding).astype('float32');image_x/=np.linalg.norm(image_x,axis=1,keepdims=True)
        representation('embedding.image','Image embeddings',image_x,'embedding','SigLIP · 768')
        fimage=(pi if is_pair else coll)[cols['image']].to_numpy('float32')
        inputs={'features.image':fimage};queries=[];definitions={}
        for modality in (['image','text'] if is_pair else ['image']):
            q,qvectors=banks[modality];qvectors=qvectors/np.linalg.norm(qvectors,axis=1,keepdims=True)
            items=[dict(id=str(r.query_id),text=str(r.query),family=str(r.subgroup),polarity=str(r.polarity)) for r in q.itertuples()]
            query=dict(id=modality,representation='embedding.'+modality,items=items,vectors=binary('query.'+modality,qvectors),similarities='similarities.'+modality,features='features.'+modality)
            queries.append(query);definitions[modality]=feature_defs(cols[modality],items)
            if modality=='text':
                x=np.stack(pt.embedding).astype('float32');x/=np.linalg.norm(x,axis=1,keepdims=True)
                representation('embedding.text','Text embeddings',x,'embedding','E5 · 1,024');inputs['features.text']=pt[cols['text']].to_numpy('float32')
            else:x=image_x
            representation('similarities.'+modality,modality.title()+' query similarities',x@qvectors.T,'similarity')
            representation('features.'+modality,modality.title()+' features',inputs['features.'+modality],'features')
        nodes=[]
        transfer=graph_model(image_final if is_pair else image_eval,'image', ['features.image'],nodes)
        if is_pair:
            nodes.append(dict(id='fusion.input.image',op='concat',inputs=['features.image',transfer],name='Image features + transferred probability'))
            output=graph_model(fusion_eval,'fusion',['fusion.input.image','features.text'],nodes)
        else:output=transfer
        values=evaluate(nodes,inputs)
        traces=['image.0.encoder0.layer0','image.0.encoder0.layer2','image.0.head0'] if not is_pair else ['fusion.0.encoder0.layer2','fusion.0.encoder1.layer2','fusion.0.joined','fusion.0.head0']
        names=['Hidden layer','Image code','Head activations'] if not is_pair else ['Image code','Text code','Joint representation','Fusion hidden']
        for trace,name in zip(traces,names):representation(trace,name,values[trace],'activation')
        representation(output,'Model probability',values[output],'score',project=False)
        if is_pair:
            error=float(np.max(np.abs(values[output].ravel()-dev.probability.to_numpy())))
            assert error<2e-5,error;validation['fusion_native_max_error']=error
        items=[]
        for i in range(n):
            row=dev.iloc[i] if is_pair else coll.iloc[i];id=str(row.video_id if is_pair else row.asset_id)
            media_info=known_media.get(id)
            category=('Image + text' if row.is_thumbnail_weapon and row.is_text_weapon else 'Image only' if row.is_thumbnail_weapon else 'Text only' if row.is_text_weapon else 'Neither') if is_pair else ('Firearm' if row.C==2 else 'Blade / bow' if row.C==1 else 'Heavy weapon' if row.C==3 else 'Other')
            item=dict(id=id,name=media_info[1] if media_info else f'{category} · {id[:8]}',label=int(row.is_weapon_content if is_pair else row.manual_label),group=str(row.channel_id if is_pair else row.plaintext_sha256),split='holdout' if is_pair else str(split[i]),category=category,scores={'model':float(values[output][i,0]),'image':float(values[transfer][i,0])},annotations={})
            if media_info:item['media']=media_info[0]
            if is_pair:
                item['annotations']={'image':int(row.is_thumbnail_weapon),'text':int(row.is_text_weapon)}
                item['scores']['text']=float(torch.sigmoid(torch.tensor(values['fusion.0.encoder1.layer2'][i,0])))
            else:item['annotations']={k:None if pd.isna(row[k]) else float(row[k]) for k in ['F','A','C','G','N','R','flag']}
            items.append(item)
        manifest=dict(schemaVersion=1,id='weapons-'+kind,title='Weapons · paired videos' if is_pair else 'Weapons · image collection',description='Channel-grouped development holdout; fusion evaluation model.' if is_pair else 'Reviewed thumbnail collection; image evaluation model. Metrics use the 5,494 byte-grouped holdout rows.',items=items,representations=representations,queries=queries,featureDefinitions=definitions,model=dict(id='weapons-'+kind,output=output,nodes=nodes,inputs=list(inputs),threshold=.4043194055557251 if is_pair else .4085729420185089,fit='evaluation',reference=output),provenance=dict(kind='recorded',model='Fusion evaluation with final image-only transfer' if is_pair else 'Image-only evaluation refit',source='Saved weapons notebook and native artifacts',embeddingModels={'image':'google/siglip-base-patch16-224','text':'intfloat/multilingual-e5-large-instruct'},projection='PCA fitted without labels on the displayed cohort; 3 components. Intermediate transitions are animation.',groupScope='Videos in the labeled holdout, not full channel inventories.' if is_pair else 'Identical image bytes.',trainingSnapshots=False),files=filehashes)
        (folder/'manifest.json').write_text(json.dumps(manifest,separators=(',',':'),allow_nan=False))
        catalog.append(dict(id=manifest['id'],title=manifest['title'],description=manifest['description'],rows=n,url='/data/'+kind+'/manifest.json'))
    catalog.sort(key=lambda entry: entry['id'] != 'weapons-paired')
    (dest/'catalog.json').write_text(json.dumps(catalog))
    (dest/'validation.json').write_text(json.dumps(validation,indent=2));print(validation,flush=True)

if __name__=='__main__':main()
