export function seekRanges(video) {
  const ranges = [];
  for (let i = 0; i < video.seekable.length; i++) {
    const start = video.seekable.start(i), end = video.seekable.end(i);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) ranges.push({ start, end: Math.max(start, end - .05) });
  }
  return ranges;
}
export function seekTarget(ranges, value) {
  if (!ranges.length || !Number.isFinite(value)) return null;
  let best = ranges[0].start, distance = Infinity;
  for (const range of ranges) {
    const candidate = Math.max(range.start, Math.min(range.end, value));
    if (Math.abs(candidate - value) < distance) { best = candidate; distance = Math.abs(candidate - value); }
  }
  return best;
}
export function bufferAhead(video) {
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) return video.buffered.end(i) - video.currentTime;
  }
  return 0;
}
export function playbackSample(video, previous, now = performance.now()) {
  const quality = video.getVideoPlaybackQuality?.();
  const frames = quality?.totalVideoFrames ?? null;
  const advanced = !previous || video.currentTime !== previous.time || (frames !== null && frames !== previous.frames);
  const lastAdvance = advanced || video.paused || video.seeking ? now : previous.lastAdvance;
  return { time: video.currentTime, frames, dropped: quality?.droppedVideoFrames ?? null,
    paused: video.paused, readyState: video.readyState, networkState: video.networkState,
    buffer: bufferAhead(video), lastAdvance,
    state: video.error ? `Media error ${video.error.code}` : video.ended ? 'Ended' : video.paused ? 'Paused'
      : now - lastAdvance > 5000 ? 'Stalled' : video.readyState < 3 ? 'Buffering' : 'Playing' };
}

export function needsRestart(video, sample, player, connectingSince, now = performance.now(), bufferingSince = null) {
  if (video.error || player?.failed) return true;
  if (player && !player.started && !player.closed) return now - connectingSince >= 15000;
  return !!(!video.paused && !video.ended && ((bufferingSince !== null && now - bufferingSince >= 15000)
    || (!video.seeking && sample && now - sample.lastAdvance >= 15000)));
}
