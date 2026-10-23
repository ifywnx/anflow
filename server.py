"""Loopback-only VietFlow: captions -> Whisper fallback -> translation -> cached TTS."""
from __future__ import annotations
import argparse, getpass, hashlib, html, json, os, re, subprocess, sys, threading, time, uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from types import SimpleNamespace
import deep_translator.google as google_module
google_module.requests=SimpleNamespace(get=lambda *a,**kw: requests.get(*a,timeout=20,**kw))

ROOT=Path(__file__).resolve().parent
DATA=ROOT/'data'; DATA.mkdir(exist_ok=True)
CACHE=DATA/'audio'; CACHE.mkdir(exist_ok=True)
JOBS={}; JOBS_LOCK=threading.Lock(); POOL=ThreadPoolExecutor(max_workers=1)
KEY=''; TTS_LOCK=threading.Lock(); WHISPER=None; TTS_SESSION_CHARS=0
app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)

@app.middleware('http')
async def local_only(request:Request,call_next):
    host=request.headers.get('host','')
    if not re.fullmatch(r'(localhost|127\.0\.0\.1):4174',host):return JSONResponse({'detail':'Localhost only'},403)
    origin=request.headers.get('origin')
    if origin and origin not in ('http://127.0.0.1:4174','http://localhost:4174'):return JSONResponse({'detail':'Cross-origin request blocked'},403)
    if request.method in ('POST','DELETE') and request.headers.get('x-vietflow')!='1':return JSONResponse({'detail':'Missing app header'},403)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='strict-origin-when-cross-origin'
    if request.url.path.startswith('/api/'):response.headers['Cache-Control']='no-store'
    return response

class JobInput(BaseModel):
    video_id:str=Field(pattern=r'^[\w-]{11}$')
    start:float=Field(default=0,ge=0,le=86400)
    duration:int=Field(default=120,ge=10,le=300)
    force_whisper:bool=False
class KeyInput(BaseModel):
    key:str=Field(max_length=300)
class SpeechInput(BaseModel):
    text:str=Field(min_length=1,max_length=1000)
    voice_id:str=Field(default='EXAVITQu4vr4xnSDxMaL',pattern=r'^[A-Za-z0-9]{10,40}$')
class TranslateInput(BaseModel):
    texts:list[str]=Field(min_length=1,max_length=35)

def valid(j):
    if j.get('cancel'):raise RuntimeError('Đã hủy tác vụ.')
def status(j,text):
    valid(j); j['stage']=text

def clean(text):return html.unescape(re.sub(r'<[^>]*>','',text)).strip()
def cue(text,start,end):return {'original':clean(text),'translation':'','start':round(float(start),3),'end':round(float(end),3)}
def pick_range(cues,start,end):return [c for c in cues if c['original'] and c['end']>start and c['start']<end]

def transcript_api(video_id,start,end,j):
    from youtube_transcript_api import YouTubeTranscriptApi
    class TimedSession(requests.Session):
        def request(self,*args,**kwargs):kwargs.setdefault('timeout',20);return super().request(*args,**kwargs)
    api=YouTubeTranscriptApi(http_client=TimedSession())
    tracks=list(api.list(video_id))
    if not tracks:raise RuntimeError('Video không có track phụ đề.')
    preferred=sorted(tracks,key=lambda t:(0 if t.language_code.startswith('en') else 1 if t.language_code=='vi' else 2,t.is_generated))[0]
    raw=preferred.fetch()
    cues=pick_range([cue(s.text,s.start,s.start+s.duration) for s in raw],start,end)
    translated=[]
    if preferred.language_code=='vi':
        for c in cues:c['translation']=c['original']
    elif preferred.is_translatable:
        try:
            status(j,'Đang lấy bản dịch tiếng Việt từ YouTube…')
            translated=list(preferred.translate('vi').fetch())
        except Exception:pass
    if translated:
        for c in cues:
            # Only use aligned cues. Do not pair unrelated lines by array index.
            match=next((t for t in translated if abs(t.start-c['start'])<0.15),None)
            if match:c['translation']=clean(match.text)
    if not cues:raise RuntimeError('Không có phụ đề trong đoạn này; thử nguồn khác.')
    return cues,preferred.language_code

class Quiet:
    def debug(self,*args):pass
    def info(self,*args):pass
    def warning(self,*args):pass
    def error(self,*args):pass

def ffmpeg():
    import imageio_ffmpeg
    folder=DATA/'bin';folder.mkdir(exist_ok=True)
    link=folder/'ffmpeg'
    if not link.exists():link.symlink_to(imageio_ffmpeg.get_ffmpeg_exe())
    return str(link)

def run_process(args,j,timeout=240):
    # Logs may contain signed media URLs; keep them local and never return them to clients.
    log=DATA/(j['id']+'.log')
    with log.open('w') as f:
        p=subprocess.Popen(args,stdout=f,stderr=f)
        started=time.monotonic()
        try:
            while p.poll() is None:
                valid(j)
                if time.monotonic()-started>timeout:raise RuntimeError('Nguồn tải phản hồi quá lâu.')
                time.sleep(.25)
            if p.returncode:raise RuntimeError('YouTube từ chối tải hoặc nguồn không khả dụng.')
        finally:
            if p.poll() is None:p.terminate();p.wait(timeout=10)
            log.unlink(missing_ok=True)

def ytdlp_captions(video_id,start,end,j,folder):
    status(j,'Thử nguồn phụ đề dự phòng yt-dlp…')
    run_process([sys.executable,'-m','yt_dlp','--no-playlist','--skip-download','--write-subs','--write-auto-subs','--sub-langs','en,vi','--sub-format','json3','--socket-timeout','15','--retries','0','--quiet','--no-warnings','-o',str(folder/'captions.%(ext)s'),'https://www.youtube.com/watch?v='+video_id],j,90)
    files=list(folder.glob('*.json3'))
    if not files:raise RuntimeError('Không tải được track phụ đề.')
    file=next((f for f in files if '.en.' in f.name),files[0])
    data=json.loads(file.read_text())
    cues=[]
    for event in data.get('events',[]):
        text=''.join(x.get('utf8','') for x in event.get('segs',[]));s=event.get('tStartMs',0)/1000
        if text.strip():cues.append(cue(text,s,s+event.get('dDurationMs',2000)/1000))
    cues=pick_range(cues,start,end)
    if not cues:raise RuntimeError('Nguồn yt-dlp không có phụ đề ở đoạn được chọn.')
    language='vi' if '.vi.' in file.name else 'en'
    if language=='vi':
        for c in cues:c['translation']=c['original']
    return cues,language

def transcribe_file(path,start,duration,j,folder,already_clipped=False):
    global WHISPER
    status(j,'Chuẩn hóa âm thanh cho Whisper…')
    wav=folder/'input.wav'
    run_process([ffmpeg(),'-nostdin','-y','-ss',str(0 if already_clipped else start),'-i',str(path),'-t',str(duration),'-vn','-ac','1','-ar','16000',str(wav)],j,120)
    status(j,'Đang nạp Whisper base (lần đầu tải model khoảng 150 MB)…')
    if WHISPER is None:
        from faster_whisper import WhisperModel
        WHISPER=WhisperModel('base',device='cpu',compute_type='int8',cpu_threads=4,download_root=str(DATA/'models'))
    valid(j)
    segments,info=WHISPER.transcribe(str(wav),beam_size=3,vad_filter=True,condition_on_previous_text=False)
    result=[]
    for s in segments:
        status(j,f'Whisper đang chép lời: {int(s.end)} / {duration} giây…')
        if s.text.strip():result.append(cue(s.text,start+s.start,start+s.end))
    return result,info.language

def translate_cues(cues,language,j):
    warnings=[]
    for i,c in enumerate(cues):
        valid(j)
        if c['translation']:continue
        if language=='vi':c['translation']=c['original'];continue
        status(j,f'Đang dịch tiếng Việt: {i+1}/{len(cues)} câu…')
        h=hashlib.sha256(c['original'].encode()).hexdigest()
        cache=DATA/'translations';cache.mkdir(exist_ok=True);file=cache/(h+'.txt')
        if file.exists():c['translation']=file.read_text();continue
        try:
            # No key required. This public translation service may rate-limit requests.
            r=requests.get('https://translate.googleapis.com/translate_a/single',params={'client':'gtx','sl':'auto','tl':'vi','dt':'t','q':c['original']},timeout=20)
            r.raise_for_status()
            data=r.json()
            c['translation']=''.join(part[0] for part in data[0] if part and isinstance(part[0],str))
            time.sleep(.3)
            if c['translation']:file.write_text(c['translation'])
        except Exception:
            warnings.append('Dịch miễn phí bị giới hạn hoặc lỗi mạng; giữ nguyên bản gốc cho các câu chưa dịch.')
            break
    return list(dict.fromkeys(warnings))

def execute(j,spec,upload=None):
    folder=DATA/'jobs'/j['id'];folder.mkdir(parents=True,exist_ok=True)
    start=spec.start;end=start+spec.duration
    result=None;language='auto';source='';failures=[]
    try:
        j['state']='running'
        cache=DATA/'results';cache.mkdir(exist_ok=True)
        cachefile=cache/(hashlib.sha256(f'{spec.video_id}:{start}:{end}:{"whisper" if spec.force_whisper else "auto"}'.encode()).hexdigest()+'.json')
        if not upload and cachefile.exists():
            cached=json.loads(cachefile.read_text())
            if any(not c['translation'] for c in cached['cues']):
                cached['warnings']=translate_cues(cached['cues'],cached['language'],j)
                cachefile.write_text(json.dumps(cached,ensure_ascii=False))
            j.update(state='done',stage='Đã lấy phụ đề đã lưu.',result=cached);return
        if upload:
            result,language=transcribe_file(upload,start,spec.duration,j,folder);source='whisper'
        elif not spec.force_whisper:
            try:
                status(j,'Đang lấy phụ đề gốc / phụ đề tự động YouTube…')
                result,language=transcript_api(spec.video_id,start,end,j);source='youtube'
            except Exception as e:
                valid(j);failures.append('Nguồn youtube-transcript-api không khả dụng ('+type(e).__name__+').')
                try:result,language=ytdlp_captions(spec.video_id,start,end,j,folder);source='yt-dlp'
                except Exception as e:valid(j);failures.append('Nguồn phụ đề yt-dlp không khả dụng.')
        if not result and not upload:
            status(j,'Không có phụ đề phù hợp; đang tải đoạn âm thanh để chạy Whisper…')
            ff=ffmpeg()
            run_process([sys.executable,'-m','yt_dlp','--no-playlist','--no-warnings','--quiet','--socket-timeout','20','--retries','0','-f','bestaudio/best','--ffmpeg-location',str(Path(ff).parent),'--download-sections',f'*{start}-{end}','-o',str(folder/'source.%(ext)s'),'https://www.youtube.com/watch?v='+spec.video_id],j,240)
            files=list(folder.glob('source.*'))
            if not files:raise RuntimeError('Không tải được âm thanh. Hãy nhập file âm thanh/video để chạy Whisper.')
            result,language=transcribe_file(files[0],start,spec.duration,j,folder,True);source='whisper'
        valid(j)
        warnings=translate_cues(result,language,j)
        if not result:
            warnings.append('Whisper không phát hiện lời nói trong đoạn này; thử đoạn khác hoặc nhập phụ đề.')
        response={'cues':result,'source':source,'language':language,'start':start,'end':end,'warnings':warnings,'fallbacks':failures}
        if not upload:cachefile.write_text(json.dumps(response,ensure_ascii=False))
        j.update(state='done',stage='Hoàn tất.',result=response)
    except Exception as e:
        j.update(state='cancelled' if j.get('cancel') else 'error',stage='Đã hủy.' if j.get('cancel') else 'Không hoàn tất.',error=str(e)[:300]+' Nếu YouTube chặn tải, nhập file âm thanh/video để dùng Whisper trên máy.')
    finally:
        import shutil
        shutil.rmtree(folder,ignore_errors=True)
        if upload:Path(upload).unlink(missing_ok=True)

def create_job(spec,upload=None):
    with JOBS_LOCK:
        if any(j['state'] in ('queued','running') for j in JOBS.values()):raise HTTPException(409,'Đang có tác vụ chạy. Hãy chờ hoặc hủy trước.')
        if len(JOBS)>50:
            for key in list(JOBS)[:-20]:del JOBS[key]
        job={'id':uuid.uuid4().hex,'state':'queued','stage':'Đang chờ…','cancel':False}
        JOBS[job['id']]=job
    POOL.submit(execute,job,spec,upload)
    return {'job_id':job['id']}

@app.get('/api/health')
def health():return {'ok':True,'elevenlabs_connected':bool(KEY),'tts_input_characters_this_run':TTS_SESSION_CHARS,'whisper':'base / CPU int8'}
@app.post('/api/key')
def key(data:KeyInput):
    global KEY
    KEY=data.key.strip();return {'connected':bool(KEY)}
@app.post('/api/captions')
def captions(data:JobInput):return create_job(data)
@app.get('/api/jobs/{job_id}')
def job(job_id:str):
    if job_id not in JOBS:raise HTTPException(404,'Không tìm thấy tác vụ.')
    return {k:v for k,v in JOBS[job_id].items() if k!='cancel'}
@app.post('/api/jobs/{job_id}/cancel')
def cancel(job_id:str):
    if job_id not in JOBS:raise HTTPException(404,'Không tìm thấy tác vụ.')
    JOBS[job_id]['cancel']=True;return {'ok':True}
@app.post('/api/upload')
async def upload(file:UploadFile=File(...),video_id:str=Form(...),start:float=Form(0),duration:int=Form(120)):
    try:spec=JobInput(video_id=video_id,start=start,duration=duration)
    except Exception:raise HTTPException(400,'Tham số không hợp lệ.')
    path=DATA/(uuid.uuid4().hex+'.media');size=0
    try:
        with path.open('wb') as f:
            while block:=await file.read(1024*1024):
                size+=len(block)
                if size>100*1024*1024:raise HTTPException(413,'File tối đa 100 MB.')
                f.write(block)
        return create_job(spec,str(path))
    except Exception:path.unlink(missing_ok=True);raise
    finally:await file.close()
@app.post('/api/translate')
def translate(data:TranslateInput):
    if any(len(t)>4500 for t in data.texts):raise HTTPException(400,'Mỗi câu tối đa 4500 ký tự.')
    cues=[cue(t,0,1) for t in data.texts];j={'cancel':False}
    warnings=translate_cues(cues,'auto',j)
    return {'translations':[c['translation'] for c in cues],'warnings':warnings}

@app.get('/api/voices')
def voices():
    if not KEY:raise HTTPException(400,'Chưa nhập khóa ElevenLabs.')
    try:
        r=requests.get('https://api.elevenlabs.io/v2/voices',params={'page_size':100},headers={'xi-api-key':KEY},timeout=25)
        if not r.ok:raise HTTPException(r.status_code,'ElevenLabs không cho phép đọc giọng. Kiểm tra quyền voices_read.')
        return {'voices':[{'id':v['voice_id'],'name':v['name'],'gender':v.get('labels',{}).get('gender','')} for v in r.json().get('voices',[])]}
    except requests.RequestException:raise HTTPException(502,'Không kết nối được ElevenLabs.')
@app.post('/api/speech')
def speech(data:SpeechInput):
    global TTS_SESSION_CHARS
    digest=hashlib.sha256(('eleven_flash_v2_5|'+data.voice_id+'|'+data.text).encode()).hexdigest()
    file=CACHE/(digest+'.mp3')
    with TTS_LOCK:
        cached=file.exists()
        if not cached:
            if not KEY:raise HTTPException(400,'Chưa nhập ElevenLabs API key.')
            try:
                r=requests.post('https://api.elevenlabs.io/v1/text-to-speech/'+data.voice_id,params={'output_format':'mp3_44100_128'},headers={'xi-api-key':KEY},json={'text':data.text,'model_id':'eleven_flash_v2_5','language_code':'vi'},timeout=60)
                if not r.ok:
                    try:detail=r.json().get('detail',{});detail=detail.get('message',str(detail)) if isinstance(detail,dict) else str(detail)
                    except Exception:detail='Không tạo được giọng đọc.'
                    raise HTTPException(r.status_code,detail.replace(KEY,'[redacted]')[:300])
                if not r.headers.get('content-type','').startswith('audio/'):raise HTTPException(502,'ElevenLabs không trả âm thanh.')
                file.write_bytes(r.content);TTS_SESSION_CHARS+=len(data.text)
            except requests.RequestException:raise HTTPException(502,'Không kết nối được ElevenLabs. Không tự động thử lại để tránh tính phí trùng.')
    return {'url':'/api/audio/'+digest,'cached':cached,'input_characters':0 if cached else len(data.text)}
@app.get('/api/audio/{digest}')
def audio(digest:str):
    if not re.fullmatch('[a-f0-9]{64}',digest):raise HTTPException(404)
    file=CACHE/(digest+'.mp3')
    if not file.exists():raise HTTPException(404)
    return FileResponse(file,media_type='audio/mpeg')
@app.get('/')
def root():return RedirectResponse('/video.html')
app.mount('/',StaticFiles(directory=ROOT/'dist',html=True),name='static')
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--ask-key',action='store_true');args=parser.parse_args()
    if args.ask_key:KEY=getpass.getpass('ElevenLabs key (Enter để bỏ qua): ').strip()
    import uvicorn
    uvicorn.run(app,host='127.0.0.1',port=4174,access_log=False)
