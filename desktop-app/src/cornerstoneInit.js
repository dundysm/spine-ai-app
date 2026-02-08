/**
 * One-time initialization of Cornerstone and the WADO image loader.
 */
import * as cornerstone from 'cornerstone-core'
import dicomParser from 'dicom-parser'
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderNoWebWorkers.bundle.min.js'

let initialized = false
let initError = null

export function initCornerstone() {
  if (initError) return { ok: false, error: initError }
  if (initialized) return { ok: true }
  try {
    cornerstoneWADOImageLoader.external.cornerstone = cornerstone
    cornerstoneWADOImageLoader.external.dicomParser = dicomParser
    cornerstone.registerImageLoader(
      'wadouri',
      cornerstoneWADOImageLoader.wadouri.loadImage
    )
    initialized = true
    return { ok: true }
  } catch (e) {
    initError = e?.message || String(e)
    return { ok: false, error: initError }
  }
}

export { cornerstone }
