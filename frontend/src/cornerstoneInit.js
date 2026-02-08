/**
 * One-time initialization of Cornerstone and the WADO image loader.
 * Call initCornerstone() before using the DICOM viewer.
 * @module cornerstoneInit
 */

import * as cornerstone from 'cornerstone-core'
import dicomParser from 'dicom-parser'
// Use NoWebWorkers bundle to avoid worker path issues in Vite
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderNoWebWorkers.bundle.min.js'

let initialized = false
let initError = null

/**
 * Initialize Cornerstone and register the WADO-URI image loader.
 * Safe to call multiple times; runs only once.
 * @returns {{ ok: boolean, error?: string }}
 */
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
