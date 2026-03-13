/**
 * Minimal ISO Base Media File Format (ISOBMFF / MP4) muxer.
 *
 * Takes H.264 encoded chunks and wraps them in a valid .mp4 container
 * with ftyp, moov, and mdat boxes.
 */

// ── Helpers ──

/** Write a big-endian 32-bit unsigned integer into a DataView */
function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, false)
}

/** Write a big-endian 16-bit unsigned integer into a DataView */
function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, false)
}

/** Encode an ASCII string into a Uint8Array */
function asciiBytes(str: string): Uint8Array {
  const arr = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i)
  }
  return arr
}

/** Create a box (atom) with the given 4-character type and payload */
function box(type: string, ...payloads: Uint8Array[]): Uint8Array {
  let payloadSize = 0
  for (const p of payloads) payloadSize += p.length
  const totalSize = 8 + payloadSize
  const result = new Uint8Array(totalSize)
  const view = new DataView(result.buffer, result.byteOffset)
  writeU32(view, 0, totalSize)
  result.set(asciiBytes(type), 4)
  let offset = 8
  for (const p of payloads) {
    result.set(p, offset)
    offset += p.length
  }
  return result
}

/** Create a full box (with version and flags) */
function fullBox(type: string, version: number, flags: number, ...payloads: Uint8Array[]): Uint8Array {
  const versionFlags = new Uint8Array(4)
  const vfView = new DataView(versionFlags.buffer)
  vfView.setUint32(0, (version << 24) | (flags & 0x00ffffff), false)
  return box(type, versionFlags, ...payloads)
}

/** Concatenate multiple Uint8Arrays */
function concat(...arrays: Uint8Array[]): Uint8Array {
  let totalLen = 0
  for (const a of arrays) totalLen += a.length
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const a of arrays) {
    result.set(a, offset)
    offset += a.length
  }
  return result
}

/** Encode a u32 into 4 big-endian bytes */
function u32(value: number): Uint8Array {
  const arr = new Uint8Array(4)
  const view = new DataView(arr.buffer)
  writeU32(view, 0, value)
  return arr
}

/** Encode a u16 into 2 big-endian bytes */
function u16(value: number): Uint8Array {
  const arr = new Uint8Array(2)
  const view = new DataView(arr.buffer)
  writeU16(view, 0, value)
  return arr
}

/** Encode a u8 into 1 byte */
function u8(value: number): Uint8Array {
  return new Uint8Array([value])
}

// ── Public interface ──

export interface EncodedSample {
  data: Uint8Array
  duration: number // in timescale units
  isKeyframe: boolean
}

export interface MP4MuxerOptions {
  width: number
  height: number
  timescale: number // e.g. 90000 or fps
  sps: Uint8Array // Sequence Parameter Set (without start code)
  pps: Uint8Array // Picture Parameter Set (without start code)
}

/**
 * Mux encoded H.264 samples into an MP4 container.
 *
 * Returns a Uint8Array containing the complete .mp4 file.
 */
export function muxMP4(samples: EncodedSample[], options: MP4MuxerOptions): Uint8Array {
  const { width, height, timescale, sps, pps } = options

  // Compute total duration
  let totalDuration = 0
  for (const s of samples) totalDuration += s.duration

  // ── ftyp box ──
  const ftyp = box('ftyp', asciiBytes('isom'), u32(0x200), asciiBytes('isomiso2avc1mp41'))

  // ── mdat box ──
  // Each sample is length-prefixed (4 bytes big-endian length + NALU data)
  let mdatPayloadSize = 0
  for (const s of samples) mdatPayloadSize += 4 + s.data.length

  const mdatHeader = new Uint8Array(8)
  const mdatHeaderView = new DataView(mdatHeader.buffer)
  writeU32(mdatHeaderView, 0, 8 + mdatPayloadSize)
  mdatHeader.set(asciiBytes('mdat'), 4)

  const mdatPayload = new Uint8Array(mdatPayloadSize)
  let mdatOffset = 0
  const sampleOffsets: number[] = []
  const sampleSizes: number[] = []

  // The absolute offset of mdat payload within the file will be computed later
  for (const s of samples) {
    sampleOffsets.push(mdatOffset)
    sampleSizes.push(4 + s.data.length)
    const lenBuf = new DataView(new ArrayBuffer(4))
    lenBuf.setUint32(0, s.data.length, false)
    mdatPayload.set(new Uint8Array(lenBuf.buffer), mdatOffset)
    mdatOffset += 4
    mdatPayload.set(s.data, mdatOffset)
    mdatOffset += s.data.length
  }

  // ── moov box ──

  // mvhd (Movie Header Box)
  const mvhdPayload = new Uint8Array(96)
  const mvhdView = new DataView(mvhdPayload.buffer)
  // version=0, flags=0 already in fullBox
  mvhdView.setUint32(0, 0) // creation_time
  mvhdView.setUint32(4, 0) // modification_time
  mvhdView.setUint32(8, timescale) // timescale
  mvhdView.setUint32(12, totalDuration) // duration
  mvhdView.setUint32(16, 0x00010000) // rate = 1.0 (fixed-point 16.16)
  mvhdView.setUint16(20, 0x0100) // volume = 1.0 (fixed-point 8.8)
  // 10 bytes reserved (22-31)
  // Unity matrix (36 bytes at offset 32)
  const matrixOffset = 32
  mvhdView.setUint32(matrixOffset, 0x00010000) // a = 1.0
  mvhdView.setUint32(matrixOffset + 4, 0) // b
  mvhdView.setUint32(matrixOffset + 8, 0) // u
  mvhdView.setUint32(matrixOffset + 12, 0) // c
  mvhdView.setUint32(matrixOffset + 16, 0x00010000) // d = 1.0
  mvhdView.setUint32(matrixOffset + 20, 0) // v
  mvhdView.setUint32(matrixOffset + 24, 0) // tx
  mvhdView.setUint32(matrixOffset + 28, 0) // ty
  mvhdView.setUint32(matrixOffset + 32, 0x40000000) // w = 1.0
  // 6 * u32 pre_defined (68-91)
  mvhdView.setUint32(92, 2) // next_track_ID
  const mvhd = fullBox('mvhd', 0, 0, mvhdPayload)

  // ── trak box ──

  // tkhd (Track Header Box)
  const tkhdPayload = new Uint8Array(80)
  const tkhdView = new DataView(tkhdPayload.buffer)
  tkhdView.setUint32(0, 0) // creation_time
  tkhdView.setUint32(4, 0) // modification_time
  tkhdView.setUint32(8, 1) // track_ID
  // 4 bytes reserved (12-15)
  tkhdView.setUint32(16, totalDuration) // duration
  // 8 bytes reserved (20-27)
  // layer (28-29) = 0, alternate_group (30-31) = 0
  // volume (32-33) = 0 (video track)
  // 2 bytes reserved (34-35)
  // Unity matrix
  const tkMatrixOff = 36
  tkhdView.setUint32(tkMatrixOff, 0x00010000)
  tkhdView.setUint32(tkMatrixOff + 16, 0x00010000)
  tkhdView.setUint32(tkMatrixOff + 32, 0x40000000)
  // width and height as 16.16 fixed-point
  tkhdView.setUint32(72, width << 16)
  tkhdView.setUint32(76, height << 16)
  const tkhd = fullBox('tkhd', 0, 3, tkhdPayload) // flags=3 (track_enabled | track_in_movie)

  // mdhd (Media Header Box)
  const mdhdPayload = new Uint8Array(20)
  const mdhdView = new DataView(mdhdPayload.buffer)
  mdhdView.setUint32(0, 0) // creation_time
  mdhdView.setUint32(4, 0) // modification_time
  mdhdView.setUint32(8, timescale) // timescale
  mdhdView.setUint32(12, totalDuration) // duration
  mdhdView.setUint16(16, 0x55c4) // language = 'und'
  const mdhd = fullBox('mdhd', 0, 0, mdhdPayload)

  // hdlr (Handler Reference Box)
  const hdlrPayload = concat(
    u32(0), // pre_defined
    asciiBytes('vide'), // handler_type
    new Uint8Array(12), // reserved
    asciiBytes('VideoHandler'),
    u8(0), // null terminator
  )
  const hdlr = fullBox('hdlr', 0, 0, hdlrPayload)

  // vmhd (Video Media Header Box)
  const vmhdPayload = new Uint8Array(8) // graphicsmode(2) + opcolor(6)
  const vmhd = fullBox('vmhd', 0, 1, vmhdPayload) // flags=1

  // dinf > dref
  const drefEntry = fullBox('url ', 0, 1, new Uint8Array(0)) // self-contained flag
  const dref = fullBox(
    'dref',
    0,
    0,
    u32(1), // entry_count
    drefEntry,
  )
  const dinf = box('dinf', dref)

  // stbl (Sample Table Box)

  // stsd (Sample Description Box)
  // avc1 sample entry
  const avcCPayload = concat(
    u8(1), // configurationVersion
    sps.length > 1 ? u8(sps[1]!) : u8(0x42), // AVCProfileIndication
    sps.length > 2 ? u8(sps[2]!) : u8(0x00), // profile_compatibility
    sps.length > 3 ? u8(sps[3]!) : u8(0x1e), // AVCLevelIndication
    u8(0xff), // lengthSizeMinusOne = 3 (4 bytes)
    u8(0xe1), // numOfSequenceParameterSets = 1
    u16(sps.length),
    sps,
    u8(1), // numOfPictureParameterSets = 1
    u16(pps.length),
    pps,
  )
  const avcC = box('avcC', avcCPayload)

  const avc1Payload = concat(
    new Uint8Array(6), // reserved
    u16(1), // data_reference_index
    new Uint8Array(16), // pre_defined + reserved
    u16(width),
    u16(height),
    u32(0x00480000), // horizresolution = 72 dpi
    u32(0x00480000), // vertresolution = 72 dpi
    u32(0), // reserved
    u16(1), // frame_count
    new Uint8Array(32), // compressorname (32 bytes)
    u16(0x0018), // depth = 24
    u16(0xffff), // pre_defined = -1
    avcC,
  )
  const avc1 = box('avc1', avc1Payload)

  const stsd = fullBox(
    'stsd',
    0,
    0,
    u32(1), // entry_count
    avc1,
  )

  // stts (Decoding Time to Sample Box)
  // Group consecutive samples with the same duration
  const sttsEntries: Array<{ count: number; delta: number }> = []
  for (const s of samples) {
    const last = sttsEntries[sttsEntries.length - 1]
    if (last && last.delta === s.duration) {
      last.count++
    } else {
      sttsEntries.push({ count: 1, delta: s.duration })
    }
  }
  const sttsPayload = new Uint8Array(4 + sttsEntries.length * 8)
  const sttsView = new DataView(sttsPayload.buffer)
  sttsView.setUint32(0, sttsEntries.length)
  for (let i = 0; i < sttsEntries.length; i++) {
    sttsView.setUint32(4 + i * 8, sttsEntries[i]!.count)
    sttsView.setUint32(4 + i * 8 + 4, sttsEntries[i]!.delta)
  }
  const stts = fullBox('stts', 0, 0, sttsPayload)

  // stsc (Sample to Chunk Box) — all samples in one chunk
  const stscPayload = new Uint8Array(16)
  const stscView = new DataView(stscPayload.buffer)
  stscView.setUint32(0, 1) // entry_count
  stscView.setUint32(4, 1) // first_chunk
  stscView.setUint32(8, samples.length) // samples_per_chunk
  stscView.setUint32(12, 1) // sample_description_index
  const stsc = fullBox('stsc', 0, 0, stscPayload)

  // stsz (Sample Size Box)
  const stszPayload = new Uint8Array(8 + samples.length * 4)
  const stszView = new DataView(stszPayload.buffer)
  stszView.setUint32(0, 0) // sample_size = 0 (variable)
  stszView.setUint32(4, samples.length) // sample_count
  for (let i = 0; i < samples.length; i++) {
    stszView.setUint32(8 + i * 4, sampleSizes[i]!)
  }
  const stsz = fullBox('stsz', 0, 0, stszPayload)

  // stco (Chunk Offset Box) — placeholder, will be patched
  const stcoPayload = new Uint8Array(8)
  const stcoView = new DataView(stcoPayload.buffer)
  stcoView.setUint32(0, 1) // entry_count
  // chunk_offset at index 4 — patched below
  stcoView.setUint32(4, 0) // placeholder
  const stco = fullBox('stco', 0, 0, stcoPayload)

  // stss (Sync Sample Box) — keyframe indices
  const keyframeIndices: number[] = []
  for (let i = 0; i < samples.length; i++) {
    if (samples[i]!.isKeyframe) keyframeIndices.push(i + 1) // 1-based
  }
  let stss: Uint8Array | null = null
  if (keyframeIndices.length > 0 && keyframeIndices.length < samples.length) {
    const stssPayload = new Uint8Array(4 + keyframeIndices.length * 4)
    const stssView = new DataView(stssPayload.buffer)
    stssView.setUint32(0, keyframeIndices.length)
    for (let i = 0; i < keyframeIndices.length; i++) {
      stssView.setUint32(4 + i * 4, keyframeIndices[i]!)
    }
    stss = fullBox('stss', 0, 0, stssPayload)
  }

  const stblChildren = stss ? [stsd, stts, stsc, stsz, stco, stss] : [stsd, stts, stsc, stsz, stco]
  const stbl = box('stbl', ...stblChildren)

  const minf = box('minf', vmhd, dinf, stbl)
  const mdia = box('mdia', mdhd, hdlr, minf)
  const trak = box('trak', tkhd, mdia)
  const moov = box('moov', mvhd, trak)

  // ── Assemble file and patch stco ──
  // File layout: ftyp | moov | mdat
  const mdatAbsoluteOffset = ftyp.length + moov.length + 8 // +8 for mdat header

  // Find and patch stco chunk_offset in the assembled moov
  // stco structure: box header (8) + fullbox version+flags (4) + entry_count (4) + offset (4)
  // We need to find the stco box in moov and patch the offset
  patchStco(moov, mdatAbsoluteOffset)

  return concat(ftyp, moov, mdatHeader, mdatPayload)
}

/** Find and patch the stco box's chunk_offset inside a moov box */
function patchStco(moovData: Uint8Array, mdatPayloadOffset: number): void {
  const view = new DataView(moovData.buffer, moovData.byteOffset, moovData.byteLength)
  // Search for 'stco' marker
  for (let i = 0; i < moovData.length - 4; i++) {
    if (
      moovData[i] === 0x73 && // s
      moovData[i + 1] === 0x74 && // t
      moovData[i + 2] === 0x63 && // c
      moovData[i + 3] === 0x6f // o
    ) {
      // Found stco type field at offset i
      // After type: version+flags (4) + entry_count (4) + first chunk_offset (4)
      const chunkOffsetPos = i + 4 + 4 + 4
      if (chunkOffsetPos + 4 <= moovData.length) {
        view.setUint32(chunkOffsetPos, mdatPayloadOffset)
      }
      return
    }
  }
}
