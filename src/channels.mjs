const channels = {
  retail: { label: 'Retail', branch: 'live', family: 'Mainline', game: 'Standard', manifest: '../data/manifest.json' },
  forever: { label: 'Forever beta', branch: 'forever', family: 'Mainline', game: 'Camelot', manifest: '../data/forever/manifest.json' },
};

export const CHANNELS = Object.keys(channels);

export function channelProfile(channel = 'retail') {
  const profile = channels[channel];
  if (!Object.hasOwn(channels, channel)) throw new Error(`Unsupported channel "${channel}". Use retail or forever.`);
  return profile;
}

export function channelManifest(channel = 'retail') {
  return new URL(channelProfile(channel).manifest, import.meta.url);
}

export function matchesChannel(version, channel) {
  channelProfile(channel);
  return channel === 'forever' ? /^1\.60\./.test(version) : Number.parseInt(version, 10) >= 10;
}
