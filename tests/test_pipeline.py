import sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server as s

class Pipeline(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.old=s.DATA;s.DATA=Path(self.temp.name)
 def tearDown(self):s.DATA=self.old;self.temp.cleanup()
 def job(self):return {'id':'test-job','cancel':False,'state':'queued'}
 def test_caption_success_does_not_use_whisper(self):
  j=self.job()
  with patch.object(s,'transcript_api',return_value=([s.cue('hello',0,2)],'en')),patch.object(s,'translate_cues',return_value=[]),patch.object(s,'transcribe_file') as whisper:
   s.execute(j,s.JobInput(video_id='4ycKrWTvzNY'))
   self.assertEqual(j['state'],'done');self.assertEqual(j['result']['source'],'youtube');whisper.assert_not_called()
 def test_empty_youtube_captions_retry_ytdlp(self):
  j=self.job()
  with patch.object(s,'transcript_api',side_effect=RuntimeError('Không có phụ đề trong đoạn này.')),patch.object(s,'ytdlp_captions',return_value=([s.cue('hello backup',0,2)],'en')) as fallback,patch.object(s,'transcribe_file') as whisper,patch.object(s,'translate_cues',return_value=[]):
   s.execute(j,s.JobInput(video_id='4ycKrWTvzNY'))
   self.assertEqual(j['state'],'done')
   self.assertEqual(j['result']['source'],'yt-dlp')
   fallback.assert_called_once()
   whisper.assert_not_called()
 def test_empty_all_sources_retry_whisper(self):
  j=self.job()
  def fake_download(args,job,timeout):
   target=Path(args[args.index('-o')+1].replace('%(ext)s','m4a'))
   target.write_bytes(b'fixture')
  with patch.object(s,'transcript_api',return_value=([],'en')),patch.object(s,'ytdlp_captions',return_value=([],'en')),patch.object(s,'ffmpeg',return_value='/tmp/ffmpeg'),patch.object(s,'run_process',side_effect=fake_download),patch.object(s,'transcribe_file',return_value=([s.cue('fallback',0,2)],'en')),patch.object(s,'translate_cues',return_value=[]):
   s.execute(j,s.JobInput(video_id='4ycKrWTvzNY'))
   self.assertEqual(j['state'],'done')
   self.assertEqual(j['result']['source'],'whisper')
 def test_force_whisper_cache_is_separate_from_normal_mode(self):
  def fake_download(args,job,timeout):
   target=Path(args[args.index('-o')+1].replace('%(ext)s','m4a'))
   target.write_bytes(b'fixture')
  j=self.job()
  with patch.object(s,'ffmpeg',return_value='/tmp/ffmpeg'),patch.object(s,'run_process',side_effect=fake_download),patch.object(s,'transcribe_file',return_value=([s.cue('whisper result',0,2)],'en')) as whisper,patch.object(s,'translate_cues',return_value=[]):
   s.execute(j,s.JobInput(video_id='4ycKrWTvzNY',force_whisper=True))
   self.assertEqual(j['result']['source'],'whisper')
   self.assertEqual(whisper.call_count,1)
  standard=self.job()
  with patch.object(s,'transcript_api',return_value=([s.cue('youtube captions',0,2)],'en')) as original,patch.object(s,'translate_cues',return_value=[]):
   s.execute(standard,s.JobInput(video_id='4ycKrWTvzNY'))
   self.assertEqual(standard['result']['source'],'youtube')
   original.assert_called_once()
  repeat=self.job()
  with patch.object(s,'transcribe_file') as whisper:
   s.execute(repeat,s.JobInput(video_id='4ycKrWTvzNY',force_whisper=True))
   self.assertEqual(repeat['result']['source'],'whisper')
   whisper.assert_not_called()
 def test_missing_captions_switches_to_whisper(self):
  j=self.job()
  def fake_download(args,job,timeout):
   target=Path(args[args.index('-o')+1].replace('%(ext)s','m4a'));target.write_bytes(b'fixture')
  with patch.object(s,'transcript_api',side_effect=LookupError()),patch.object(s,'ytdlp_captions',side_effect=LookupError()),patch.object(s,'ffmpeg',return_value='/tmp/ffmpeg'),patch.object(s,'run_process',side_effect=fake_download),patch.object(s,'transcribe_file',return_value=([s.cue('xin chao',0,2)],'vi')) as whisper,patch.object(s,'translate_cues',return_value=[]):
   s.execute(j,s.JobInput(video_id='4ycKrWTvzNY'))
   self.assertEqual(j['state'],'done');self.assertEqual(j['result']['source'],'whisper');whisper.assert_called_once();self.assertEqual(len(j['result']['fallbacks']),2)
 def test_upload_skips_youtube(self):
  f=s.DATA/'upload.media';f.write_bytes(b'fixture');j=self.job()
  with patch.object(s,'transcript_api') as yt,patch.object(s,'transcribe_file',return_value=([],'vi')),patch.object(s,'translate_cues',return_value=[]):
   s.execute(j,s.JobInput(video_id='4ycKrWTvzNY'),str(f));yt.assert_not_called();self.assertEqual(j['state'],'done');self.assertFalse(f.exists())
 def test_cancelled_job_never_downloads(self):
  j=self.job();j['cancel']=True
  with patch.object(s,'transcript_api') as yt:s.execute(j,s.JobInput(video_id='4ycKrWTvzNY'));yt.assert_not_called()
  self.assertEqual(j['state'],'cancelled')
 def test_download_failure_has_file_fallback(self):
  j=self.job()
  with patch.object(s,'transcript_api',side_effect=LookupError()),patch.object(s,'ytdlp_captions',side_effect=LookupError()),patch.object(s,'ffmpeg',return_value='/tmp/ffmpeg'),patch.object(s,'run_process',side_effect=RuntimeError('blocked')):
   s.execute(j,s.JobInput(video_id='4ycKrWTvzNY'))
  self.assertEqual(j['state'],'error');self.assertIn('nhập file',j['error'])
 def test_validation_rejects_arbitrary_urls_and_unbounded_jobs(self):
  for data in ({'video_id':'https://localhost/private'},{'video_id':'4ycKrWTvzNY','duration':36000},{'video_id':'4ycKrWTvzNY','start':-1}):
   with self.assertRaises(ValueError):s.JobInput(**data)
 def test_speech_replay_never_calls_vendor(self):
  old=s.CACHE;s.CACHE=s.DATA
  try:
   body=s.SpeechInput(text='Xin chào');digest=s.hashlib.sha256(('eleven_flash_v2_5|'+body.voice_id+'|'+body.text).encode()).hexdigest();(s.CACHE/(digest+'.mp3')).write_bytes(b'mp3')
   with patch.object(s.requests,'post') as vendor:
    result=s.speech(body);self.assertTrue(result['cached']);self.assertEqual(result['input_characters'],0);vendor.assert_not_called()
  finally:s.CACHE=old
if __name__=='__main__':unittest.main()
