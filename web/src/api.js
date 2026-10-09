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
  constructor(client, fetcher = globalThis.fetch.bind(globalThis)) {
    this.client = client;
    this.fetcher = fetcher;
    this.userId = client.getCurrentUserId();
    // Separate device identities prevent secondary players replacing the main session.
    this.deviceId = `${client.deviceId()}-multiview-${randomId()}`;
  }
  url(path, query = {}) {
    return this.client.getUrl(path.replace(/^\//, ''), query);
  }
  async request(path, { method = 'GET', query, body, signal, keepalive = false } = {}) {
    const quote = value => String(value).replace(/["\\\r\n]/g, '');
    const response = await this.fetcher(this.url(path, query), {
      method, signal, keepalive,
      headers: {
        Authorization: `MediaBrowser Client="Multiview", Device="Web", DeviceId="${quote(this.deviceId)}", Version="0.1.0", Token="${quote(this.client.accessToken())}"`,
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
