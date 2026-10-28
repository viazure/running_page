/**
 * Lazy-loaded H.264 MP4 helpers (mediabunny + WebCodecs).
 * Keep this module out of the critical path so normal page load stays light.
 */

export type CanvasMp4Encoder = {
  /** Push one painted canvas frame. Awaits encoder backpressure. */
  addFrame: (timestampSec: number, durationSec: number) => Promise<void>;
  /** Close the video source and finalize the MP4. */
  finish: () => Promise<Blob>;
  /** Cancel without producing a file. */
  cancel: () => Promise<void>;
};

export async function canEncodeAvc(
  width: number,
  height: number,
  bitrate: number,
  frameRate: number
): Promise<boolean> {
  const { canEncodeVideo, Quality } = await import('mediabunny');
  return canEncodeVideo('avc', {
    width,
    height,
    frameRate,
    quality: new Quality({ bitrate }),
  });
}

export async function createCanvasMp4Encoder(
  canvas: HTMLCanvasElement,
  opts: { bitrate: number; frameRate: number }
): Promise<CanvasMp4Encoder> {
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, Quality } =
    await import('mediabunny');

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });
  const source = new CanvasSource(canvas, {
    codec: 'avc',
    quality: new Quality({ bitrate: opts.bitrate }),
    latencyMode: 'realtime',
    keyFrameInterval: 2,
    hardwareAcceleration: 'prefer-hardware',
  });
  output.addVideoTrack(source);
  await output.start();

  let closed = false;
  let canceled = false;

  return {
    addFrame: async (timestampSec, durationSec) => {
      if (closed || canceled) return;
      await source.add(timestampSec, durationSec);
    },
    finish: async () => {
      if (canceled) throw new Error('MP4 encode canceled');
      if (!closed) {
        closed = true;
        source.close();
        await output.finalize();
      }
      const buf = target.buffer;
      if (!buf || buf.byteLength < 64) {
        throw new Error('MP4 encode produced an empty file');
      }
      return new Blob([buf], { type: 'video/mp4' });
    },
    cancel: async () => {
      canceled = true;
      if (closed) return;
      closed = true;
      try {
        source.close();
      } catch {
        /* ignore */
      }
      try {
        await output.cancel();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Transcode an intermediate recording (typically WebM) to H.264 MP4.
 */
export async function convertBlobToAvcMp4(
  blob: Blob,
  bitrate: number
): Promise<Blob> {
  const {
    Input,
    Output,
    Mp4OutputFormat,
    BufferTarget,
    BlobSource,
    ALL_FORMATS,
    Conversion,
    Quality,
  } = await import('mediabunny');

  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });
  const conversion = await Conversion.init({
    input,
    output,
    video: {
      codec: 'avc',
      quality: new Quality({ bitrate }),
      forceTranscode: true,
      hardwareAcceleration: 'prefer-hardware',
    },
    audio: { discard: true },
  });
  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks.map((t) => t.reason).join(', ');
    throw new Error(
      reasons
        ? `Cannot convert to H.264 MP4 (${reasons})`
        : 'Cannot convert to H.264 MP4'
    );
  }
  await conversion.execute();
  const buf = target.buffer;
  if (!buf || buf.byteLength < 64) {
    throw new Error('MP4 conversion produced an empty file');
  }
  return new Blob([buf], { type: 'video/mp4' });
}
