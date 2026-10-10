// randomUUID is unavailable on ordinary HTTP LAN origins; getRandomValues is not.
export function randomId(cryptoProvider = globalThis.crypto) {
  if (cryptoProvider.randomUUID) return cryptoProvider.randomUUID();
  const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class JellyfinApi {
  constructor(client, fetcher = globalThis.fetch.bind(globalThis), separateDevice = true) {
    this.client = client;
    this.fetcher = fetcher;
    this.userId = client.getCurrentUserId();
    // Separate device identities prevent secondary players replacing the main session.
    this.deviceId = separateDevice ? `${client.deviceId()}-multiview-${randomId()}` : client.deviceId();
  }
  url(path, query = {}) {
    return this.client.getUrl(path.replace(/^\//, ''), query);
  }
  authorization() {
    const quote = value => encodeURIComponent(String(value));
    // Preserve the original app metadata to avoid repeatedly rewriting the shared token's device record.
    return `MediaBrowser Client="${quote(this.client.appName?.() || 'Multiview')}", Device="${quote(this.client.deviceName?.() || 'Web')}", DeviceId="${quote(this.deviceId)}", Version="${quote(this.client.appVersion?.() || '0.2.3')}", Token="${quote(this.client.accessToken())}"`;
  }
  mediaUrl(path, query = {}) {
    const url = new URL(this.url(path, query), globalThis.location?.href);
    url.searchParams.delete('api_key');
    url.searchParams.set('ApiKey', this.client.accessToken());
    url.searchParams.set('DeviceId', this.deviceId);
    return url.href;
  }
  isServerUrl(url) {
    // Jellyfin's ApiClient rejects an empty path. This builds a URL only; no request is sent.
    return new URL(url, globalThis.location?.href).origin === new URL(this.url('System/Info/Public'), globalThis.location?.href).origin;
  }
  async request(path, { method = 'GET', query, body, signal, keepalive = false } = {}) {
    const response = await this.fetcher(this.url(path, query), {
      method, signal, keepalive,
      headers: {
        Authorization: this.authorization(),
        'Content-Type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Jellyfin request failed (${response.status}).`);
    return response.status === 204 ? undefined : response.text().then(text => text ? JSON.parse(text) : undefined);
  }
  browse(parentId, search, startIndex = 0, signal) {
    return this.request(`Users/${this.userId}/Items`, { signal, query: {
      ...(parentId ? { ParentId: parentId } : {}),
      ...(search ? { SearchTerm: search, Recursive: true, MediaTypes: 'Video' } : {}),
      Fields: 'MediaSources', SortBy: 'SortName', SortOrder: 'Ascending',
      StartIndex: startIndex, Limit: 60, EnableTotalRecordCount: true
    } });
  }
}
export function deviceProfile() {
  return {
    Name: 'Multiview H264', MaxStreamingBitrate: 8000000,
    MaxStaticBitrate: 8000000,
    DirectPlayProfiles: [{ Container: 'mp4,m4v', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac,mp3' }],
    TranscodingProfiles: [{ Container: 'ts', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac',
      Protocol: 'hls', Context: 'Streaming', MaxAudioChannels: '2', MinSegments: 2,
      BreakOnNonKeyFrames: false }],
    CodecProfiles: [{ Type: 'Video', Codec: 'h264', Conditions: [
      { Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: true },
      { Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '51', IsRequired: true }
    ] }],
    SubtitleProfiles: []
  };
}
