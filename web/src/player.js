import Hls from 'hls.js';
import { deviceProfile } from './api.js';

export class StreamPlayer {
  constructor(api, item, video, onStatus) {
    Object.assign(this, { api, item, video, onStatus });
    this.closed = false;
    this.started = false;
    this.listeners = [];
    this.reportQueue = Promise.resolve();
  }
  payload() {
    return { ItemId: this.item.Id, MediaSourceId: this.source?.Id,
      PlaySessionId: this.session, LiveStreamId: this.source?.LiveStreamId,
      PositionTicks: Math.round((Number.isFinite(this.video.currentTime) ? this.video.currentTime : 0) * 1e7),
      IsPaused: this.video.paused, IsMuted: this.video.muted, VolumeLevel: Math.round(this.video.volume * 100),
      CanSeek: Number.isFinite(this.video.duration), PlayMethod: this.method };
  }
  report(kind, keepalive = false) {
    const body = this.payload();
    this.reportQueue = this.reportQueue.catch(() => {}).then(() => this.api.request(`Sessions/Playing${kind}`, { method: 'POST', body, keepalive }));
    return this.reportQueue.catch(() => this.onStatus('Playback reporting unavailable'));
  }
  listen(event, handler) {
    this.video.addEventListener(event, handler);
    this.listeners.push([event, handler]);
  }
  async start() {
    try {
      const info = await this.api.request(`Items/${this.item.Id}/PlaybackInfo`, { method: 'POST', body: {
        UserId: this.api.userId, DeviceProfile: deviceProfile(), IsPlayback: true,
        AutoOpenLiveStream: true, MaxStreamingBitrate: 8000000,
        StartTimeTicks: 0, EnableDirectPlay: true, EnableDirectStream: true,
        EnableTranscoding: true, AllowVideoStreamCopy: true, AllowAudioStreamCopy: true
      } });
      this.session = info.PlaySessionId;
      // Retain every opened source so even cancellation can release server resources.
      this.openedSources = info.MediaSources || [];
      this.source = this.openedSources.find(s => s.SupportsDirectPlay || s.SupportsDirectStream || s.TranscodingUrl);
      if (this.closed) { await this.release(); return; }
      if (info.ErrorCode || !this.source) throw new Error('No playable stream. Check library access and transcoding permissions.');
      let source = this.source;
      if (source.RequiresOpening && !source.LiveStreamId) {
        const opened = await this.api.request('LiveStreams/Open', { method: 'POST', body: {
          OpenToken: source.OpenToken, ItemId: this.item.Id, UserId: this.api.userId,
          PlaySessionId: this.session, DeviceProfile: deviceProfile(), MaxStreamingBitrate: 8000000
        } });
        source = this.source = opened.MediaSource;
        this.openedSources.push(source);
        if (this.closed) { await this.release(); return; }
      }
      let url;
      let hls = false;
      if (source.SupportsDirectPlay || source.SupportsDirectStream) {
        this.method = source.SupportsDirectPlay ? 'DirectPlay' : 'DirectStream';
        url = this.api.url(`Videos/${this.item.Id}/stream.${source.Container || 'mp4'}`, {
          Static: true, MediaSourceId: source.Id, DeviceId: this.api.deviceId,
          PlaySessionId: this.session, api_key: this.api.client.accessToken(),
          ...(source.LiveStreamId ? { LiveStreamId: source.LiveStreamId } : {})
        });
      } else if (source.TranscodingUrl) {
        this.method = 'Transcode';
        url = this.api.url(source.TranscodingUrl);
        hls = source.TranscodingSubProtocol === 'hls' || /\.m3u8(?:\?|$)/i.test(url);
      } else throw new Error('This source did not return a playable URL.');
      this.listen('playing', () => {
        this.onStatus('');
        if (!this.started) { this.started = true; void this.report(''); }
        else void this.report('/Progress');
      });
      this.listen('pause', () => { if (this.started && !this.closed) void this.report('/Progress'); });
      this.listen('waiting', () => this.onStatus('Buffering…'));
      this.listen('error', () => {
        this.onStatus('Stream failed. Remove it and try adding it again.');
        void this.stop();
      });
      this.listen('ended', () => { this.onStatus('Stream ended'); void this.stop(); });
      this.timer = setInterval(() => { if (this.started && !this.closed) void this.report('/Progress'); }, 10000);
      this.video.muted = true;
      if (hls && Hls.isSupported()) {
        this.hls = new Hls({ maxBufferLength: 20, backBufferLength: 15 });
        this.hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            this.onStatus('Stream failed. Remove it and try adding it again.');
            void this.stop();
          }
        });
        this.hls.loadSource(url);
        this.hls.attachMedia(this.video);
      } else {
        if (hls && !this.video.canPlayType('application/vnd.apple.mpegurl')) throw new Error('This browser cannot play HLS.');
        this.video.src = url;
      }
      try { await this.video.play(); }
      catch { if (!this.closed) this.onStatus('Select Play to start this stream.'); }
    } catch (error) {
      if (!this.closed) this.onStatus(error.message);
      await this.stop();
    }
  }
  async release() {
    const ids = [...new Set((this.openedSources || []).map(s => s?.LiveStreamId).filter(Boolean))];
    this.openedSources = [];
    const jobs = ids.map(id => this.api.request('LiveStreams/Close', { method: 'POST', query: { LiveStreamId: id }, keepalive: true }));
    if (this.session) jobs.push(this.api.request('Videos/ActiveEncodings', { method: 'DELETE', query: { DeviceId: this.api.deviceId, PlaySessionId: this.session }, keepalive: true }));
    const results = await Promise.allSettled(jobs);
    if (results.some(r => r.status === 'rejected')) this.onStatus('Server stream cleanup could not be confirmed.');
  }
  async stop() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    for (const [event, handler] of this.listeners) this.video.removeEventListener(event, handler);
    this.hls?.destroy();
    this.video.pause();
    if (this.started) await this.report('/Stopped', true);
    this.video.removeAttribute('src');
    this.video.load();
    await this.release();
  }
}
